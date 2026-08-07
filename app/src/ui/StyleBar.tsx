import { useEffect, useRef, useState } from 'react';
import {
  boundsOfObjects,
  isLine,
  isText,
  type LineObject,
  type LineStyle,
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
import { FONT_ACCEPT, hasFont, registerFont } from '../fonts/registry';
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
  const size = boundsOfObjects(picked);

  // 글자를 골랐거나 글자 도구를 쓰는 중이면 글자 속성을, 아니면 선 속성을 보여준다.
  const showText = tool === 'text' || (pickedTexts.length > 0 && pickedLines.length === 0);

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
          {tool === 'text' ? '쓸 글자' : tool === 'table' ? '그릴 표' : '그릴 선'}
        </span>
      )}

      {showText ? (
        <>
          {/* 이미 만든 글자를 골랐을 때만 자동 필드로 바꿀 수 있다. 아직 쓰는
              중이거나 앞으로 쓸 글자의 기본값으로는 두지 않는다 — 매번 새 글자가
              필드로 시작하면 놀란다. */}
          {pickedTexts.length > 0 && <FieldControls texts={pickedTexts} />}
          <TextControls
            items={pickedTexts.length > 0 ? pickedTexts : [draftStyle]}
            apply={pickedTexts.length > 0 ? styleText : setTextDraftStyle}
          />
        </>
      ) : (
        <LineControls
          lines={pickedLines}
          draft={picked.length === 0 ? drawStyle : null}
          apply={picked.length > 0 ? styleSelected : setDrawStyle}
        />
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
        title="줄 간격 (⇧Enter로 나뉜 줄 사이)"
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
