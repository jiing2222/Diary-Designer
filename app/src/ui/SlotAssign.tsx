import { sameSize } from '../core/template';
import { activeTemplate, useStore } from '../store';
import type { Layout } from '../core/layout';

/**
 * 낱장 조합 — 용지 한 장의 칸마다 다른 양식을 넣는다.
 *
 * **같은 규격끼리만 섞을 수 있다.** 배치(칸 크기·개수)가 한 규격을 기준으로
 * 한 번만 계산되기 때문이다(설계문서 8장). 지금 양식과 같은 규격의 양식이
 * 하나뿐이면(자기 자신뿐이면) 고를 게 없으므로 아무것도 보여주지 않는다.
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
    (t) => sameSize(t.insert, active.insert) && t.repeat.mode === 'single',
  );
  if (group.length <= 1) return null;

  return (
    <div className="slot-assign">
      <span className="slot-assign-label" title="같은 규격의 양식만 섞을 수 있습니다">
        칸 배정
      </span>
      <div
        className="slot-assign-grid"
        style={{ gridTemplateColumns: `repeat(${layout.cols}, 1fr)` }}
      >
        {Array.from({ length: layout.count }, (_, i) => (
          <select
            key={i}
            value={slotAssignment[i] ?? ''}
            onChange={(e) => assignSlot(i, e.target.value || null)}
            title={`${Math.floor(i / layout.cols) + 1}행 ${(i % layout.cols) + 1}열`}
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
        ))}
      </div>
    </div>
  );
}
