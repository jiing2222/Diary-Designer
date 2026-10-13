import { useState } from 'react';
import { useStore } from '../store';
import { DIARY_COLORS, DIARY_PRESETS, diarySizeLabel, type Diary } from '../core/diary';
import { worksUsingDiary } from '../core/library';
import { suggestGroupGap } from '../core/punch';
import { findInsertPreset } from '../core/presets';
import type { Mm } from '../core/units';
import { PunchGuide } from './PunchGuide';
import { Num, Row } from './PagePanel';

/**
 * Library → Diaries(리뉴얼 7-2, 세부계획 B ‘Library 화면 시안’ · 기본계획 7장).
 *
 * 왼쪽은 다이어리 목록(색 점, ★기본)과 ‘+ 추가’, 가운데는 고른 다이어리의 이름·색·실측 크기·구멍,
 * 오른쪽은 속지·구멍 미리보기. 다이어리는 **종이 치수**를 맡는다 — 크기를 바꾸면 그 다이어리를 쓰는
 * 작업이 모두 바뀐다. 쓰는 작업이 없을 때만 지울 수 있다(휴지통 포함, 2026-10-12 결정).
 */
export function Diaries() {
  const diaries = useStore((s) => s.diaries);
  const works = useStore((s) => s.works);
  const defaultId = useStore((s) => s.defaultDiaryId);
  const addDiary = useStore((s) => s.addDiary);
  const [picked, setPicked] = useState<string | 'new' | null>(null);
  const current = picked === 'new' ? null : (diaries.find((d) => d.id === picked) ?? diaries[0] ?? null);
  const adding = picked === 'new' || diaries.length === 0;

  return (
    <div className="library-projects">
      <aside className="projects-panel" aria-label="다이어리 목록">
        <h2>Diaries</h2>
        {diaries.map((d) => (
          <button
            key={d.id}
            className={`project-filter ${!adding && current?.id === d.id ? 'on' : ''}`}
            onClick={() => setPicked(d.id)}
            title={diarySizeLabel(d)}
          >
            <span className="filter-name">
              <span className="diary-dot" style={{ background: d.color }} />
              {d.name}
            </span>
            <span className="filter-count">{d.id === defaultId ? '★' : worksUsingDiary(works, d.id)}</span>
          </button>
        ))}
        <button className={`project-filter ${adding ? 'on' : ''}`} onClick={() => setPicked('new')}>
          + 다이어리 추가
        </button>
      </aside>
      <div className="library-pane projects-content">
        {adding ? (
          <>
            <h2>다이어리 추가</h2>
            <DiaryPicker
              submitLabel="추가"
              onSubmit={(presetId, name, size) => setPicked(addDiary(presetId, name, size))}
            />
          </>
        ) : (
          current && <DiaryEditor key={current.id} diary={current} />
        )}
      </div>
    </div>
  );
}

/**
 * 규격 고르기 — 규격 타일(3단접이는 페이지 종류라 빠진다) → 이름 → 실측 가로·세로. Diaries의 ‘+ 추가’와
 * 첫 다이어리 온보딩이 같이 쓴다. 고친 크기가 ±10mm 안이면 그 규격으로 인식해 보여준다.
 */
export function DiaryPicker({
  submitLabel,
  onSubmit,
}: {
  submitLabel: string;
  onSubmit: (presetId: string, name: string, size: { width: Mm; height: Mm }) => void;
}) {
  const [presetId, setPresetId] = useState('M6');
  const preset = findInsertPreset(presetId) ?? DIARY_PRESETS[0];
  const [name, setName] = useState(preset.name);
  const [nameTouched, setNameTouched] = useState(false);
  const [width, setWidth] = useState<Mm>(preset.width);
  const [height, setHeight] = useState<Mm>(preset.height);

  const pick = (id: string) => {
    const p = findInsertPreset(id);
    if (!p) return;
    setPresetId(id);
    setWidth(p.width);
    setHeight(p.height);
    // 이름을 직접 쓰지 않았으면 규격 이름을 따라간다.
    if (!nameTouched) setName(p.name);
  };

  return (
    <form
      className="diary-picker"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(presetId, name, { width, height });
      }}
    >
      <div className="diary-preset-tiles">
        {DIARY_PRESETS.map((p) => (
          <button
            type="button"
            key={p.id}
            className={`diary-preset-tile ${presetId === p.id ? 'on' : ''}`}
            onClick={() => pick(p.id)}
          >
            <span className="diary-preset-shape" style={{ aspectRatio: `${p.width} / ${p.height}` }} />
            <b>{p.name}</b>
            <span className="muted">
              {p.width}×{p.height}
            </span>
          </button>
        ))}
      </div>
      <Row label="이름">
        <input
          className="diary-name-input"
          value={name}
          maxLength={40}
          onChange={(e) => {
            setName(e.target.value);
            setNameTouched(true);
          }}
        />
      </Row>
      <Row label="가로" hint="자로 잰 속지 가로">
        <Num value={width} min={30} max={400} step={0.5} onChange={setWidth} />
      </Row>
      <Row label="세로" hint="자로 잰 속지 세로">
        <Num value={height} min={30} max={400} step={0.5} onChange={setHeight} />
      </Row>
      <p className="tool-panel-note">인식한 규격: {diarySizeLabel({ width, height })}</p>
      <button className="primary" type="submit" disabled={!name.trim()}>
        {submitLabel}
      </button>
    </form>
  );
}

/** 고른 다이어리 고치기 — 이름·색·크기·구멍, 기본으로 정하기, 지우기. 오른쪽에 미리보기. */
function DiaryEditor({ diary }: { diary: Diary }) {
  const works = useStore((s) => s.works);
  const defaultId = useStore((s) => s.defaultDiaryId);
  const patchDiary = useStore((s) => s.patchDiary);
  const patchPunch = useStore((s) => s.patchDiaryPunch);
  const setDefault = useStore((s) => s.setDefaultDiary);
  const removeDiary = useStore((s) => s.removeDiary);
  const [name, setName] = useState(diary.name);
  const used = worksUsingDiary(works, diary.id);
  const punch = diary.punch;

  return (
    <div className="diary-editor">
      <div className="diary-form">
        <div className="library-head">
          <h2>
            <span className="diary-dot" style={{ background: diary.color }} /> {diary.name}
          </h2>
          {diary.id === defaultId ? (
            <span className="muted">★ 기본 다이어리</span>
          ) : (
            <button className="ghost" onClick={() => setDefault(diary.id)}>
              기본으로 정하기
            </button>
          )}
        </div>
        <p className="muted">
          이 다이어리로 만든 작업 {used}개{diary.id === defaultId ? ' · 새 작업은 이 다이어리로 시작해요' : ''}
        </p>

        <h3 className="panel-sub">이름 · 색</h3>
        <Row label="이름">
          <input
            className="diary-name-input"
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => {
              const next = name.trim() || diary.name;
              setName(next);
              if (next !== diary.name) patchDiary(diary.id, { name: next });
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
          />
        </Row>
        <Row label="색" hint="작업 카드의 색 점">
          <span className="diary-colors">
            {DIARY_COLORS.map((c) => (
              <button
                key={c}
                className={`diary-color ${diary.color === c ? 'on' : ''}`}
                style={{ background: c }}
                onClick={() => patchDiary(diary.id, { color: c })}
                aria-label={`색 ${c}`}
              />
            ))}
          </span>
        </Row>

        <h3 className="panel-sub">크기</h3>
        <Row label="가로">
          <Num
            value={diary.width}
            min={30}
            max={400}
            step={0.5}
            onChange={(width) => patchDiary(diary.id, { width })}
          />
        </Row>
        <Row label="세로">
          <Num
            value={diary.height}
            min={30}
            max={400}
            step={0.5}
            onChange={(height) => patchDiary(diary.id, { height })}
          />
        </Row>
        <p className="tool-panel-note">
          인식한 규격: {diarySizeLabel(diary)}
          {used > 0 && ` · 크기를 바꾸면 이 다이어리를 쓰는 작업 ${used}개의 속지가 함께 바뀌어요.`}
        </p>

        <h3 className="panel-sub">구멍</h3>
        <Row label="구멍 수">
          <Num
            value={punch.holeCount}
            min={1}
            max={30}
            step={1}
            unit="개"
            onChange={(holeCount) => patchPunch(diary.id, { holeCount })}
          />
        </Row>
        <Row label="배치">
          <select
            value={punch.groupGap === null ? 'even' : 'grouped'}
            onChange={(e) =>
              patchPunch(diary.id, {
                groupGap: e.target.value === 'even' ? null : suggestGroupGap(diary.height, punch.holeCount),
              })
            }
          >
            <option value="even">균등 간격</option>
            <option value="grouped">묶음 ({Math.ceil(punch.holeCount / 2)} + {Math.floor(punch.holeCount / 2)})</option>
          </select>
        </Row>
        {punch.groupGap !== null && (
          <Row label="묶음 간격" hint="두 묶음 사이의 중심 간격">
            <Num value={punch.groupGap} onChange={(groupGap) => patchPunch(diary.id, { groupGap })} />
          </Row>
        )}
        <details className="diary-fine">
          <summary>구멍 위치 미세 조정</summary>
          <Row label="안전영역" hint="구멍 쪽에 아무것도 놓지 않는 폭">
            <Num value={punch.safeZoneWidth} onChange={(safeZoneWidth) => patchPunch(diary.id, { safeZoneWidth })} />
          </Row>
          <Row label="구멍 지름">
            <Num
              value={punch.markSize}
              min={3}
              max={6}
              step={0.5}
              onChange={(markSize) => patchPunch(diary.id, { markSize })}
            />
          </Row>
          <Row label="가장자리~구멍" hint="속지 가장자리에서 구멍 가장자리까지">
            <Num
              value={punch.edgeToHole}
              min={0}
              max={20}
              step={0.5}
              onChange={(edgeToHole) => patchPunch(diary.id, { edgeToHole })}
            />
          </Row>
          <Row label="위아래 밀기" hint="구멍 묶음 전체를 위(−)·아래(+)로">
            <Num
              value={punch.offsetY}
              min={-20}
              max={20}
              step={0.5}
              onChange={(offsetY) => patchPunch(diary.id, { offsetY })}
            />
          </Row>
        </details>

        <div className="diary-remove">
          <button
            className="ghost danger"
            disabled={used > 0}
            title={used > 0 ? `작업 ${used}개가 쓰고 있어요(휴지통 포함)` : undefined}
            onClick={() => {
              if (window.confirm(`‘${diary.name}’ 다이어리를 지울까요?`)) removeDiary(diary.id);
            }}
          >
            다이어리 지우기
          </button>
          {used > 0 && <span className="muted">쓰는 작업이 없어야 지울 수 있어요(휴지통 포함).</span>}
        </div>
      </div>

      <figure className="diary-preview" aria-label="속지와 구멍 미리보기">
        <svg viewBox={`-2 -2 ${diary.width + 4} ${diary.height + 4}`}>
          <rect width={diary.width} height={diary.height} className="sheet-bg" />
          <PunchGuide width={diary.width} height={diary.height} punch={{ ...punch, show: true }} />
        </svg>
        <figcaption>
          {diary.width} × {diary.height} mm
        </figcaption>
      </figure>
    </div>
  );
}
