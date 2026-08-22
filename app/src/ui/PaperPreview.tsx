import { cropSegments, type CropMode } from '../core/crop';
import { type DotGrid } from '../core/grid';
import { placeSlot } from '../core/place';
import { CROP_COLOR, CROP_WIDTH, RULER_COLOR, RULER_WIDTH } from '../core/style';
import { InsertView, type ViewMode } from './InsertView';
import { PunchGuide } from './PunchGuide';
import type { DiaryObject } from '../core/objects';
import type { Layout } from '../core/layout';
import type { InsertSetting, PaperState, UnprintableSetting } from '../store';
import type { Mm } from '../core/units';

/** 칸 하나에 실제로 들어가는 내용. PDF의 SlotContent와 같은 역할이다. */
export interface PreviewSlotContent {
  insert: InsertSetting;
  dotGrid: DotGrid;
  objects: DiaryObject[];
  /** 세트형·월간 달력일 때만 쓴다. 이 칸이 가리키는 쪽(달, 0부터). */
  calendarPage?: number;
  /**
   * "인쇄하기"에서 직접 손봤으면 true(App.tsx가 comboSlotOverrides·
   * pageOverrides를 보고 정한다). 낱장 조합에서 **다른 양식이 배정된
   * 것뿐**인 칸은 여기 안 든다 — 손봄 표시(배지)는 실제로 손댄 칸에만
   * 뜨는 게 맞아서, "배정이 다름"과 "직접 손봄"을 여기서 갈라둔다.
   */
  overridden?: boolean;
}

interface Props {
  paper: PaperState & { width: Mm; height: Mm };
  insert: InsertSetting;
  dotGrid: DotGrid;
  objects: DiaryObject[];
  layout: Layout;
  cropMark: CropMode;
  showRuler: boolean;
  unprintable: UnprintableSetting;
  /**
   * 낱장 조합 — 칸마다 다른 양식을 넣을 때, **기본값과 다른 칸만** 채운다.
   *
   * 키는 슬롯 번호. 여기 없는 칸은 위의 `insert`·`dotGrid`·`objects`를 그대로
   * 쓴다. pdf/export의 `slotOverrides`와 같은 생각이다 — 두 뷰가 같은 자리에서
   * 나온 값을 그린다(store의 `resolveSlotTemplates`).
   */
  slotOverrides?: Map<number, PreviewSlotContent>;
  /**
   * 'edit'(기본) — 지금 켜둔 화면 표시 설정을 그대로 보여준다.
   * 'print' — 설정과 무관하게 실제로 인쇄될 모습만 보여준다. 타공 안내는 아예
   * 그리지 않는다(인쇄되지 않으므로). 인쇄하기 탭의 미리보기 토글이 이걸 쓴다.
   */
  mode?: ViewMode;
  /**
   * 양면 인쇄의 뒷면을 보여주는 중이면 켠다. 안전영역·타공 안내가 오른쪽으로
   * 뒤집힌다(core/grid의 gridArea 참고) — 칸 위치 자체(layout)는 여기서 다루지
   * 않으므로 호출하는 쪽이 core/layout의 mirrorLayout으로 미리 뒤집어 넘긴다.
   */
  mirror?: boolean;
  /** 월간 달력 데이터셋의 연도. `slotOverrides`의 `calendarPage`와 함께 쓴다. */
  calendarYear?: number;
  /**
   * 인쇄하기에서 칸을 직접 손보는 기능(24단계)용. 주면 칸마다 클릭할 수 있게
   * 되고, 클릭하면 그 칸 번호와 **지금 실제로 그려지는 내용**(slotOverrides로
   * 이미 골라진 값)을 함께 넘긴다 — 손보기를 시작하는 쪽(App.tsx)이 이 값을
   * 그대로 그림자 양식의 씨앗으로 쓴다. 여기서 다시 계산하지 않는 이유는
   * "화면에 보이는 것과 손보기 시작하는 것이 항상 같아야 한다"는 원칙 때문이다.
   */
  onSlotClick?: (index: number, content: PreviewSlotContent) => void;
}

/**
 * 용지 배치 미리보기.
 *
 * viewBox를 mm 단위로 잡아서 SVG 좌표가 곧 mm가 되게 한다.
 * 화면은 눈으로 보는 용도일 뿐이고, 실제 치수의 진실은 PDF 익스포터가 따로 만든다.
 */
export function PaperPreview({
  paper,
  insert,
  dotGrid,
  objects,
  layout,
  cropMark,
  showRuler,
  unprintable,
  slotOverrides,
  mode = 'edit',
  mirror = false,
  calendarYear,
  onSlotClick,
}: Props) {
  const { width: pw, height: ph } = paper;

  // 회전 배치면 속지 안의 타공도 함께 돌아야 한다. 뒷면을 반 바퀴 돌린
  // 배치(layout.turn180)면 칸 안의 내용도 같이 돈다 — 아래 placeSlot 참고.
  const rotated = layout.rotated;

  return (
    <svg className="preview" viewBox={`0 0 ${pw} ${ph}`} role="img" aria-label="용지 배치 미리보기">
      <rect x={0} y={0} width={pw} height={ph} className="paper" />

      {paper.printMargin > 0 && (
        <rect
          x={paper.printMargin}
          y={paper.printMargin}
          width={pw - paper.printMargin * 2}
          height={ph - paper.printMargin * 2}
          className="print-margin"
        />
      )}

      {layout.slots.map((s, i) => {
        // 낱장 조합에서 이 칸만 다른 양식을 넣었으면 그것을, 아니면 기본값을 쓴다.
        const content = slotOverrides?.get(i) ?? { insert, dotGrid, objects };
        const punch = content.insert.punch;
        return (
          <g
            key={i}
            className={onSlotClick ? 'paper-slot-clickable' : undefined}
            onClick={onSlotClick ? () => onSlotClick(i, content) : undefined}
          >
            {/*
              보이진 않지만 칸 전체를 클릭할 수 있게 하는 판. 도트 사이 빈
              틈처럼 실제로 그려진 것이 없는 자리는 fill이 없으면 SVG가 클릭을
              받지 않는다(빈 곳을 눌렀는데 반응이 없던 버그) — fill="transparent"는
              안 보이면서도 클릭은 받는다(fill="none"과 다르다).
            */}
            {onSlotClick && <rect x={s.x} y={s.y} width={s.width} height={s.height} fill="transparent" />}

            {/*
              칸 경계선. 작업할 땐 어디가 한 장인지 보여주는 안내선이지만, 실제
              인쇄물에는 없는 선이다 — 'print' 모드에서는 그리지 않는다.
            */}
            {mode === 'edit' && (
              <rect x={s.x} y={s.y} width={s.width} height={s.height} className="insert" />
            )}

            {/*
              속지 안에 들어가는 것들. 좌표는 속지 왼쪽 위가 원점이고,
              칸으로 옮기는 일(회전 포함)은 core/place가 한다. PDF도 같은 변환을 쓴다.

              그리는 순서가 곧 층이다. 도트 → 선 → 글자. 타공 안내는 인쇄되지
              않는 화면 표시라 맨 위에 얹는다 — 'print' 모드에서는 아예 그리지 않는다.
            */}
            <g transform={placeSlot(s, rotated, layout.turn180).svg}>
              <InsertView
                insert={content.insert}
                grid={content.dotGrid}
                objects={content.objects}
                safeZoneWidth={punch.safeZoneWidth}
                mode={mode}
                mirror={mirror}
                calendarContext={
                  content.calendarPage !== undefined && calendarYear !== undefined
                    ? { year: calendarYear, page: content.calendarPage }
                    : undefined
                }
              />

              {mode === 'edit' && (
                <PunchGuide
                  width={content.insert.width}
                  height={content.insert.height}
                  punch={punch}
                  mirror={mirror}
                />
              )}
            </g>

            {/*
              "인쇄하기"에서 직접 손봤다는 표시. 칸의 회전과 무관하게 늘 같은
              모서리(용지 기준 오른쪽 위)에 뜨도록 회전하는 안쪽 <g> 밖,
              s.x·y·width 기준으로 둔다 — 인쇄되지 않는 화면 전용 표시라
              cropMark처럼 항상 그린다(mode와 무관하다).
            */}
            {content.overridden && (
              <circle cx={s.x + s.width - 3} cy={s.y + 3} r={1.6} className="override-badge">
                <title>인쇄하기에서 직접 손봤습니다</title>
              </circle>
            )}
          </g>
        );
      })}

      <CropMarks layout={layout} paperWidth={pw} paperHeight={ph} mode={cropMark} />

      {/*
        인쇄 불가 영역은 화면 전용 경고다 — 'print' 모드에서는 뺀다.
        눈금자는 다르다. 이건 실제로 PDF에도 찍히는 내용이라(자로 재는 용도),
        showRuler를 켜뒀다면 'print' 모드에서도 그대로 보여야 한다.
      */}
      {mode === 'edit' && unprintable.show && (
        <Unprintable paperWidth={pw} paperHeight={ph} width={unprintable.width} />
      )}

      {showRuler && <Ruler paperWidth={pw} paperHeight={ph} />}
    </svg>
  );
}

/**
 * 프린터가 못 찍는 가장자리.
 *
 * 인쇄되지 않는 화면 안내다. 여기 걸린 내용은 출력물에서 잘려나간다.
 * 테두리 굵기로 그리면 사각형 네 개를 따로 두지 않아도 된다.
 */
function Unprintable({
  paperWidth,
  paperHeight,
  width,
}: {
  paperWidth: Mm;
  paperHeight: Mm;
  width: Mm;
}) {
  if (width <= 0 || width * 2 >= Math.min(paperWidth, paperHeight)) return null;

  return (
    <g className="unprintable">
      <rect
        x={width / 2}
        y={width / 2}
        width={paperWidth - width}
        height={paperHeight - width}
        strokeWidth={width}
      />
      <rect
        x={width}
        y={width}
        width={paperWidth - width * 2}
        height={paperHeight - width * 2}
        className="unprintable-edge"
      />
    </g>
  );
}

/** 좌표는 core/crop이 낸다. 여기서는 그리기만 한다. PDF도 같은 좌표를 쓴다. */
function CropMarks({
  layout,
  paperWidth,
  paperHeight,
  mode,
}: {
  layout: Layout;
  paperWidth: Mm;
  paperHeight: Mm;
  mode: CropMode;
}) {
  return (
    <g className="crop" stroke={CROP_COLOR} strokeWidth={CROP_WIDTH}>
      {cropSegments(layout, paperWidth, paperHeight, mode).map((s, i) => (
        <line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} />
      ))}
    </g>
  );
}

/** PDF에 들어가는 검증 눈금자를 화면에서도 같은 자리에 보여준다. */
function Ruler({ paperWidth, paperHeight }: { paperWidth: Mm; paperHeight: Mm }) {
  const length = 50;
  const x0 = paperWidth - length - 8;
  const y0 = paperHeight - 8;

  const ticks = [];
  for (let mm = 0; mm <= length; mm += 5) {
    const tall = mm % 10 === 0;
    ticks.push(
      <line key={mm} x1={x0 + mm} y1={y0} x2={x0 + mm} y2={y0 - (tall ? 3 : 1.5)} />,
    );
  }

  return (
    <g className="ruler" stroke={RULER_COLOR} strokeWidth={RULER_WIDTH}>
      <line x1={x0} y1={y0} x2={x0 + length} y2={y0} />
      {ticks}
      <text x={x0} y={y0 - 4.5} fontSize={2.6} stroke="none" fill={RULER_COLOR}>
        50mm — 인쇄 후 자로 재세요
      </text>
    </g>
  );
}
