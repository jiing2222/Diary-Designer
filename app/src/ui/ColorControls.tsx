import { useEffect, useRef, useState } from 'react';
import { type LineObject, type ShapeObject, type TextObject } from '../core/objects';
import { OBJECT_LINE_COLOR, TEXT_COLOR } from '../core/style';
import { strokeColorOf } from '../core/shape';
import { BASE_KEYS, keyLabel, keyOfRef, nextPointKey, refOf, resolveColor, type WorkPalette } from '../core/colors';
import { usePalette, useStore } from '../store';
import { t } from '../lang';

/** `#3a3a3a` 같은 6자리 16진 색 코드인지. 저장되는 값이 늘 6자리라 맞춰둔다. */
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

// 함수로 둔다 — 모듈을 읽을 때 한 번 정하면 로그인으로 언어가 바뀌어도 그대로 남는다.
const baseLabels = () => [t('아주 연하게', 'Lightest'), t('연하게', 'Light'), t('중간', 'Medium'), t('진하게', 'Dark'), t('검정', 'Black')];

/**
 * 색 하나를 고르는 칸(리뉴얼, 세부계획 A13).
 *
 * 버튼은 지금 색을 보여주고, 그 색이 팔레트 칸(이름표)이면 칸 이름(`A`, `기본 3`)을
 * 작게 붙인다 — 이 객체가 A를 따라 바뀐다는 것을 알 수 있게. 누르면 말풍선이 뜬다.
 * 말풍선의 칸을 누르면 **이름표**가 붙고(`@A`), ‘직접 고르기’로 고른 색은 이름표 없는
 * 색 값이 된다.
 *
 * **"섞임" 상태는 색 자체로 표현할 수 없다** — 첫 번째 값을 보여주되 `mixed`
 * 클래스로 테두리를 다르게 한다.
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
  const palette = usePalette();
  const shown = palette ? resolveColor(value, palette, '#000000') : value;
  const key = keyOfRef(value);

  // 바깥을 누르거나 Esc를 누르면 닫는다.
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
        style={{ background: shown }}
        onClick={() => setOpen((o) => !o)}
        title={mixed ? t(`${title} — 색이 여러 개 섞여 있습니다`, `${title}: mixed colors`) : title}
      >
        {key && <span className="color-key">{keyLabel(key)}</span>}
      </button>
      {open && palette && (
        <ColorPalettePopover
          palette={palette}
          onPick={(c) => {
            onChange(c);
            setOpen(false);
          }}
        />
      )}
    </span>
  );
}

/**
 * 색상판 말풍선 — 기본 5칸 · 포인트 칸 · 새 포인트 · 직접 고르기.
 *
 * 칸의 색 자체를 바꾸는 일은 여기서 하지 않는다 — 레일 맨 아래의 Colors 탭에서 한다
 * (A의 색을 바꾸면 A를 쓰는 객체가 전부 바뀌는 일이라, 고르는 자리와 나눠 둔다).
 */
function ColorPalettePopover({ palette, onPick }: { palette: WorkPalette; onPick: (value: string) => void }) {
  const addPaletteColor = useStore((s) => s.addPaletteColor);
  const [defining, setDefining] = useState<'point' | 'direct' | null>(null);

  return (
    <div className="color-popover">
      <div className="color-popover-row">
        {BASE_KEYS.map((key, i) => (
          <button
            key={key}
            type="button"
            className="color-swatch-sm"
            style={{ background: palette.base[key] }}
            title={t(`기본 ${i + 1} · ${baseLabels()[i]}`, `Base ${i + 1} · ${baseLabels()[i]}`)}
            onClick={() => onPick(refOf(key))}
          />
        ))}
      </div>
      <div className="color-popover-row">
        {palette.points.map((p) => (
          <button
            key={p.key}
            type="button"
            className="color-swatch-sm keyed"
            style={{ background: p.color }}
            title={t(`포인트 ${p.key}`, `Accent ${p.key}`)}
            onClick={() => onPick(refOf(p.key))}
          >
            <span className="color-key">{p.key}</span>
          </button>
        ))}
        {defining === 'point' ? (
          <ColorDefiner
            onCommit={(c) => {
              // 새 칸을 만들고 그 칸의 이름표를 바로 붙인다.
              const key = nextPointKey(palette.points);
              addPaletteColor(c);
              onPick(refOf(key));
              setDefining(null);
            }}
          />
        ) : (
          <button type="button" className="color-swatch-sm add" title={t('포인트 색 추가', 'Add accent color')} onClick={() => setDefining('point')}>
            +
          </button>
        )}
      </div>
      <div className="color-popover-row">
        {defining === 'direct' ? (
          <ColorDefiner onCommit={(c) => onPick(c)} />
        ) : (
          <button type="button" className="ghost color-direct" onClick={() => setDefining('direct')}>
            {t('직접 고르기 (팔레트와 연결 안 됨)', 'Custom (not linked to the palette)')}
          </button>
        )}
      </div>
    </div>
  );
}

/** 새 색을 정의하는 칸 — 색상환과 16진 입력칸. 확정되는 즉시 `onCommit`. */
export function ColorDefiner({ onCommit, initial, live = false }: { onCommit: (color: string) => void; initial?: string; live?: boolean }) {
  const [draft, setDraft] = useState(initial ?? '');
  useEffect(() => setDraft(initial ?? ''), [initial]);

  function commit(raw: string) {
    const normalized = raw.startsWith('#') ? raw : `#${raw}`;
    if (HEX_COLOR.test(normalized)) onCommit(normalized.toLowerCase());
  }

  return (
    <span className="color-definer">
      <input
        type="color"
        className="color-swatch-sm"
        value={initial && HEX_COLOR.test(initial) ? initial : '#000000'}
        onChange={(e) => {
          setDraft(e.target.value);
          onCommit(e.target.value);
        }}
        title={t('색상환에서 고르기', 'Pick from the color wheel')}
      />
      <input
        type="text"
        className="color-hex"
        value={draft}
        placeholder="#000000"
        onChange={(e) => {
          setDraft(e.target.value);
          if (live) commit(e.target.value);
        }}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            commit(e.currentTarget.value);
            e.currentTarget.blur();
          }
        }}
        spellCheck={false}
        title={t('16진 코드', 'Hex code')}
        autoFocus
      />
    </span>
  );
}

/**
 * 선·표(도형)·글자를 섞어 골랐을 때 — 색만 한 번에 바꾼다. 세 액션은 각자 자기 종류가
 * 아닌 id를 걸러내므로 고른 것 전체를 셋 다에 넘겨도 안전하다.
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
      title={t('색 — 고른 선·표·글자 전부에 적용됩니다', 'Color: applies to all selected lines, tables and text')}
    />
  );
}
