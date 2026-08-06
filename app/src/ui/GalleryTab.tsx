import { useState } from 'react';
import { groupBySize, outsideCount, sizeLabel, type Template } from '../core/template';
import { INSERT_PRESETS, useStore } from '../store';
import { insertFromPreset } from '../core/template';
import { InsertView } from './InsertView';

/**
 * 양식 관리 — 만들어둔 속지들을 한눈에 본다.
 *
 * **크기별로 묶어서 보여준다.** 양식이 크기를 소유하는 것이 아니라 크기를
 * 속성으로 가지므로(core/template), 여기서는 그 속성으로 줄을 세울 뿐이다.
 * 같은 M6 양식이 열 개여도 된다.
 *
 * 썸네일은 편집 화면과 **같은 InsertView**를 작게 그린 것이다. 따로 이미지를
 * 만들지 않는다 — 화면이 이미 SVG로 그리고 있어서 그대로 미리보기가 된다.
 * 양식이 수십 개가 되면 SVG를 수십 장 그리게 되는데, 느려지면 그때 손본다.
 */
export function GalleryTab({ onEdit }: { onEdit: () => void }) {
  const templates = useStore((s) => s.templates);
  const activeId = useStore((s) => s.activeId);
  const addTemplate = useStore((s) => s.addTemplate);

  const groups = groupBySize(templates);

  return (
    <div className="gallery">
      <div className="gallery-bar">
        <button className="primary" onClick={() => addTemplate()}>
          + 새 양식
        </button>
        <span className="gallery-hint">
          양식 {templates.length}개 · 클릭하면 그 양식으로 넘어갑니다
        </span>
      </div>

      <div className="gallery-body">
        {groups.map((g) => (
          <section key={`${g.width}x${g.height}`} className="gallery-group">
            <h2>
              {g.label}
              <span className="count">{g.templates.length}개</span>
            </h2>
            <div className="gallery-grid">
              {g.templates.map((t) => (
                <Card key={t.id} template={t} active={t.id === activeId} onEdit={onEdit} />
              ))}
              {/* 이 크기로 하나 더. 규격을 다시 고르지 않아도 된다. */}
              <button
                className="card card-add"
                onClick={() => addTemplate({ ...g.templates[0].insert })}
                title={`${g.label} 규격으로 새 양식`}
              >
                +
              </button>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

/**
 * 양식 하나.
 *
 * 누르면 그 양식으로 넘어가 편집 화면이 열린다. 관리 동작(이름·복제·삭제)은
 * 카드 아래 줄에 둔다 — 썸네일을 가리지 않아야 무엇인지 보인다.
 */
function Card({
  template,
  active,
  onEdit,
}: {
  template: Template;
  active: boolean;
  onEdit: () => void;
}) {
  const selectTemplate = useStore((s) => s.selectTemplate);
  const renameTemplate = useStore((s) => s.renameTemplate);
  const removeTemplate = useStore((s) => s.removeTemplate);
  const canRemove = useStore((s) => s.templates.length > 1);
  const [renaming, setRenaming] = useState(false);
  const [copying, setCopying] = useState(false);

  const t = template;
  const objects = t.objects.present;

  return (
    <div className={`card ${active ? 'on' : ''}`}>
      <button
        className="card-thumb"
        onClick={() => {
          selectTemplate(t.id);
          onEdit();
        }}
        title="이 양식 편집하기"
      >
        {/*
          속지 비율 그대로 그린다. viewBox가 mm라 크기만 줄이면 되고,
          내용은 편집 화면과 정확히 같은 그림이다.
        */}
        <svg viewBox={`0 0 ${t.insert.width} ${t.insert.height}`} preserveAspectRatio="xMidYMid meet">
          <rect x={0} y={0} width={t.insert.width} height={t.insert.height} className="sheet-bg" />
          <InsertView
            insert={t.insert}
            grid={t.dotGrid}
            objects={objects}
            safeZoneWidth={t.insert.punch.safeZoneWidth}
            mode="print"
          />
        </svg>
      </button>

      <div className="card-foot">
        {renaming ? (
          <input
            className="card-name-input"
            defaultValue={t.name}
            autoFocus
            onBlur={(e) => {
              renameTemplate(t.id, e.target.value);
              setRenaming(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') setRenaming(false);
            }}
          />
        ) : (
          <button className="card-name" onDoubleClick={() => setRenaming(true)} title="더블클릭해서 이름 바꾸기">
            {t.name}
          </button>
        )}

        <span className="card-meta">그린 것 {objects.length}개</span>

        <div className="card-actions">
          <button className="ghost" onClick={() => setRenaming(true)} title="이름 바꾸기">
            이름
          </button>
          <button className="ghost" onClick={() => setCopying(true)} title="복제 — 규격을 바꿔서도 됩니다">
            복제
          </button>
          <button
            className="ghost"
            onClick={() => removeTemplate(t.id)}
            disabled={!canRemove}
            title={canRemove ? '삭제' : '마지막 양식은 지울 수 없습니다'}
          >
            삭제
          </button>
        </div>
      </div>

      {copying && <CopyDialog template={t} onClose={() => setCopying(false)} />}
    </div>
  );
}

/**
 * 복제 — 규격을 바꿔서도 복제할 수 있다.
 *
 * 80×125로 만든 것을 75×125로도 뽑고 싶을 때 쓴다. **원본은 손대지 않는다.**
 *
 * 규격이 바뀌어도 격자 간격도 글자 크기도 선 굵기도 변하지 않는다. 비례로 줄이면
 * 5mm 격자가 4.69mm가 되어 격자의 의미가 사라진다. 대신 새 크기 밖으로 나가는
 * 것이 몇 개인지 **미리 세어서 알려준다** — 지우지도 옮기지도 않는다.
 */
function CopyDialog({ template, onClose }: { template: Template; onClose: () => void }) {
  const copyTemplate = useStore((s) => s.copyTemplate);
  const [presetId, setPresetId] = useState(template.insert.presetId);
  const [width, setWidth] = useState(template.insert.width);
  const [height, setHeight] = useState(template.insert.height);

  const changed = width !== template.insert.width || height !== template.insert.height;
  const lost = changed ? outsideCount(template.objects.present, { width, height }) : 0;

  function pickPreset(id: string) {
    setPresetId(id);
    const next = insertFromPreset(id, template.insert);
    setWidth(next.width);
    setHeight(next.height);
  }

  return (
    <div className="card-dialog">
      <label>
        규격
        <select value={presetId} onChange={(e) => pickPreset(e.target.value)}>
          {INSERT_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
          <option value="custom">사용자 지정</option>
        </select>
      </label>

      <div className="card-dialog-size">
        <input
          type="number"
          value={width}
          min={10}
          step={1}
          onChange={(e) => {
            setWidth(Number(e.target.value));
            setPresetId('custom');
          }}
        />
        <span>×</span>
        <input
          type="number"
          value={height}
          min={10}
          step={1}
          onChange={(e) => {
            setHeight(Number(e.target.value));
            setPresetId('custom');
          }}
        />
        <span>mm</span>
      </div>

      {lost > 0 && (
        <p className="card-dialog-warn">
          객체 <b>{lost}개</b>가 새 크기 밖으로 나갑니다. 지워지지는 않고 인쇄에서만 잘립니다.
        </p>
      )}

      <div className="card-dialog-actions">
        <button onClick={onClose}>취소</button>
        <button
          className="primary"
          onClick={() => {
            copyTemplate(
              template.id,
              changed || presetId !== template.insert.presetId
                ? { presetId, width, height, punch: { ...template.insert.punch } }
                : undefined,
            );
            onClose();
          }}
        >
          복제
        </button>
      </div>
    </div>
  );
}

/** 갤러리 머리글에 쓰는 이름. store 밖에서도 같은 규칙으로 부른다. */
export { sizeLabel };
