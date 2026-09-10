import { useEffect, useRef, useState } from 'react';
import { sameSize } from '../core/template';
import { activeTemplate, useStore } from '../store';
import type { Layout } from '../core/layout';

/** 시트별 칸 배정 보드. 채우기 점은 엑셀처럼 연속 범위를 배정한다. */
export function SlotAssign({
  layout,
  sheets,
  beforeSheetChange,
}: {
  layout: Layout;
  sheets: number;
  beforeSheetChange?: () => void;
}) {
  const templates = useStore((s) => s.templates);
  const slotAssignment = useStore((s) => s.slotAssignment);
  const sheetSlotAssignment = useStore((s) => s.sheetSlotAssignment);
  const assignSheetSlot = useStore((s) => s.assignSheetSlot);
  const assignSheetSlotRange = useStore((s) => s.assignSheetSlotRange);
  const duplicateComboSheet = useStore((s) => s.duplicateComboSheet);
  const removeComboSheet = useStore((s) => s.removeComboSheet);
  const patch = useStore((s) => s.patch);
  const active = useStore(activeTemplate);
  type Address = { sheet: number; slot: number };
  type Fill = { source: Address; current: Address; templateId: string | null; pointerId: number };
  const [openSlot, setOpenSlot] = useState<Address | null>(null);
  const dragRef = useRef<Fill | null>(null);
  const [drag, setDrag] = useState<Fill | null>(null);

  useEffect(() => {
    setOpenSlot(null);
  }, [layout.count, sheets]);

  if (!active || layout.count === 0) return null;
  const activeId = active.id;
  const group = templates.filter(
    (t) => sameSize(t.insert, active.insert) && t.repeat.mode === 'single' && t.kind !== 'notebook',
  );
  if (group.length <= 1) {
    return (
      <p className="slot-assign-empty">
        같은 규격의 양식이 하나 더 있어야 칸마다 다르게 넣을 수 있습니다.
        <br />
        지금은 모든 칸에 <b>{active.name}</b>이 들어갑니다.
      </p>
    );
  }

  const idAt = (sheet: number, slot: number) => {
    return Object.prototype.hasOwnProperty.call(sheetSlotAssignment[sheet] ?? {}, slot)
      ? sheetSlotAssignment[sheet][slot] || active.id
      : slotAssignment[slot] || active.id;
  };
  const hueOf = (id: string) => (group.findIndex((t) => t.id === id) * 67) % 360;
  const colorOf = (id: string) => `hsl(${hueOf(id)} 42% 45%)`;
  const locationOf = (slot: number) => `${Math.floor(slot / layout.cols) + 1}-${String.fromCharCode(65 + (slot % layout.cols))}`;
  const linear = ({ sheet, slot }: Address) => sheet * layout.count + slot;
  const previewIdAt = (sheet: number, slot: number) => {
    const address = linear({ sheet, slot });
    return drag && address >= Math.min(linear(drag.source), linear(drag.current)) && address <= Math.max(linear(drag.source), linear(drag.current))
      ? drag.templateId || activeId
      : idAt(sheet, slot);
  };

  function beginFill(address: Address, templateId: string, e: React.PointerEvent<HTMLSpanElement>) {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const next = {
      source: address,
      current: address,
      templateId: templateId === activeId ? null : templateId,
      pointerId: e.pointerId,
    };
    dragRef.current = next;
    setDrag(next);
    setOpenSlot(null);
  }
  function extendFill(address: Address) {
    const current = dragRef.current;
    if (!current) return;
    const next = { ...current, current: address };
    dragRef.current = next;
    setDrag(next);
    // 마지막 카드에 닿으면 다음 시트를 먼저 열어 끊지 않고 계속 끌 수 있다.
    if (address.sheet === sheets - 1 && address.slot === layout.count - 1) patch({ comboSheets: sheets + 1 });
  }
  function moveFill(e: React.PointerEvent<HTMLSpanElement>) {
    const current = dragRef.current;
    if (!current || current.pointerId !== e.pointerId) return;
    const cell = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-sheet-slot]');
    if (!cell) return;
    extendFill({ sheet: Number(cell.dataset.sheet), slot: Number(cell.dataset.slot) });
  }
  function finishFill(e: React.PointerEvent<HTMLSpanElement>) {
    const current = dragRef.current;
    if (!current || current.pointerId !== e.pointerId) return;
    assignSheetSlotRange(current.source, current.current, layout.count, current.templateId);
    dragRef.current = null;
    setDrag(null);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  }

  const counts = group.map((template) => ({
    template,
    count: Array.from({ length: sheets }, (_, sheet) =>
      Array.from({ length: layout.count }, (_, slot) => previewIdAt(sheet, slot)),
    ).flat().filter((id) => id === template.id).length,
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
                <button onClick={() => { beforeSheetChange?.(); setOpenSlot(null); duplicateComboSheet(sheet); }} title={`시트 ${sheet + 1} 복사`} aria-label={`시트 ${sheet + 1} 복사`}>
                  <CopyIcon />
                </button>
                <button onClick={() => { beforeSheetChange?.(); setOpenSlot(null); removeComboSheet(sheet); }} disabled={sheets <= 1} title={sheets <= 1 ? '마지막 시트는 지울 수 없습니다' : `시트 ${sheet + 1} 삭제`} aria-label={`시트 ${sheet + 1} 삭제`}>
                  <TrashIcon />
                </button>
              </div>
            </div>
            <div className="slot-assign-grid" style={{ gridTemplateColumns: `repeat(${layout.cols}, 1fr)` }}>
              {Array.from({ length: layout.count }, (_, slot) => {
                const address = { sheet, slot };
                const id = previewIdAt(sheet, slot);
                const template = group.find((t) => t.id === id) ?? active;
                const isOpen = openSlot?.sheet === sheet && openSlot.slot === slot;
                return (
                  <div key={slot} className="slot-cell" data-sheet-slot data-sheet={sheet} data-slot={slot} title={`${sheet + 1}번 시트 ${locationOf(slot)} 칸`} onPointerEnter={() => extendFill(address)}>
                    <button className="slot-card" style={{ background: colorOf(template.id) }} onClick={() => setOpenSlot((current) => current?.sheet === sheet && current.slot === slot ? null : address)} aria-expanded={isOpen} aria-haspopup="listbox">
                      <span className="slot-card-location">{locationOf(slot)}</span><span className="slot-card-name">{template.name}</span>
                    </button>
                    <span className="slot-fill-handle" onPointerDown={(e) => beginFill(address, idAt(sheet, slot), e)} onPointerMove={moveFill} onPointerUp={finishFill} onPointerCancel={finishFill} title="끌어서 연속 채우기" />
                    {isOpen && <div className="slot-options" role="listbox" aria-label={`${locationOf(slot)} 칸 양식 선택`}>
                      {group.map((option) => <button key={option.id} className={option.id === template.id ? 'on' : undefined} role="option" aria-selected={option.id === template.id} onClick={() => { assignSheetSlot(sheet, slot, option.id === activeId ? null : option.id); setOpenSlot(null); }}><span style={{ background: colorOf(option.id) }} />{option.name}{option.id === activeId && <small>기본</small>}</button>)}
                    </div>}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
      <p className="slot-assign-hint">
        카드 오른쪽 아래 점을 끌면 다음 칸·다음 시트까지 같은 양식으로 채웁니다.
        같은 규격의 양식만 섞을 수 있습니다.
      </p>
    </div>
  );
}

function CopyIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="8" y="8" width="11" height="11" rx="1.5" /><path d="M5 15V5.5A1.5 1.5 0 0 1 6.5 4H15" /></svg>;
}

function TrashIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M5 7h14M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M7 7l1 12h8l1-12" /></svg>;
}
