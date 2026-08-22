import { useEffect, useRef, useState } from 'react';
import { type LineObject, type ShapeObject, type TextObject } from '../core/objects';
import { OBJECT_LINE_COLOR, TEXT_COLOR } from '../core/style';
import { strokeColorOf } from '../core/shape';
import { usePalette, useStore } from '../store';

/** `#3a3a3a` 같은 6자리 16진 색 코드인지. 3자리 줄임(`#333`)은 안 받는다 — 저장되는 값이 늘 6자리라 맞춰둔다. */
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/**
 * 모든 양식이 공유하는 붙박이 회색 5단계(17w 이전에 쓰던 값 그대로). 양식별
 * 색상판(메인·서브)과 나란히, 말풍선 첫 줄에 항상 있다.
 */
const GRAY_SCALE: { hex: string; label: string }[] = [
  { hex: '#cfcfcf', label: '아주 연하게' },
  { hex: '#9e9e9e', label: '연하게' },
  { hex: '#6e6e6e', label: '중간' },
  { hex: '#3a3a3a', label: '진하게' },
  { hex: '#000000', label: '검정' },
];

/**
 * 색 하나를 고르는 칸.
 *
 * 버튼(지금 색)을 누르면 말풍선이 뜬다 — 붙박이 회색 5단계 · 메인색 1개 ·
 * 서브색(개수 제한 없이 늘어남) 순으로 스와치가 있어 눌러서 바로 적용한다.
 * 밖에서 16진 코드를 직접 치는 칸은 이제 없다 — 새 색을 정의하고 싶으면
 * 말풍선 안의 `+`를 눌러야 `ColorDefiner`(네모+16진 조합, 예전 상단바
 * 입력칸과 같다)가 나온다. 그렇게 정한 색은 그 자리에서 바로 적용되고
 * 양식의 색상판에도 남는다.
 *
 * **"섞임" 상태는 색 자체로 표현할 수 없다** — 버튼은 늘 실제 색 하나를
 * 보여줘야 하므로, 섞였을 때는 첫 번째 값을 그대로 보여주되 `mixed`
 * 클래스로 테두리를 다르게 해서 섞였다는 것만 알려준다.
 */
export function ColorField({
  value,
  mixed,
  onChange,
  title,
}: {
  value: string;
  mixed: boolean;
  onChange: (color: string) => void;
  title: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  // SettingsPanel의 말풍선과 같은 규칙 — 바깥을 누르거나 Esc를 누르면 닫는다.
  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <span className={mixed ? 'color-field mixed' : 'color-field'} ref={ref}>
      <button
        type="button"
        className="color-swatch"
        style={{ background: value }}
        onClick={() => setOpen((o) => !o)}
        title={mixed ? `${title} — 색이 여러 개 섞여 있습니다` : title}
      />
      {open && <ColorPalettePopover onPick={onChange} />}
    </span>
  );
}

/**
 * 색상판 말풍선 — 회색 5단계 · 메인색 · 서브색을 스와치로 늘어놓는다.
 *
 * 메인·서브색은 지금 양식(`usePalette`)이 갖는다. 메인이 없으면(양식을 막
 * 만들었을 때) `+` 자리만 보이고, 누르면 `ColorDefiner`로 바뀌어 새 색을
 * 정할 수 있다 — 정하는 즉시 적용도 함께 된다. 서브색은 맨 끝의 `+`로 하나씩
 * 늘어나고(개수 제한 없음), 각자 옆의 `×`로 지운다.
 */
function ColorPalettePopover({ onPick }: { onPick: (color: string) => void }) {
  const palette = usePalette();
  const setPaletteMain = useStore((s) => s.setPaletteMain);
  const addPaletteColor = useStore((s) => s.addPaletteColor);
  const removePaletteColor = useStore((s) => s.removePaletteColor);
  const [definingMain, setDefiningMain] = useState(false);
  const [definingNew, setDefiningNew] = useState(false);
  const main = palette.main;

  return (
    <div className="color-popover">
      <div className="color-popover-row">
        {GRAY_SCALE.map((g) => (
          <button
            key={g.hex}
            type="button"
            className="color-swatch-sm"
            style={{ background: g.hex }}
            title={g.label}
            onClick={() => onPick(g.hex)}
          />
        ))}
      </div>
      <div className="color-popover-row">
        {definingMain ? (
          <ColorDefiner
            onCommit={(c) => {
              onPick(c);
              setPaletteMain(c);
              setDefiningMain(false);
            }}
          />
        ) : main ? (
          <span className="palette-slot">
            <button
              type="button"
              className="color-swatch-sm"
              style={{ background: main }}
              title="메인색"
              onClick={() => onPick(main)}
            />
            <button
              type="button"
              className="palette-edit"
              title="메인색 바꾸기"
              onClick={() => setDefiningMain(true)}
            >
              ✎
            </button>
          </span>
        ) : (
          <button
            type="button"
            className="color-swatch-sm add"
            title="메인색 정하기"
            onClick={() => setDefiningMain(true)}
          >
            +
          </button>
        )}

        {palette.subs.map((c, i) => (
          <span className="palette-slot" key={`${c}-${i}`}>
            <button
              type="button"
              className="color-swatch-sm"
              style={{ background: c }}
              title="서브색"
              onClick={() => onPick(c)}
            />
            <button
              type="button"
              className="palette-remove"
              title="이 색 지우기"
              onClick={() => removePaletteColor(i)}
            >
              ×
            </button>
          </span>
        ))}

        {definingNew ? (
          <ColorDefiner
            onCommit={(c) => {
              onPick(c);
              addPaletteColor(c);
              setDefiningNew(false);
            }}
          />
        ) : (
          <button type="button" className="color-swatch-sm add" title="색 추가" onClick={() => setDefiningNew(true)}>
            +
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * 새 색을 정의하는 칸 — 네모(브라우저 기본 색 선택기)와 16진 코드 입력칸을
 * 나란히 둔다. `ColorPalettePopover`의 `+` 자리에서만 나온다. 값이 확정되는
 * 즉시(`onCommit`) 적용과 색상판 등록이 함께 일어난다 — 따로 "확인" 버튼이
 * 없다. 예전 상단바에 늘 떠 있던 입력칸과 조작 방식은 같다.
 */
function ColorDefiner({ onCommit }: { onCommit: (color: string) => void }) {
  const [draft, setDraft] = useState('');

  function commit(raw: string) {
    const normalized = raw.startsWith('#') ? raw : `#${raw}`;
    if (HEX_COLOR.test(normalized)) onCommit(normalized.toLowerCase());
  }

  return (
    <span className="color-definer">
      <input
        type="color"
        className="color-swatch-sm"
        onChange={(e) => onCommit(e.target.value)}
        title="색상환에서 고르기"
      />
      <input
        type="text"
        className="color-hex"
        value={draft}
        placeholder="#000000"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            commit(e.currentTarget.value);
            e.currentTarget.blur();
          }
        }}
        spellCheck={false}
        title="16진 코드"
        autoFocus
      />
    </span>
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
 */
export function MixedColorControls({
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
    <ColorField
      value={first}
      mixed={mixed}
      onChange={(color) => {
        if (lines.length > 0) styleSelected({ color });
        if (shapes.length > 0) styleShape({ color });
        if (texts.length > 0) styleText({ color });
      }}
      title="색 — 고른 선·표·글자 전부에 적용됩니다"
    />
  );
}
