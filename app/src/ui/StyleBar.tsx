import {
  boundsOfObjects,
  isCalendar,
  isCheckbox,
  isImage,
  isLine,
  isShape,
  isText,
  type CornerRoundness,
  type TextStyle,
} from '../core/objects';
import { FIELD_FORMATS } from '../core/text';
import { roundMm } from '../core/units';
import { useObjects, useStore } from '../store';
import type { Editing } from './gestures';
import { MixedColorControls } from './ColorControls';
import {
  CalendarControls,
  CheckboxControls,
  FieldControls,
  ImageControls,
  LineControls,
  ShapeControls,
  TableControls,
  TextControls,
} from './ObjectControls';

/**
 * 편집 화면 위쪽의 속성 막대.
 *
 * 지금 고른 것(또는 앞으로 만들 것)의 굵기·색·크기를 보여주고 바꾼다.
 * 무엇을 보여줄지 고르는 것이 StyleBar, 실제 조작칸은 `ObjectControls.tsx`
 * (선·달력·도형·표·체크박스·이미지·자동 필드·글자)와 `ColorControls.tsx`
 * (색 고르는 말풍선, 섞인 색)에 나눠 있다.
 *
 * EditorTab에서 떼어냈다. 이 막대는 store와 props로만 이야기하고 캔버스의
 * 몸짓·좌표를 전혀 모르기 때문에 따로 두는 편이 읽기 쉽다.
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
  const calendarDraftStyle = useStore((s) => s.calendarDraftStyle);
  const setCalendarDraftStyle = useStore((s) => s.setCalendarDraftStyle);
  const styleCalendar = useStore((s) => s.styleCalendar);
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
                  ? '달력'
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
        <CalendarControls
          items={pickedCalendars.length > 0 ? pickedCalendars : [calendarDraftStyle]}
          apply={pickedCalendars.length > 0 ? styleCalendar : setCalendarDraftStyle}
        />
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
