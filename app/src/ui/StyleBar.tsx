import { useEffect, useRef, useState } from 'react';
import {
  boundsOfObjects,
  imageRotateOf,
  isCalendar,
  isCheckbox,
  isImage,
  isLine,
  isShape,
  isText,
  type CalendarObject,
  type CalendarStyle,
  type CheckboxStyle,
  type CornerRoundness,
  type ImageObject,
  type LineObject,
  type LineStyle,
  type ShapeObject,
  type ShapeStyle,
  type TextObject,
  type TextStyle,
} from '../core/objects';
import {
  DEFAULT_FONT_FAMILY,
  OBJECT_LINE_COLOR,
  OBJECT_LINE_WIDTH,
  TEXT_COLOR,
  TEXT_SIZE,
} from '../core/style';
import {
  boldOf,
  canBold,
  DEFAULT_FIELD_FORMAT,
  FIELD_FORMATS,
  naturalLineHeight,
} from '../core/text';
import { showAdjacentOf, sizeScaleOf, weekdayLangOf, weekStartOf } from '../core/calendar';
import { roundnessOf, strokeColorOf, strokeDashOf, strokeWidthOf } from '../core/shape';
import { FONT_ACCEPT, hasFont, registerFont } from '../fonts/registry';
import { IMAGE_ACCEPT, hasImage, registerImage } from '../images/registry';
import { mmToPt, ptToMm, roundMm, type Mm } from '../core/units';
import { useObjects, useStore } from '../store';
import type { Editing } from './gestures';

/**
 * 편집 화면 위쪽의 속성 막대.
 *
 * 지금 고른 것(또는 앞으로 만들 것)의 굵기·색·크기를 보여주고 바꾼다.
 * 무엇을 보여줄지 고르는 것이 StyleBar, 실제 조작칸이 LineControls·TextControls다.
 *
 * EditorTab에서 떼어냈다. 이 막대는 store와 props로만 이야기하고 캔버스의
 * 몸짓·좌표를 전혀 모르기 때문에 따로 두는 편이 읽기 쉽다.
 */

const WIDTHS: Mm[] = [0.1, 0.15, 0.2, 0.3, 0.4, 0.6, 0.8];
const COLORS: { id: string; label: string }[] = [
  { id: '#cfcfcf', label: '아주 연하게' },
  { id: '#9e9e9e', label: '연하게' },
  { id: '#6e6e6e', label: '중간' },
  { id: '#3a3a3a', label: '진하게' },
  { id: '#000000', label: '검정' },
];

/**
 * 굵기·색·모양.
 *
 * 셋 중 하나를 보여준다.
 *   1. 지금 입력 중인 글자가 있으면 — 그 상자 자체의 스타일. 즉시 반영된다
 *   2. 고른 것이 있으면 — 그것들의 값
 *   3. 아무것도 없으면 — **앞으로 그릴/쓸 것**의 기본 모양. 도구가 선이면 선,
 *      글자면 글자다. 만들기 전에 무엇이 나올지 보이는 편이 낫다
 *
 * **`기본`이라는 선택지는 두지 않는다.** 목록에서 기본값에 해당하는 항목이 그냥
 * 처음부터 골라져 있다. 값을 정하지 않았다는 사실은 사용자가 알 필요가 없고,
 * `기본 0.2mm`와 `0.2mm`가 나란히 있으면 무엇이 다른지 되묻게 된다. 안에서는
 * 여전히 값을 비워두므로 나중에 기본값을 바꾸면 손대지 않은 것들이 같이 따라온다.
 *
 * 여러 개를 골랐는데 값이 서로 다르면 `—`로 두고, 고르면 전부에 적용한다.
 */
export function StyleBar({
  editing,
  setEditingStyle,
  draftStyle,
  refocusText,
}: {
  editing: Editing | null;
  setEditingStyle: (patch: TextStyle) => void;
  /** 앞으로 쓸 글자에 실제로 붙을 값. 줄 간격까지 이미 정해져 있다. */
  draftStyle: TextStyle;
  refocusText: () => void;
}) {
  const objects = useObjects().present;
  const selectedIds = useStore((s) => s.selectedIds);
  const styleSelected = useStore((s) => s.styleSelected);
  const styleText = useStore((s) => s.styleText);
  const drawStyle = useStore((s) => s.drawStyle);
  const setDrawStyle = useStore((s) => s.setDrawStyle);
  const setTextDraftStyle = useStore((s) => s.setTextDraftStyle);
  const fieldDraftFormat = useStore((s) => s.fieldDraftFormat);
  const setFieldDraftFormat = useStore((s) => s.setFieldDraftFormat);
  const checkboxDraftStyle = useStore((s) => s.checkboxDraftStyle);
  const setCheckboxDraftStyle = useStore((s) => s.setCheckboxDraftStyle);
  const styleCheckbox = useStore((s) => s.styleCheckbox);
  const tool = useStore((s) => s.tool);

  // 입력 중인 상자가 있으면 그것부터 — 지금 쓰고 있는 글자를 고치는 게 우선이다.
  if (editing) {
    return (
      <div className="stylebar">
        <span className="picked-count">쓰는 중</span>
        <span className="size-readout">
          {roundMm(editing.box.width, 1)} × {roundMm(editing.box.height, 1)}mm
        </span>
        <TextControls items={[editing.style]} apply={setEditingStyle} afterPick={refocusText} />
      </div>
    );
  }

  const picked = objects.filter((o) => selectedIds.includes(o.id));
  const pickedLines = picked.filter(isLine);
  const pickedTexts = picked.filter(isText);
  const pickedCalendars = picked.filter(isCalendar);
  const pickedImages = picked.filter(isImage);
  const pickedShapes = picked.filter(isShape);
  const pickedCheckboxes = picked.filter(isCheckbox);
  const size = boundsOfObjects(picked);

  // 무엇 하나를 골랐거나 그 도구를 쓰는 중이면 그 속성을, 아니면 선 속성을 보여준다.
  // 도형은 따로 도구가 없다 — 그리기 도구로 만들어진 뒤에는 선과 달리
  // 골랐을 때만(선과 함께 고르지 않았을 때만) 자기 속성 막대를 보여준다.
  // 다만 표(테두리 도형 + 안쪽 칸 선을 함께 고른 상태)는 예외다 —
  // showTable이 먼저 그 조합을 가로챈다.
  //
  // 글자가 선·도형과 함께 섞여 고른 것에 들어 있으면(예: 선 두 개 + 글자 하나)
  // showMixedColor가 가장 먼저 가로챈다 — 굵기·모양은 종류마다 뜻이 달라
  // 하나로 못 묶지만 색은 셋 다 있다(MixedColorControls). 순수 선+도형(글자
  // 없음)은 그대로 showTable이 맡는다 — 이미 색까지 포함해 잘 처리한다.
  const showCalendar = tool === 'calendar' || pickedCalendars.length > 0;
  const showImage = !showCalendar && (tool === 'image' || pickedImages.length > 0);
  const showMixedColor =
    !showCalendar &&
    !showImage &&
    pickedTexts.length > 0 &&
    (pickedLines.length > 0 || pickedShapes.length > 0);
  const showTable =
    !showCalendar && !showImage && !showMixedColor && pickedShapes.length > 0 && pickedLines.length > 0;
  const showShape = !showCalendar && !showImage && !showMixedColor && !showTable && pickedShapes.length > 0;
  const showCheckbox =
    !showCalendar &&
    !showImage &&
    !showMixedColor &&
    !showTable &&
    !showShape &&
    (tool === 'checkbox' || pickedCheckboxes.length > 0);
  const showText =
    !showCalendar &&
    !showImage &&
    !showMixedColor &&
    !showTable &&
    !showShape &&
    !showCheckbox &&
    (tool === 'text' || tool === 'field' || (pickedTexts.length > 0 && pickedLines.length === 0));

  return (
    <div className="stylebar">
      {picked.length > 0 ? (
        <>
          <span className="picked-count">{picked.length}개</span>
          {size && (
            <span className="size-readout">
              {roundMm(size.width, 1)} × {roundMm(size.height, 1)}mm
            </span>
          )}
        </>
      ) : (
        <span className="picked-count muted-label">
          {tool === 'text'
            ? '글자'
            : tool === 'table'
              ? '표'
              : tool === 'field'
                ? '자동 필드'
                : tool === 'calendar'
                  ? '달력 | 끌어서 놓으면 이번 달이 자동으로 채워집니다'
                  : tool === 'image'
                    ? '이미지'
                    : tool === 'checkbox'
                      ? '체크박스'
                      : tool === 'draw' && drawStyle.roundness
                        ? '도형'
                        : '선'}
        </span>
      )}

      {showCalendar ? (
        <CalendarControls calendars={pickedCalendars} />
      ) : showImage ? (
        <ImageControls images={pickedImages} />
      ) : showMixedColor ? (
        <MixedColorControls lines={pickedLines} shapes={pickedShapes} texts={pickedTexts} />
      ) : showTable ? (
        <TableControls shapes={pickedShapes} lines={pickedLines} />
      ) : showShape ? (
        <ShapeControls shapes={pickedShapes} />
      ) : showCheckbox ? (
        <CheckboxControls
          items={pickedCheckboxes.length > 0 ? pickedCheckboxes : [checkboxDraftStyle]}
          apply={pickedCheckboxes.length > 0 ? styleCheckbox : setCheckboxDraftStyle}
        />
      ) : showText ? (
        <>
          {/* 이미 만든 글자를 골랐을 때만 자동 필드로 바꿀 수 있다. 아직 쓰는
              중이거나 앞으로 쓸 글자의 기본값으로는 두지 않는다 — 매번 새 글자가
              필드로 시작하면 놀란다. */}
          {pickedTexts.length > 0 && <FieldControls texts={pickedTexts} />}
          {/* 자동 필드 도구인데 아직 찍은 게 없으면 — 무엇을 찍을지(서식) 미리
              고를 자리가 없었다. 찍고 나서 FieldControls로 고치는 것과 별개로,
              찍기 전에도 고를 수 있게 한다. */}
          {tool === 'field' && pickedTexts.length === 0 && (
            <select
              value={fieldDraftFormat}
              onChange={(e) => setFieldDraftFormat(e.target.value)}
              title="다음에 찍을 자동 필드의 서식"
            >
              {FIELD_FORMATS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          )}
          <TextControls
            items={pickedTexts.length > 0 ? pickedTexts : [draftStyle]}
            apply={pickedTexts.length > 0 ? styleText : setTextDraftStyle}
          />
        </>
      ) : (
        <>
          <LineControls
            lines={pickedLines}
            draft={picked.length === 0 ? drawStyle : null}
            apply={picked.length > 0 ? styleSelected : setDrawStyle}
          />
          {/* 사각형을 끌면(클릭해서 잇는 선과 달리) 항상 도형(ShapeObject)
              하나가 된다 — 둥글기가 0(각짐)이어도 마찬가지다. 표의
              테두리도 마찬가지다(tableSplit) — 안쪽 칸 선은 그대로 선이고
              테두리만 도형이다. 그래서 여기 있는 둥글기는 "다음에 끌
              사각형(또는 표 테두리)"의 기본값일 뿐이고, 아무것도 고르지
              않은 그리기·표 도구에서만 보여준다 — 이미 만든 도형의
              둥글기는 그걸 고르면 뜨는 ShapeControls에서 바꾼다. */}
          {picked.length === 0 && (tool === 'draw' || tool === 'table') && (
            <select
              value={drawStyle.roundness ? String(drawStyle.roundness) : ''}
              onChange={(e) =>
                setDrawStyle({
                  roundness: e.target.value ? (Number(e.target.value) as CornerRoundness) : undefined,
                })
              }
              title="모서리 둥글기 — 사각형(또는 표 테두리)을 만들 때 쓰일 둥글기입니다"
            >
              <option value="">각짐</option>
              <option value="1">둥글기 1</option>
              <option value="2">둥글기 2</option>
              <option value="3">둥글기 3</option>
              <option value="4">원·타원</option>
            </select>
          )}
        </>
      )}
    </div>
  );
}

/** 선의 굵기·색·모양. 고른 것이 없으면 앞으로 그을 선의 값이다. */
function LineControls({
  lines,
  draft,
  apply,
}: {
  lines: LineObject[];
  draft: LineStyle | null;
  apply: (patch: LineStyle) => void;
}) {
  const editing = lines.length > 0;
  const mixed = (key: 'width' | 'color' | 'dash') =>
    editing && !lines.every((o) => o[key] === lines[0][key]);
  /**
   * 드롭다운에 보일 값.
   *
   * **기본값과 같으면 빈 문자열로 돌린다.** 목록에서 기본값에 해당하는 항목의 value가
   * 빈 문자열이기 때문이다 — `기본 0.2mm`라는 항목을 따로 두지 않고 목록의 `0.2mm`가
   * 곧 기본값이다. 예전에 0.2mm를 직접 골라둔 선도 같은 항목에 표시된다.
   */
  const val = (key: 'width' | 'color' | 'dash', dflt: string | number) => {
    if (mixed(key)) return 'mixed';
    const v = (editing ? lines[0][key] : draft?.[key]) ?? dflt;
    return v === dflt ? '' : String(v);
  };

  return (
    <>
      <select
        value={val('width', OBJECT_LINE_WIDTH)}
        onChange={(e) => apply({ width: e.target.value ? Number(e.target.value) : undefined })}
        title="굵기"
      >
        {mixed('width') && <option value="mixed">—</option>}
        {WIDTHS.map((w) => (
          <option key={w} value={w === OBJECT_LINE_WIDTH ? '' : w}>
            {w}mm
          </option>
        ))}
      </select>

      <select
        value={val('color', OBJECT_LINE_COLOR)}
        onChange={(e) => apply({ color: e.target.value || undefined })}
        title="색"
      >
        {mixed('color') && <option value="mixed">—</option>}
        {COLORS.map((c) => (
          <option key={c.id} value={c.id === OBJECT_LINE_COLOR ? '' : c.id}>
            {c.label}
          </option>
        ))}
      </select>

      <select
        value={val('dash', 'solid')}
        onChange={(e) => apply({ dash: (e.target.value || undefined) as never })}
        title="모양"
      >
        {mixed('dash') && <option value="mixed">—</option>}
        <option value="">실선</option>
        <option value="dashed">파선</option>
        <option value="dotted">점선</option>
      </select>
    </>
  );
}

/**
 * 달력의 시작 요일·요일 언어·이전달 표시.
 *
 * 값이 없는 오브젝트와 있는 오브젝트를 나란히 골라도 같은 결과를 보여주도록
 * `core/calendar`의 `weekStartOf` 등 접근자로 비교한다 — 원시 속성(`o.weekStart`)을
 * 직접 비교하면 "정하지 않아서 기본값"과 "기본값을 직접 골라 정함"이 서로
 * 다르게 보인다.
 *
 * 아직 그린 달력이 없으면(도구만 고른 상태) 아무 조작칸도 없다 — 만들기 전
 * 기본값을 바꿔 둘 자리가 없다(자동 필드처럼 이미 있는 것만 손댄다).
 */
const SIZE_SCALES = [0.8, 0.9, 1, 1.1, 1.2, 1.3];

function CalendarControls({ calendars }: { calendars: CalendarObject[] }) {
  const styleCalendar = useStore((s) => s.styleCalendar);
  const adjacentRef = useRef<HTMLInputElement>(null);

  const editing = calendars.length > 0;
  const first = calendars[0];
  const weekStartMixed = editing && !calendars.every((o) => weekStartOf(o) === weekStartOf(first));
  const langMixed = editing && !calendars.every((o) => weekdayLangOf(o) === weekdayLangOf(first));
  const adjacentMixed = editing && !calendars.every((o) => showAdjacentOf(o) === showAdjacentOf(first));
  const colorMixed = editing && !calendars.every((o) => (o.color ?? TEXT_COLOR) === (first.color ?? TEXT_COLOR));
  const sizeMixed = editing && !calendars.every((o) => sizeScaleOf(o) === sizeScaleOf(first));

  useEffect(() => {
    if (adjacentRef.current) adjacentRef.current.indeterminate = adjacentMixed;
  }, [adjacentMixed]);

  if (!editing) {
    return null;
  }

  return (
    <>
      <select
        value={weekStartMixed ? 'mixed' : weekStartOf(first)}
        onChange={(e) =>
          styleCalendar({ weekStart: e.target.value as CalendarStyle['weekStart'] })
        }
        title="시작 요일"
      >
        {weekStartMixed && <option value="mixed">—</option>}
        <option value="sun">일요일 시작</option>
        <option value="mon">월요일 시작</option>
      </select>

      <select
        value={langMixed ? 'mixed' : weekdayLangOf(first)}
        onChange={(e) =>
          styleCalendar({ weekdayLang: e.target.value as CalendarStyle['weekdayLang'] })
        }
        title="요일 언어"
      >
        {langMixed && <option value="mixed">—</option>}
        <option value="kr">한글 요일</option>
        <option value="en">영어 요일</option>
        <option value="en-short">MTWTFSS</option>
        <option value="hanja">한자 요일</option>
      </select>

      <select
        value={colorMixed ? 'mixed' : (first.color ?? TEXT_COLOR) === TEXT_COLOR ? '' : (first.color ?? TEXT_COLOR)}
        onChange={(e) => styleCalendar({ color: e.target.value || undefined })}
        title="글자 색"
      >
        {colorMixed && <option value="mixed">—</option>}
        {COLORS.map((c) => (
          <option key={c.id} value={c.id === TEXT_COLOR ? '' : c.id}>
            {c.label}
          </option>
        ))}
      </select>

      <select
        value={sizeMixed ? 'mixed' : sizeScaleOf(first) === 1 ? '' : String(sizeScaleOf(first))}
        onChange={(e) => styleCalendar({ sizeScale: e.target.value ? Number(e.target.value) : undefined })}
        title="글자 크기 — 상자 크기에서 자동으로 정해지는 값에 곱해지는 배율입니다"
      >
        {sizeMixed && <option value="mixed">—</option>}
        {SIZE_SCALES.map((s) => (
          <option key={s} value={s === 1 ? '' : s}>
            {Math.round(s * 100)}%
          </option>
        ))}
      </select>

      <label className="check" title="이번 달이 아닌 칸에도 그 달 날짜를 보여줄지">
        <input
          ref={adjacentRef}
          type="checkbox"
          checked={!adjacentMixed && showAdjacentOf(first)}
          onChange={(e) => styleCalendar({ showAdjacent: e.target.checked })}
        />
        이전·다음 달 표시
      </label>
    </>
  );
}

/**
 * 도형의 모서리 둥글기·테두리 굵기·색·모양.
 *
 * 달력과 같은 이유로 그린 도형이 없으면(도구만 고른 상태) 아무 조작칸도
 * 없다 — 만들기 전 기본값을 바꿔 둘 자리가 없다. 값은 core/shape의
 * 접근자로 읽는다 — 화면(ShapeLayer)·PDF(drawShapes)와 같은 함수라
 * "정하지 않아서 기본값"과 "기본값을 직접 골라 정함"이 항상 같게 보인다.
 */
function ShapeControls({ shapes }: { shapes: ShapeObject[] }) {
  const styleShape = useStore((s) => s.styleShape);
  const editing = shapes.length > 0;
  const first = shapes[0];

  const roundnessMixed = editing && !shapes.every((o) => roundnessOf(o) === roundnessOf(first));
  const strokeWidthMixed = editing && !shapes.every((o) => strokeWidthOf(o) === strokeWidthOf(first));
  const colorMixed = editing && !shapes.every((o) => strokeColorOf(o) === strokeColorOf(first));
  const dashMixed = editing && !shapes.every((o) => strokeDashOf(o) === strokeDashOf(first));

  if (!editing) {
    return null;
  }

  // 그리기 도구가 아무것도 고르지 않았을 때 보여주는 순서(굵기·색·모양·둥글기)와
  // 맞춘다 — 대기 화면과 다 그린 뒤가 순서까지 똑같아야 헷갈리지 않는다.
  return (
    <>
      <select
        value={strokeWidthMixed ? 'mixed' : strokeWidthOf(first) === OBJECT_LINE_WIDTH ? '' : strokeWidthOf(first)}
        onChange={(e) => styleShape({ strokeWidth: e.target.value ? Number(e.target.value) : undefined })}
        title="테두리 굵기"
      >
        {strokeWidthMixed && <option value="mixed">—</option>}
        {WIDTHS.map((w) => (
          <option key={w} value={w === OBJECT_LINE_WIDTH ? '' : w}>
            {w}mm
          </option>
        ))}
      </select>

      <select
        value={colorMixed ? 'mixed' : strokeColorOf(first) === OBJECT_LINE_COLOR ? '' : strokeColorOf(first)}
        onChange={(e) => styleShape({ color: e.target.value || undefined })}
        title="테두리 색"
      >
        {colorMixed && <option value="mixed">—</option>}
        {COLORS.map((c) => (
          <option key={c.id} value={c.id === OBJECT_LINE_COLOR ? '' : c.id}>
            {c.label}
          </option>
        ))}
      </select>

      <select
        value={dashMixed ? 'mixed' : strokeDashOf(first) === 'solid' ? '' : strokeDashOf(first)}
        onChange={(e) => styleShape({ dash: (e.target.value || undefined) as ShapeStyle['dash'] })}
        title="테두리 모양"
      >
        {dashMixed && <option value="mixed">—</option>}
        <option value="">실선</option>
        <option value="dashed">파선</option>
        <option value="dotted">점선</option>
      </select>

      <select
        value={roundnessMixed ? 'mixed' : roundnessOf(first)}
        onChange={(e) =>
          styleShape({ roundness: (e.target.value ? Number(e.target.value) : undefined) as ShapeStyle['roundness'] })
        }
        title="모서리 둥글기"
      >
        {roundnessMixed && <option value="mixed">—</option>}
        <option value={0}>각짐</option>
        <option value={1}>둥글기 1</option>
        <option value={2}>둥글기 2</option>
        <option value={3}>둥글기 3</option>
        <option value={4}>원·타원</option>
      </select>
    </>
  );
}

/**
 * 선·표(도형)·글자를 섞어 골랐을 때 — 색만 한 번에 바꾼다.
 *
 * 굵기·모양(점선 등)·둥글기는 종류마다 뜻이 달라(글자엔 "굵기"가 없다)
 * 하나로 묶을 수 없지만, 색은 셋 다 있다. `styleSelected`(선)·`styleShape`
 * (도형)·`styleText`(글자)는 이미 각자 자기 종류가 아닌 id는 걸러내므로,
 * 고른 것 전체의 id를 그대로 셋 다에 넘겨도 안전하다 — 새 액션을 만들
 * 필요가 없다.
 *
 * **`값이 없으면 기본값을 따른다` 관례의 "빈 문자열 = 기본값" 표기는 여기서
 * 못 쓴다.** 선·도형의 기본색(`OBJECT_LINE_COLOR`, "연하게")과 글자의
 * 기본색(`TEXT_COLOR`, "진하게")이 서로 달라서, 같은 빈 문자열이 종류마다
 * 다른 색을 가리키게 된다 — 섞인 선택에서는 그냥 실제 색 id를 그대로 보여준다.
 */
function MixedColorControls({
  lines,
  shapes,
  texts,
}: {
  lines: LineObject[];
  shapes: ShapeObject[];
  texts: TextObject[];
}) {
  const styleSelected = useStore((s) => s.styleSelected);
  const styleShape = useStore((s) => s.styleShape);
  const styleText = useStore((s) => s.styleText);

  const colors = [
    ...lines.map((o) => o.color ?? OBJECT_LINE_COLOR),
    ...shapes.map((o) => strokeColorOf(o)),
    ...texts.map((o) => o.color ?? TEXT_COLOR),
  ];
  const first = colors[0];
  const mixed = !colors.every((c) => c === first);

  return (
    <select
      value={mixed ? 'mixed' : first}
      onChange={(e) => {
        const color = e.target.value;
        if (lines.length > 0) styleSelected({ color });
        if (shapes.length > 0) styleShape({ color });
        if (texts.length > 0) styleText({ color });
      }}
      title="색 — 고른 선·표·글자 전부에 적용됩니다"
    >
      {mixed && <option value="mixed">—</option>}
      {COLORS.map((c) => (
        <option key={c.id} value={c.id}>
          {c.label}
        </option>
      ))}
    </select>
  );
}

/**
 * 표 — 테두리(도형)와 안쪽 칸 선을 함께 고쳤을 때 둘 다 같이 바뀌게 한다.
 *
 * 표를 그으면 테두리는 `ShapeObject`, 안쪽 칸 선은 여러 개의 `LineObject`로
 * 나뉜다(core/grid의 `tableSplit`) — 서로 다른 종류라 `styleShape`·
 * `styleSelected`도 따로다. 굵기·색·모양은 둘 다에게 그대로 적용하고,
 * 둥글기만 테두리(도형)에만 적용한다 — 안쪽 칸 선은 둥글게 할 수 없다.
 */
function TableControls({ shapes, lines }: { shapes: ShapeObject[]; lines: LineObject[] }) {
  const styleShape = useStore((s) => s.styleShape);
  const styleSelected = useStore((s) => s.styleSelected);
  const first = shapes[0];

  const strokeWidthMixed =
    !shapes.every((o) => strokeWidthOf(o) === strokeWidthOf(first)) ||
    !lines.every((o) => (o.width ?? OBJECT_LINE_WIDTH) === strokeWidthOf(first));
  const colorMixed =
    !shapes.every((o) => strokeColorOf(o) === strokeColorOf(first)) ||
    !lines.every((o) => (o.color ?? OBJECT_LINE_COLOR) === strokeColorOf(first));
  const dashMixed =
    !shapes.every((o) => strokeDashOf(o) === strokeDashOf(first)) ||
    !lines.every((o) => (o.dash ?? 'solid') === strokeDashOf(first));
  const roundnessMixed = !shapes.every((o) => roundnessOf(o) === roundnessOf(first));

  const apply = (patch: { strokeWidth?: Mm; color?: string; dash?: LineStyle['dash'] }) => {
    styleShape(patch);
    styleSelected({ width: patch.strokeWidth, color: patch.color, dash: patch.dash as LineStyle['dash'] });
  };

  return (
    <>
      <select
        value={strokeWidthMixed ? 'mixed' : strokeWidthOf(first) === OBJECT_LINE_WIDTH ? '' : strokeWidthOf(first)}
        onChange={(e) => apply({ strokeWidth: e.target.value ? Number(e.target.value) : undefined })}
        title="굵기 — 테두리·안쪽 칸 선 둘 다"
      >
        {strokeWidthMixed && <option value="mixed">—</option>}
        {WIDTHS.map((w) => (
          <option key={w} value={w === OBJECT_LINE_WIDTH ? '' : w}>
            {w}mm
          </option>
        ))}
      </select>

      <select
        value={colorMixed ? 'mixed' : strokeColorOf(first) === OBJECT_LINE_COLOR ? '' : strokeColorOf(first)}
        onChange={(e) => apply({ color: e.target.value || undefined })}
        title="색 — 테두리·안쪽 칸 선 둘 다"
      >
        {colorMixed && <option value="mixed">—</option>}
        {COLORS.map((c) => (
          <option key={c.id} value={c.id === OBJECT_LINE_COLOR ? '' : c.id}>
            {c.label}
          </option>
        ))}
      </select>

      <select
        value={dashMixed ? 'mixed' : strokeDashOf(first) === 'solid' ? '' : strokeDashOf(first)}
        onChange={(e) => apply({ dash: (e.target.value || undefined) as LineStyle['dash'] })}
        title="모양 — 테두리·안쪽 칸 선 둘 다"
      >
        {dashMixed && <option value="mixed">—</option>}
        <option value="">실선</option>
        <option value="dashed">파선</option>
        <option value="dotted">점선</option>
      </select>

      <select
        value={roundnessMixed ? 'mixed' : roundnessOf(first)}
        onChange={(e) =>
          styleShape({ roundness: (e.target.value ? Number(e.target.value) : undefined) as ShapeStyle['roundness'] })
        }
        title="테두리 모서리 둥글기 — 안쪽 칸 선은 둥글게 할 수 없다"
      >
        {roundnessMixed && <option value="mixed">—</option>}
        <option value={0}>각짐</option>
        <option value={1}>둥글기 1</option>
        <option value={2}>둥글기 2</option>
        <option value={3}>둥글기 3</option>
        <option value={4}>원·타원</option>
      </select>
    </>
  );
}

/**
 * 체크박스 아이콘 모양·테두리 굵기·색.
 *
 * TextControls와 같은 틀이다(`items`·`apply`) — 아직 찍은 체크박스가
 * 없어도(도구만 고른 상태) **다음에 찍을 모양**을 여기서 미리 고를 수
 * 있다. 매번 네모로 찍고 하나하나 고치는 게 아니라, 별을 찍고 싶으면
 * 찍기 전에 별을 고르는 쪽이 자연스럽다.
 */
function CheckboxControls({
  items,
  apply,
}: {
  items: CheckboxStyle[];
  apply: (patch: CheckboxStyle) => void;
}) {
  const mixed = (key: keyof CheckboxStyle) => items.length > 1 && !items.every((o) => o[key] === items[0][key]);
  const val = (key: 'strokeWidth' | 'color', dflt: number | string) => {
    if (mixed(key)) return 'mixed';
    const v = items[0][key] ?? dflt;
    return v === dflt ? '' : String(v);
  };

  return (
    <>
      <select
        value={mixed('icon') ? 'mixed' : (items[0].icon ?? 'square')}
        onChange={(e) => apply({ icon: e.target.value as CheckboxStyle['icon'] })}
        title="아이콘 모양"
      >
        {mixed('icon') && <option value="mixed">—</option>}
        <option value="square">네모</option>
        <option value="circle">동그라미</option>
        <option value="triangle">세모</option>
        <option value="diamond">다이아</option>
        <option value="star">별</option>
        <option value="heart">하트</option>
      </select>

      <select
        value={val('strokeWidth', OBJECT_LINE_WIDTH)}
        onChange={(e) => apply({ strokeWidth: e.target.value ? Number(e.target.value) : undefined })}
        title="테두리 굵기"
      >
        {mixed('strokeWidth') && <option value="mixed">—</option>}
        {WIDTHS.map((w) => (
          <option key={w} value={w === OBJECT_LINE_WIDTH ? '' : w}>
            {w}mm
          </option>
        ))}
      </select>

      <select
        value={val('color', OBJECT_LINE_COLOR)}
        onChange={(e) => apply({ color: e.target.value || undefined })}
        title="테두리 색"
      >
        {mixed('color') && <option value="mixed">—</option>}
        {COLORS.map((c) => (
          <option key={c.id} value={c.id === OBJECT_LINE_COLOR ? '' : c.id}>
            {c.label}
          </option>
        ))}
      </select>
    </>
  );
}

/**
 * 이미지 고르기·등록.
 *
 * 달력·도형과 같은 이유로 그린 이미지가 없으면(도구만 고른 상태) 아무
 * 조작칸도 없다 — 상자부터 그려야 한다. FontPicker와 같은 틀이다 —
 * 목록 맨 아래의 `이미지 파일 추가…`가 파일 창을 연다.
 *
 * **빈 이미지(막 그려서 아직 사진이 없는 상자)를 하나만 고르면 파일
 * 선택 창이 저절로 뜬다.** 상자를 그리자마자 곧바로 고른 상태가 되므로
 * (`commitImage`), 그리는 즉시 창이 뜨는 것처럼 보인다 — 사진을 먼저
 * 고르고 상자를 그리던 예전 순서를 뒤집었다.
 */
function ImageControls({ images }: { images: ImageObject[] }) {
  const userImages = useStore((s) => s.userImages);
  const addUserImage = useStore((s) => s.addUserImage);
  const styleImage = useStore((s) => s.styleImage);
  const styleImageRotate = useStore((s) => s.styleImageRotate);
  const pickImageFor = useStore((s) => s.pickImageFor);
  const requestImagePick = useStore((s) => s.requestImagePick);
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const editing = images.length > 0;
  const first = editing ? (images[0].imageId ?? '') : '';
  const mixed = editing && !images.every((i) => (i.imageId ?? '') === first);

  const rotateMixed = editing && !images.every((i) => imageRotateOf(i) === imageRotateOf(images[0]));
  const rotateValue = editing && !rotateMixed ? imageRotateOf(images[0]) : null;

  async function take(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      // 저장 파일을 열면 이미지가 이름만 남는다. 같은 이름의 파일을 다시
      // 등록하면 그때의 id를 물려받아 그 이미지를 쓰던 오브젝트가 되살아난다.
      const name = file.name.replace(/\.[^.]+$/, '');
      const orphan = userImages.find((i) => i.name === name && !hasImage(i.id));

      const image = await registerImage(file, orphan?.id);
      addUserImage(image);
      // 방금 등록한 이미지를 바로 씌운다. 등록만 하고 또 고르게 하면 한 번 더 손이 간다.
      styleImage(image.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : '이미지를 읽지 못했습니다');
    }
  }

  // 빈 이미지 상자를 더블클릭하면(EditorTab.tsx의 onDoubleClick) store의
  // pickImageFor에 그 상자 id가 신호로 온다 — 파일 선택 창을 스스로
  // 열고 신호를 지운다. 선택 상태만으로는 "같은 상자를 또 더블클릭했다"를
  // 구분할 수 없어서(값이 그대로면 리액트가 반응하지 않는다) 더블클릭마다
  // 새로 오는 이 신호를 따로 쓴다. 그리자마자 바로 열지는 않는다 —
  // 여러 개를 잇달아 그릴 때 방해가 된다.
  useEffect(() => {
    if (pickImageFor && images.length === 1 && images[0].id === pickImageFor) {
      fileRef.current?.click();
      requestImagePick(null);
    }
  }, [pickImageFor, images, requestImagePick]);

  if (!editing) {
    return null;
  }

  return (
    <>
      <select
        value={mixed ? 'mixed' : first}
        onChange={(e) => {
          if (e.target.value === ADD_IMAGE) {
            // 고른 값을 되돌려놓는다. 파일 창을 닫아버리면 아무 일도 없어야 한다.
            e.target.value = mixed ? 'mixed' : first;
            fileRef.current?.click();
            return;
          }
          styleImage(e.target.value);
        }}
        title={error ?? '이미지'}
        className={error ? 'has-error' : undefined}
      >
        {mixed && <option value="mixed">—</option>}
        {!first && <option value="">이미지를 고르세요</option>}
        {userImages.map((img) => (
          <option key={img.id} value={img.id}>
            {/* 저장 파일에서 이름만 살아 돌아온 것. 다시 등록해야 보인다. */}
            {img.url ? img.name : `${img.name} (파일 없음)`}
          </option>
        ))}
        <option value={ADD_IMAGE}>이미지 파일 추가…</option>
      </select>

      <input
        ref={fileRef}
        type="file"
        accept={IMAGE_ACCEPT}
        hidden
        onChange={(e) => {
          void take(e.target.files?.[0]);
          // 같은 파일을 다시 고를 수 있게 비운다.
          e.target.value = '';
        }}
      />

      {editing && (
        <NumField
          value={rotateValue}
          unit="도"
          title="회전 — 자유로운 각도로 돌립니다(시계 방향)"
          min={-360}
          max={360}
          step={1}
          onChange={(v) => styleImageRotate(v)}
        />
      )}
    </>
  );
}

/** 드롭다운에서 `파일 추가`를 뜻하는 값. 이미지 id와 부딪히지 않는 모양이면 된다. */
const ADD_IMAGE = '__add_image__';

/**
 * 자동 필드로 바꾸기.
 *
 * 켜면 오프셋(이 쪽의 몇 번째 값인지)과 서식을 고르는 칸이 뜬다. 편집 화면에는
 * `⟨+0⟩` 같은 자리표시만 보인다 — 실제 값은 데이터셋을 붙이는 8c에서 채워진다.
 *
 * 여러 개를 골랐는데 일부만 필드면 체크박스를 어중간한(indeterminate) 상태로
 * 보여준다. 그 상태에서 누르면 전부 켠다.
 *
 * **오프셋과 서식은 따로 "섞임"을 본다.** 여러 글자를 골랐을 때 서식이 같아도
 * 오프셋은 저마다 다른 것이 흔하다(같은 쪽의 서로 다른 요일 칸 등) — 서식만
 * 고쳐도 각자의 오프셋이 살아남아야 한다. `setField`가 준 키만 바꾸므로,
 * 여기서도 실제로 바뀐 키만 넘긴다.
 */
function FieldControls({ texts }: { texts: TextObject[] }) {
  const setField = useStore((s) => s.setField);
  const checkRef = useRef<HTMLInputElement>(null);

  const allOn = texts.every((t) => t.field);
  const noneOn = texts.every((t) => !t.field);
  const onMixed = !allOn && !noneOn;

  useEffect(() => {
    if (checkRef.current) checkRef.current.indeterminate = onMixed;
  }, [onMixed]);

  const first = texts[0].field;
  const offsetMixed = allOn && !texts.every((t) => t.field?.offset === first?.offset);
  const formatMixed = allOn && !texts.every((t) => t.field?.format === first?.format);

  return (
    <div className="field-controls">
      <label
        className="field-toggle"
        title="켜면 편집 화면에는 자리표시만 보이고, 인쇄할 때 데이터셋의 값이 채워집니다"
      >
        <input
          ref={checkRef}
          type="checkbox"
          checked={allOn}
          onChange={(e) =>
            setField(e.target.checked ? { offset: 0, format: DEFAULT_FIELD_FORMAT } : null)
          }
        />
        자동 필드
      </label>

      {allOn && (
        <>
          <label className="numfield" title="이 쪽에서 몇 번째 값을 쓸지. 0부터 센다">
            <input
              type="number"
              min={0}
              step={1}
              value={offsetMixed ? '' : (first?.offset ?? 0)}
              placeholder={offsetMixed ? '—' : undefined}
              onChange={(e) => {
                const offset = Math.max(0, Math.round(Number(e.target.value) || 0));
                setField({ offset });
              }}
            />
            <span>번째</span>
          </label>

          <select
            value={formatMixed ? '' : (first?.format ?? DEFAULT_FIELD_FORMAT)}
            onChange={(e) => setField({ format: e.target.value })}
          >
            {formatMixed && <option value="">—</option>}
            {FIELD_FORMATS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </>
      )}
    </div>
  );
}

/** 목록에서 고르지 않고 직접 치는 값들의 한계. 잘못 친 값이 그대로 들어가지 않게 막는다. */
const MIN_TEXT_PT = 1;
const MAX_TEXT_PT = 300;
const MIN_LINE_MM: Mm = 0.5;
const MAX_LINE_MM: Mm = 200;

/** 기본 글자 크기를 pt로. 크기 칸에 아무것도 정하지 않았을 때 보이는 값이다. */
const DEFAULT_PT = Math.round(mmToPt(TEXT_SIZE) * 10) / 10;

/**
 * 글자의 크기·줄 간격·정렬·색.
 *
 * `items`는 지금 값을 읽어올 대상들이다 — 고른 글자 여럿, 입력 중인 상자 하나,
 * 혹은 앞으로 쓸 글자의 값 하나. 무엇이든 굵기·색·모양과 같은 모양(TextStyle)
 * 이라 이 컴포넌트 하나로 다 다룬다.
 *
 * **크기와 줄 간격은 목록이 아니라 직접 치는 칸이다.** 고를 수 있는 몇 개로 묶어두면
 * 6.5pt나 4.2mm 같은 값을 쓸 수 없다. 손바닥만 한 속지에서는 0.5pt 차이가 한 줄을
 * 더 넣느냐 마느냐를 가른다. 도트 간격을 설정에서 직접 치는 것과 같은 방식이다.
 *
 * 크기만 pt로 주고받는다. 문서 프로그램에서 쓰던 단위라 감이 있기 때문이고,
 * 저장은 mm로 한다 — 모든 좌표는 mm라는 규칙을 지키기 위해서다.
 *
 * `afterPick`은 드롭다운을 고른 **뒤**에 부른다. 글자를 치는 중이었다면 다시
 * 입력칸으로 돌아가기 위해서다. 직접 치는 칸에서는 부르지 않는다 — 한 글자 칠
 * 때마다 포커스를 빼앗아가면 값을 끝까지 칠 수 없다.
 */
function TextControls({
  items,
  apply,
  afterPick,
}: {
  items: TextStyle[];
  apply: (patch: TextStyle) => void;
  afterPick?: () => void;
}) {
  const mixed = (key: keyof TextStyle) => !items.every((o) => o[key] === items[0][key]);
  /** 드롭다운에 보일 값. 기본값과 같으면 빈 문자열 — LineControls의 val과 같은 규칙이다. */
  const val = (key: 'align' | 'valign' | 'color', dflt: string) => {
    if (mixed(key)) return 'mixed';
    const v = items[0][key] ?? dflt;
    return v === dflt ? '' : v;
  };

  function pick(patch: TextStyle) {
    apply(patch);
    afterPick?.();
  }

  const sizeMm = mixed('size') ? null : (items[0].size ?? TEXT_SIZE);
  const sizePt = sizeMm === null ? null : Math.round(mmToPt(sizeMm) * 10) / 10;
  // 줄 간격은 만들 때 새겨지므로 대개 값이 있다. 없으면 글꼴 자체 높이가 쓰인다.
  const lineMm = mixed('lineHeight')
    ? null
    : roundMm(items[0].lineHeight ?? naturalLineHeight(sizeMm ?? TEXT_SIZE), 2);

  // 하나라도 보통 굵기면 눌렀을 때 전부 굵어진다. 여러 개가 섞여 있을 때
  // 무엇이 될지 예측하기 쉬운 쪽이다.
  const allBold = !mixed('bold') && boldOf(items[0]);
  // 등록 글꼴에는 Bold 파일이 없다. 가짜 굵게는 PDF에서 안 되므로 막는다.
  const boldable = items.every(canBold);

  return (
    <>
      <FontPicker
        value={mixed('font') ? null : (items[0].font ?? '')}
        onPick={(font) => pick({ font })}
      />

      <button
        type="button"
        className={`bold-btn ${allBold ? 'on' : ''}`}
        // 보통 굵기로 되돌릴 때는 값을 아예 지운다. 그래야 기본값을 따라간다.
        onClick={() => pick({ bold: allBold ? undefined : true })}
        disabled={!boldable}
        title={boldable ? '굵게' : '등록한 글꼴은 굵게가 없습니다. Bold 파일을 따로 등록하세요'}
      >
        가
      </button>

      <NumField
        value={sizePt}
        unit="pt"
        title="글자 크기"
        min={MIN_TEXT_PT}
        max={MAX_TEXT_PT}
        step={0.5}
        onCommit={afterPick}
        // 기본값을 그대로 쳤으면 값을 비운다. 그래야 나중에 기본 크기를 바꿀 때
        // 손대지 않은 글자들이 같이 따라온다.
        onChange={(pt) => apply({ size: pt === DEFAULT_PT ? undefined : ptToMm(pt) })}
      />

      <NumField
        value={lineMm}
        unit="mm"
        title="줄 간격 (Enter로 나뉜 줄 사이)"
        min={MIN_LINE_MM}
        max={MAX_LINE_MM}
        step={0.5}
        onCommit={afterPick}
        onChange={(mm) => apply({ lineHeight: mm })}
      />

      <select
        value={val('align', 'left')}
        onChange={(e) => pick({ align: (e.target.value || undefined) as never })}
        title="가로 정렬"
      >
        {mixed('align') && <option value="mixed">—</option>}
        <option value="">왼쪽</option>
        <option value="center">가운데</option>
        <option value="right">오른쪽</option>
      </select>

      <select
        value={val('valign', 'middle')}
        onChange={(e) => pick({ valign: (e.target.value || undefined) as never })}
        title="세로 정렬"
      >
        {mixed('valign') && <option value="mixed">—</option>}
        <option value="top">상단</option>
        <option value="">중단</option>
        <option value="bottom">하단</option>
      </select>

      <select
        value={val('color', TEXT_COLOR)}
        onChange={(e) => pick({ color: e.target.value || undefined })}
        title="색"
      >
        {mixed('color') && <option value="mixed">—</option>}
        {COLORS.map((c) => (
          <option key={c.id} value={c.id === TEXT_COLOR ? '' : c.id}>
            {c.label}
          </option>
        ))}
      </select>

      <select
        value={mixed('rotate') ? 'mixed' : String(items[0].rotate ?? 0)}
        onChange={(e) =>
          pick({ rotate: e.target.value === '0' ? undefined : (Number(e.target.value) as 90 | 270) })
        }
        title="회전 — 타공 방향에 맞춰 세워 쓰는 글자 등에 쓴다"
      >
        {mixed('rotate') && <option value="mixed">—</option>}
        <option value="0">회전 없음</option>
        <option value="90">90도</option>
        <option value="270">270도</option>
      </select>
    </>
  );
}

/**
 * 글꼴 고르기.
 *
 * 목록 맨 아래의 `글꼴 파일 추가…`가 파일 창을 연다. 드롭다운 하나에 고르기와
 * 등록을 함께 둔 것은, 글꼴을 바꾸려다 없다는 걸 알게 되는 순간이 곧 등록하고
 * 싶은 순간이기 때문이다.
 *
 * **등록한 글꼴은 이번 세션에만 산다.** 새로고침하면 목록이 비고, 그 글꼴을 쓰던
 * 글자는 기본 글꼴로 돌아간다. 자세한 이유는 fonts/registry에 있다.
 */
function FontPicker({
  value,
  onPick,
}: {
  /** 고른 글꼴 id. 빈 문자열이면 기본 글꼴, null이면 여러 개가 섞여 있다. */
  value: string | null;
  onPick: (id: string | undefined) => void;
}) {
  const userFonts = useStore((s) => s.userFonts);
  const addUserFont = useStore((s) => s.addUserFont);
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  async function take(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      // 저장 파일을 열면 글꼴이 이름만 남는다. 같은 이름의 파일을 다시 등록하면
      // **그때의 id를 물려받아** 그 글꼴을 쓰던 글자들이 한꺼번에 되살아난다.
      const name = file.name.replace(/\.[^.]+$/, '');
      const orphan = userFonts.find((f) => f.name === name && !hasFont(f.id));

      const font = await registerFont(file, orphan?.id);
      addUserFont(font);
      // 방금 등록한 글꼴을 바로 씌운다. 등록만 하고 또 고르게 하면 한 번 더 손이 간다.
      // 다만 되살린 경우에는 씌우지 않는다 — 이미 그 글꼴을 쓰던 글자들이 있다.
      if (!orphan) onPick(font.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : '글꼴을 읽지 못했습니다');
    }
  }

  return (
    <>
      <select
        value={value === null ? 'mixed' : value}
        onChange={(e) => {
          if (e.target.value === ADD_FONT) {
            // 고른 값을 되돌려놓는다. 파일 창을 닫아버리면 아무 일도 없어야 한다.
            e.target.value = value === null ? 'mixed' : (value ?? '');
            fileRef.current?.click();
            return;
          }
          onPick(e.target.value || undefined);
        }}
        title={error ?? '글꼴'}
        className={error ? 'has-error' : undefined}
      >
        {value === null && <option value="mixed">—</option>}
        <option value="">{DEFAULT_FONT_FAMILY}</option>
        {userFonts.map((f) => (
          <option key={f.id} value={f.id}>
            {/* 저장 파일에서 이름만 살아 돌아온 것. 지금은 기본 글꼴로 그려진다. */}
            {hasFont(f.id) ? f.name : `${f.name} (파일 없음)`}
          </option>
        ))}
        <option value={ADD_FONT}>글꼴 파일 추가…</option>
      </select>

      <input
        ref={fileRef}
        type="file"
        accept={FONT_ACCEPT}
        hidden
        onChange={(e) => {
          void take(e.target.files?.[0]);
          // 같은 파일을 다시 고를 수 있게 비운다.
          e.target.value = '';
        }}
      />
    </>
  );
}

/** 드롭다운에서 `파일 추가`를 뜻하는 값. 글꼴 id와 부딪히지 않는 모양이면 된다. */
const ADD_FONT = '__add__';

/**
 * 직접 치는 숫자 칸.
 *
 * 치는 도중에는 `1.`이나 빈 칸처럼 **아직 숫자가 아닌 상태**를 반드시 거친다.
 * 그 순간의 값을 그대로 위로 올리면 크기가 0이 되거나 NaN이 새어나간다. 그래서
 * 화면에 보이는 글자는 여기서 따로 들고 있고, **읽을 수 있는 값이 됐을 때만**
 * 위로 올린다. 손을 떼면 실제로 반영된 값으로 되돌린다 — 칸에 남은 `1.`이
 * 적용된 것처럼 보이면 안 된다.
 *
 * 값이 밖에서 바뀌면(다른 글자를 골랐다든지) 따라 바뀌지만, **치는 중일 때는
 * 건드리지 않는다.** 손이 올라가 있는 칸의 글자가 저절로 바뀌면 칠 수가 없다.
 *
 * `value`가 `null`이면 여러 개를 골랐는데 값이 서로 다르다는 뜻이다. 빈 칸에
 * `—`만 띄우고, 무언가 치면 그때 전부에 적용된다.
 */
function NumField({
  value,
  unit,
  title,
  min,
  max,
  step,
  onChange,
  onCommit,
}: {
  value: number | null;
  unit: string;
  title: string;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  onCommit?: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const shown = value === null ? '' : String(value);
  const [draft, setDraft] = useState(shown);

  useEffect(() => {
    if (document.activeElement === ref.current) return;
    setDraft(shown);
  }, [shown]);

  return (
    <label className="numfield" title={title}>
      <input
        ref={ref}
        type="number"
        value={draft}
        step={step}
        min={min}
        max={max}
        placeholder={value === null ? '—' : ''}
        onChange={(e) => {
          setDraft(e.target.value);
          const v = Number(e.target.value);
          if (e.target.value !== '' && Number.isFinite(v) && v >= min && v <= max) onChange(v);
        }}
        onKeyDown={(e) => {
          // Enter는 값을 확정한다는 뜻이다. 글자를 치던 중이었다면 그리로 돌아간다.
          if (e.key === 'Enter') {
            e.preventDefault();
            setDraft(shown);
            onCommit?.();
          }
        }}
        onBlur={() => setDraft(shown)}
      />
      <span>{unit}</span>
    </label>
  );
}
