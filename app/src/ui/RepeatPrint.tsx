import type { ReactNode } from 'react';
import type { Layout } from '../core/layout';

/**
 * 반복 인쇄 — 낱장 조합(`SlotAssign`)의 반대말이다.
 *
 * 양식의 반복 설정이 `repeat`(만년형) 또는 `dataset`(세트형)일 때 인쇄하기
 * 탭에 뜬다. 이 양식 하나로만 여러 장을 채우므로 칸마다 다른 양식을 고를
 * 이유가 없다 — 그래서 낱장 조합 대신 몇 장이 필요한지와, 여러 장이면
 * 미리보기를 넘겨볼 수 있는 버튼을 보여준다.
 *
 * **장수 계산은 여기서 하지 않는다.** 반복 인쇄(칸 수가 양면이면 두 배)와
 * 세트형(칸 하나가 한 쪽의 앞뒤라 양면이어도 칸 수가 그대로)이 계산 방식이
 * 달라서, 부르는 쪽(App.tsx)이 이미 계산한 값을 넘긴다. 여기는 그 결과를
 * 보여주고 넘겨보기만 한다.
 *
 * 매수·기간 같은 값 자체를 고치는 곳도 아니다. 그건 양식의 속성이라 설정
 * 패널의 "반복" 묶음에서 고친다.
 */
export function RepeatPrint({
  layout,
  totalCount,
  unit,
  sheets,
  hint,
  page,
  onPageChange,
}: {
  layout: Layout;
  /** 총 몇 개(칸 또는 쪽)가 필요한지. */
  totalCount: number;
  /** 단위 이름. 반복 인쇄는 "칸", 세트형은 "쪽". */
  unit: string;
  /** 필요한 장수. 계산 방식이 모드마다 달라 부르는 쪽이 낸다. */
  sheets: number;
  /** 라벨 끝에 덧붙일 짧은 안내. 반복 인쇄의 "양면이라 칸 수가 두 배" 같은 것. */
  hint?: ReactNode;
  page: number;
  onPageChange: (page: number) => void;
}) {
  // 매수를 줄인 뒤에도 이전 페이지 번호가 남아 있을 수 있어 여기서 붙잡는다.
  const clamped = Math.min(Math.max(0, page), Math.max(0, sheets - 1));

  return (
    <div className="repeat-print">
      <span className="repeat-print-label">
        총 <b>
          {totalCount}
          {unit}
        </b>{' '}
        필요 · 한 장에 {layout.count}
        {unit}
        {hint} · <b>{sheets}장</b>
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
