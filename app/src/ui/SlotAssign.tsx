import { useEffect, useRef, useState } from 'react';
import { sameSize } from '../core/template';
import { activeTemplate, useStore } from '../store';
import type { Layout } from '../core/layout';

/** 시트별 칸 배정 보드. 채우기 점은 엑셀처럼 연속 범위를 배정한다. */
export function SlotAssign({ layout, sheets }: { layout: Layout; sheets: number }) {
  const templates = useStore((s) => s.templates);
  const slotAssignment = useStore((s) => s.slotAssignment);
  const sheetSlotAssignment = useStore((s) => s.sheetSlotAssignment);
  const assignSheetSlot = useStore((s) => s.assignSheetSlot);
  const assignSheetSlotRange = useStore((s) => s.assignSheetSlotRange);
  const duplicateComboSheet = useStore((s) => s.duplicateComboSheet);
  const removeComboSheet = useStore((s) => s.removeComboSheet);
  const patch = useStore((s) => s.patch);
  const active = useStore(activeTemplate);
  const [openSlot, setOpenSlot] = useState<number | null>(null);
  const dragRef = useRef<{ source: number; current: number; templateId: string | null } | null>(null);
  const [drag, setDrag] = useState<{ source: number; current: number; templateId: string | null } | null>(null);

  useEffect(() => {
    function finish() {
      const current = dragRef.current;
      if (!current) return;
      assignSheetSlotRange(current.source, current.current, current.templateId);
      dragRef.current = null;
      setDrag(null);
    }
    window.addEventListener('pointerup', finish);
    return () => window.removeEventListener('pointerup', finish);
  }, [assignSheetSlotRange]);

  if (!active || layout.count === 0) return null;
  const activeId = active.id;
  const group = templates.filter(
    (t) => sameSize(t.insert, active.insert) && t.repeat.mode === 'single' && t.kind !== 'notebook',
  );
  if (group.length <= 1) {
    return <p className="slot-assign-empty">같은 규격의 양식이 하나 더 있어야 칸마다 다르게 넣을 수 있습니다.</p>;
  }

  const globalOf = (sheet: number, slot: number) => sheet * layout.count + slot;
  const idAt = (sheet: number, slot: number) => {
    const global = globalOf(sheet, slot);
    return Object.prototype.hasOwnProperty.call(sheetSlotAssignment, global)
      ? sheetSlotAssignment[global] || active.id
      : slotAssignment[slot] || active.id;
  };
  const hueOf = (id: string) => (group.findIndex((t) => t.id === id) * 67) % 360;
  const colorOf = (id: string) => `hsl(${hueOf(id)} 42% 45%)`;
  const locationOf = (slot: number) => `${Math.floor(slot / layout.cols) + 1}-${String.fromCharCode(65 + (slot % layout.cols))}`;
  const previewIdAt = (global: number) =>
    drag && global >= Math.min(drag.source, drag.current) && global <= Math.max(drag.source, drag.current)
      ? drag.templateId || activeId
      : idAt(Math.floor(global / layout.count), global % layout.count);

  function beginFill(global: number, templateId: string, e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    const next = { source: global, current: global, templateId: templateId === activeId ? null : templateId };
    dragRef.current = next;
    setDrag(next);
    setOpenSlot(null);
  }
  function extendFill(global: number) {
    const current = dragRef.current;
    if (!current) return;
    const next = { ...current, current: global };
    dragRef.current = next;
    setDrag(next);
    // 마지막 카드에 닿으면 다음 시트를 먼저 열어 끊지 않고 계속 끌 수 있다.
    if (global === sheets * layout.count - 1) patch({ comboSheets: sheets + 1 });
  }

  const counts = group.map((template) => ({
    template,
    count: Array.from({ length: sheets * layout.count }, (_, global) => previewIdAt(global)).filter((id) => id === template.id).length,
  }));

  return (
    <div className="slot-assign">
      <div className="slot-chips">
        {counts.filter((item) => item.count > 0).map(({ template, count }) => (
          <span key={template.id} className="slot-chip"><span className="slot-chip-dot" style={{ background: colorOf(template.id) }} />{template.name}<span className="slot-chip-count">· {count}칸</span></span>
        ))}
      </div>
      <div className="slot-sheets">
        {Array.from({ length: sheets }, (_, sheet) => (
          <section className="slot-sheet" key={sheet}>
            <div className="slot-sheet-heading">
              <div className="slot-sheet-title">시트 {sheet + 1}</div>
              <div className="slot-sheet-actions">
                <button onClick={() => duplicateComboSheet(sheet, layout.count)} title={`시트 ${sheet + 1} 복사`} aria-label={`시트 ${sheet + 1} 복사`}>
                  <CopyIcon />
                </button>
                <button onClick={() => removeComboSheet(sheet, layout.count)} disabled={sheets <= 1} title={sheets <= 1 ? '마지막 시트는 지울 수 없습니다' : `시트 ${sheet + 1} 삭제`} aria-label={`시트 ${sheet + 1} 삭제`}>
                  <TrashIcon />
                </button>
              </div>
            </div>
            <div className="slot-assign-grid" style={{ gridTemplateColumns: `repeat(${layout.cols}, 1fr)` }}>
              {Array.from({ length: layout.count }, (_, slot) => {
                const global = globalOf(sheet, slot);
                const id = previewIdAt(global);
                const template = group.find((t) => t.id === id) ?? active;
                const isOpen = openSlot === global;
                return (
                  <div key={slot} className="slot-cell" title={`${sheet + 1}번 시트 ${locationOf(slot)} 칸`} onPointerEnter={() => extendFill(global)}>
                    <button className="slot-card" style={{ background: colorOf(template.id) }} onClick={() => setOpenSlot((current) => current === global ? null : global)} aria-expanded={isOpen} aria-haspopup="listbox">
                      <span className="slot-card-location">{locationOf(slot)}</span><span className="slot-card-name">{template.name}</span>
                    </button>
                    <span className="slot-fill-handle" onPointerDown={(e) => beginFill(global, idAt(sheet, slot), e)} title="끌어서 연속 채우기" />
                    {isOpen && <div className="slot-options" role="listbox" aria-label={`${locationOf(slot)} 칸 양식 선택`}>
                      {group.map((option) => <button key={option.id} className={option.id === template.id ? 'on' : undefined} role="option" aria-selected={option.id === template.id} onClick={() => { assignSheetSlot(global, option.id === activeId ? null : option.id); setOpenSlot(null); }}><span style={{ background: colorOf(option.id) }} />{option.name}{option.id === activeId && <small>기본</small>}</button>)}
                    </div>}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
      <p className="slot-assign-hint">카드 오른쪽 아래 점을 끌면 다음 칸·다음 시트까지 같은 양식으로 채웁니다.</p>
    </div>
  );
}

function CopyIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="8" y="8" width="11" height="11" rx="1.5" /><path d="M5 15V5.5A1.5 1.5 0 0 1 6.5 4H15" /></svg>;
}

function TrashIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M5 7h14M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M7 7l1 12h8l1-12" /></svg>;
}
