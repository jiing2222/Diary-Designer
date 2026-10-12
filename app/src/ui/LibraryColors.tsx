import { useState } from 'react';
import { useStore } from '../store';
import { BASE_KEYS, DEFAULT_BASE, addPoint, colorOfKey, keyLabel, nextPointKey, setKeyColor } from '../core/colors';
import type { SavedPalette } from '../core/palettes';
import { ColorDefiner } from './ColorControls';

/**
 * Library → Colors(리뉴얼 7-4, 세부계획 B ‘Library 화면 시안’ · A13).
 *
 * 왼쪽은 보관한 팔레트 목록과 ‘+ 만들기’, 가운데는 고른 팔레트의 이름·기본 5칸·POINT A·B·C… 편집.
 * 작업에 넣는 것은 편집기 Colors의 ‘팔레트 불러오기’다(복사라서 여기서 고쳐도 이미 만든 작업은 그대로).
 * 보관한 팔레트는 아무 요소와도 이어져 있지 않으므로 미리보기 없이 고르는 즉시 바뀐다.
 */
export function LibraryColors() {
  const palettes = useStore((s) => s.savedPalettes);
  const [picked, setPicked] = useState<string | null>(null);
  const current = palettes.find((p) => p.id === picked) ?? palettes[0] ?? null;

  return (
    <div className="library-projects">
      <aside className="projects-panel" aria-label="팔레트 목록">
        <h2>Colors</h2>
        {palettes.map((p) => (
          <button
            key={p.id}
            className={`project-filter ${current?.id === p.id ? 'on' : ''}`}
            onClick={() => setPicked(p.id)}
          >
            <span className="filter-name">
              <PaletteStrip palette={p} />
              {p.name}
            </span>
          </button>
        ))}
        <button
          className="project-filter"
          onClick={() => setPicked(useStore.getState().createPalette(`팔레트 ${palettes.length + 1}`))}
        >
          + 팔레트 만들기
        </button>
      </aside>
      <div className="library-pane projects-content">
        {current ? (
          <PaletteEditor key={current.id} saved={current} />
        ) : (
          <>
            <h2>Colors</h2>
            <p className="muted">
              자주 쓰는 색 조합을 보관해 두는 곳이에요. 왼쪽 ‘+ 팔레트 만들기’로 만들거나, 편집기 Colors에서 ‘이 팔레트
              보관’으로 지금 작업의 색을 담아요.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

/** 목록의 작은 견본 — 기본 5칸 중 진한 것 하나와 포인트들. */
function PaletteStrip({ palette }: { palette: SavedPalette }) {
  const colors = [palette.palette.base.base5, ...palette.palette.points.map((p) => p.color)].slice(0, 6);
  return (
    <span className="palette-strip" aria-hidden="true">
      {colors.map((c, i) => (
        <span key={i} style={{ background: c }} />
      ))}
    </span>
  );
}

function PaletteEditor({ saved }: { saved: SavedPalette }) {
  const patch = useStore((s) => s.patchSavedPalette);
  const remove = useStore((s) => s.removeSavedPalette);
  const [name, setName] = useState(saved.name);
  const [editing, setEditing] = useState<string | null>(null);
  const palette = saved.palette;
  const isBase = (key: string) => (BASE_KEYS as readonly string[]).includes(key);
  const setColor = (key: string, color: string) => patch(saved.id, { palette: setKeyColor(palette, key, color) });

  return (
    <div className="palette-editor">
      <div className="library-head">
        <input
          className="diary-name-input palette-name"
          aria-label="팔레트 이름"
          value={name}
          maxLength={40}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            // 비우고 나가면 원래 이름으로 돌아간다(이름 없는 팔레트는 두지 않는다).
            if (!name.trim()) setName(saved.name);
            else if (name !== saved.name) patch(saved.id, { name });
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
        />
        <button
          className="ghost danger"
          onClick={() => {
            if (window.confirm(`‘${saved.name}’ 팔레트를 지울까요? 이미 불러온 작업의 색은 그대로예요.`))
              remove(saved.id);
          }}
        >
          팔레트 지우기
        </button>
      </div>
      <p className="muted">
        작업에 넣으려면 편집기 Colors의 ‘팔레트 불러오기’를 써요. 여기서 고쳐도 이미 불러온 작업은 바뀌지 않아요.
      </p>

      <div className="colors-label">기본</div>
      <div className="colors-row">
        {BASE_KEYS.map((key) => (
          <button
            key={key}
            className={`color-slot ${editing === key ? 'on' : ''}`}
            style={{ background: palette.base[key] }}
            title={keyLabel(key)}
            onClick={() => setEditing(editing === key ? null : key)}
          />
        ))}
      </div>
      <div className="colors-label">POINT</div>
      <div className="colors-row">
        {palette.points.map((p) => (
          <span key={p.key} className="color-point">
            <button
              className={`color-slot round ${editing === p.key ? 'on' : ''}`}
              style={{ background: p.color }}
              title={`포인트 ${p.key}`}
              onClick={() => setEditing(editing === p.key ? null : p.key)}
            />
            <span className="color-point-key">{p.key}</span>
          </span>
        ))}
        <button
          className="color-slot round add"
          title="포인트 색 추가"
          onClick={() => {
            const key = nextPointKey(palette.points);
            patch(saved.id, { palette: addPoint(palette, '#8ea8c6') });
            setEditing(key);
          }}
        >
          +
        </button>
      </div>

      {editing && colorOfKey(palette, editing) !== null && (
        <div className="color-editor palette-color-editor">
          <div className="color-editor-head">
            <b>{keyLabel(editing)}</b>
          </div>
          <ColorDefiner
            key={editing}
            initial={colorOfKey(palette, editing) ?? undefined}
            live
            onCommit={(c) => setColor(editing, c)}
          />
          <div className="color-editor-actions">
            {isBase(editing) ? (
              <button
                className="ghost"
                onClick={() => setColor(editing, DEFAULT_BASE[editing as keyof typeof DEFAULT_BASE])}
              >
                기본값으로 되돌리기
              </button>
            ) : (
              <button
                className="ghost danger"
                onClick={() => {
                  patch(saved.id, { palette: { ...palette, points: palette.points.filter((p) => p.key !== editing) } });
                  setEditing(null);
                }}
              >
                {editing} 지우기
              </button>
            )}
            <button className="primary" onClick={() => setEditing(null)}>
              닫기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
