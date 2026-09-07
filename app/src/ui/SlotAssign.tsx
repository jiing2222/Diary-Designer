import { sameSize } from '../core/template';
import { activeTemplate, useStore } from '../store';
import type { Layout } from '../core/layout';

/**
 * 낱장 조합 — 용지 한 장의 칸마다 다른 양식을 넣는다.
 *
 * **같은 규격끼리만 섞을 수 있다.** 배치(칸 크기·개수)가 한 규격을 기준으로
 * 한 번만 계산되기 때문이다(설계문서 8장). 지금 양식과 같은 규격의 양식이
 * 하나뿐이면(자기 자신뿐이면) 칸 배정 드롭다운은 고를 게 없어 보여주지 않지만,
 * 이 배치를 몇 장 찍을지(매수)는 조합이 없어도 의미가 있으므로 항상 보여준다.
 *
 * **반복(`repeat`) 양식은 목록에 안 뜬다.** 그 양식은 자기 하나로만 여러 장을
 * 채우는 것이라, 다른 양식과 한 칸씩 섞이는 낱장 조합에 낄 수 없다 — 이 화면
 * 자체가 지금 양식이 `single`일 때만 뜬다(App.tsx가 가른다).
 *
 * 드롭다운을 칸 배치와 같은 모양(가로·세로)으로 늘어놓는다 — 어느 칸을
 * 고치는지 바로 알아볼 수 있어야 한다.
 */
export function SlotAssign({ layout }: { layout: Layout }) {
  const templates = useStore((s) => s.templates);
  const slotAssignment = useStore((s) => s.slotAssignment);
  const assignSlot = useStore((s) => s.assignSlot);
  const active = useStore(activeTemplate);

  if (!active || layout.count === 0) return null;

  const group = templates.filter(
    (t) => sameSize(t.insert, active.insert) && t.repeat.mode === 'single' && t.kind !== 'notebook',
  );

  // 섞을 상대가 없으면 배정이라는 말 자체가 성립하지 않는다. 그때는 무엇을
  // 해야 할지 알려준다 — 빈 칸만 남겨두면 고장 난 것처럼 보인다.
  if (group.length <= 1) {
    return (
      <p className="slot-assign-empty">
        같은 규격의 양식이 하나 더 있어야 칸마다 다르게 넣을 수 있습니다.
        <br />
        지금은 모든 칸에 <b>{active.name}</b>이 들어갑니다.
      </p>
    );
  }

  /** 이 칸이 어느 양식인지. 정하지 않았으면 지금 양식이다. */
  const idAt = (i: number) => slotAssignment[i] ?? active.id;
  /** 양식마다 다른 색 — 칸 배정을 한눈에 보려면 이름보다 색이 빠르다. */
  const hueOf = (id: string) => (group.findIndex((t) => t.id === id) * 67) % 360;

  return (
    <div className="slot-assign">
      {/* 어떤 양식이 몇 칸에 들어갔는지. 칸을 하나하나 세지 않아도 된다. */}
      <div className="slot-chips">
        {group.map((t) => {
          const n = Array.from({ length: layout.count }, (_, i) => idAt(i)).filter(
            (id) => id === t.id,
          ).length;
          if (n === 0) return null;
          return (
            <span key={t.id} className="slot-chip">
              <span className="slot-chip-dot" style={{ background: `hsl(${hueOf(t.id)} 42% 45%)` }} />
              {t.name}
              <span className="slot-chip-count">· {n}칸</span>
            </span>
          );
        })}
      </div>

      <div
        className="slot-assign-grid"
        style={{ gridTemplateColumns: `repeat(${layout.cols}, 1fr)` }}
      >
        {Array.from({ length: layout.count }, (_, i) => {
          const row = Math.floor(i / layout.cols) + 1;
          const col = (i % layout.cols) + 1;
          return (
            <label key={i} className="slot-cell" title={`${row}행 ${col}열`}>
              <span
                className="slot-cell-dot"
                style={{ background: `hsl(${hueOf(idAt(i))} 42% 45%)` }}
              />
              <select
                value={slotAssignment[i] ?? ''}
                onChange={(e) => assignSlot(i, e.target.value || null)}
              >
                <option value="">기본 · {active.name}</option>
                {group
                  .filter((t) => t.id !== active.id)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
              </select>
            </label>
          );
        })}
      </div>

      <p className="slot-assign-hint">
        칸의 자리는 용지의 칸 자리와 같습니다. 같은 규격의 양식만 섞을 수 있습니다.
      </p>
    </div>
  );
}
