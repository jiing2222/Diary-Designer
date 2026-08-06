import { capacityPerSheet, sheetsNeeded } from '../core/template';
import type { Layout } from '../core/layout';

/**
 * 반복 인쇄 — 낱장 조합(`SlotAssign`)의 반대말이다.
 *
 * 양식의 반복 설정이 `repeat`일 때 인쇄하기 탭에 뜬다. 이 양식 하나로만
 * 여러 장을 채우므로 칸마다 다른 양식을 고를 이유가 없다 — 그래서 낱장 조합
 * 대신 몇 장이 필요한지와, 여러 장이면 미리보기를 넘겨볼 수 있는 버튼을 보여준다.
 *
 * 매수 자체를 고치는 곳은 아니다. 그건 양식의 속성이라 설정 패널의 "반복"
 * 묶음에서 고친다 — 여기는 그 결과를 보여주고 넘겨보는 자리다.
 */
export function RepeatPrint({
  layout,
  totalSlots,
  duplex,
  page,
  onPageChange,
}: {
  layout: Layout;
  totalSlots: number;
  duplex: boolean;
  page: number;
  onPageChange: (page: number) => void;
}) {
  const sheets = sheetsNeeded(totalSlots, capacityPerSheet(layout.count, duplex));
  // 매수를 줄인 뒤에도 이전 페이지 번호가 남아 있을 수 있어 여기서 붙잡는다.
  const clamped = Math.min(Math.max(0, page), Math.max(0, sheets - 1));

  return (
    <div className="repeat-print">
      <span className="repeat-print-label">
        총 <b>{totalSlots}칸</b> 필요 · 한 장에 {layout.count}칸
        {duplex && <> (양면이라 앞뒤 {layout.count * 2}칸)</>} · <b>{sheets}장</b>
      </span>

      {sheets > 1 && (
        <div className="page-nav">
          <button
            className="ghost"
            onClick={() => onPageChange(clamped - 1)}
            disabled={clamped === 0}
            title="이전 장"
          >
            ‹
          </button>
          <span>
            {clamped + 1} / {sheets}쪽 미리보기
          </span>
          <button
            className="ghost"
            onClick={() => onPageChange(clamped + 1)}
            disabled={clamped === sheets - 1}
            title="다음 장"
          >
            ›
          </button>
        </div>
      )}
    </div>
  );
}
