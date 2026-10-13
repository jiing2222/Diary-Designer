import { useState } from 'react';
import { useStore } from '../store';
import {
  fieldValue,
  formatPageNo,
  usesDate,
  type FieldDraft,
  type FieldSpec,
  type FieldTile,
} from '../core/fieldFormat';
import { todayFrom } from '../core/dated';
import type { MoonObject, MoonStyle } from '../core/objects';
import { PopRow } from './Popover';
import { CalendarIcon } from './icons';

/**
 * AutoField 패널의 위쪽 — 종류 타일 3×3과 고른 종류의 설정(세부계획 A4.2·A4.3).
 *
 * 순서는 **종류 → 표시 형식 → 날짜 연결**. 칩마다 오늘 날짜로 실제 값을 보여준다.
 * 칩에 없는 형식은 맨 아래 ‘직접 입력’에 코드로 쓴다(core/fieldFormat).
 */
export type AutoTile = FieldTile | 'calendar' | 'moon';

const TILES: { id: AutoTile; label: string; glyph: React.ReactNode; key?: string }[] = [
  // 해·달·날·주·요일은 Date 하나 — 형식은 코드로 정한다(2026-10-13 결정).
  { id: 'date', label: 'Date', glyph: '10.15', key: 'F' },
  { id: 'dday', label: 'D-day', glyph: 'D-7' },
  { id: 'calendar', label: 'Calendar', glyph: <CalendarIcon />, key: 'C' },
  { id: 'page', label: 'Page No.', glyph: 'p.3' },
  { id: 'moon', label: 'Moon', glyph: '◐' },
];

export function AutoFieldTiles({ active, onPick }: { active: AutoTile | null; onPick: (tile: AutoTile) => void }) {
  return (
    <div className="tool-tiles auto-tiles">
      {TILES.map((t) => (
        <button
          key={t.id}
          className={`tool-tile ${active === t.id ? 'on' : ''}`}
          onClick={() => onPick(t.id)}
          title={t.key ? `${t.label} (${t.key})` : t.label}
        >
          <span className="auto-glyph">{t.glyph}</span>
          <span>{t.label}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * 고른 종류의 설정. 고른 칸이 있으면 그 칸을, 없으면 다음에 찍을 칸(draft)을 고친다.
 *
 * - `offsetMixed`·`formatMixed` — 여러 칸을 골랐는데 값이 서로 다를 때. 칩은 아무것도 켜지
 *   않고, 고르면 모두 그 형식이 된다(순번은 각자 그대로).
 */
export function FieldSettings({
  tile,
  spec,
  apply,
  picked,
  offsetMixed = false,
  formatMixed = false,
}: {
  tile: FieldTile;
  spec: FieldDraft & { offset?: number };
  apply: (patch: Partial<FieldSpec>) => void;
  picked: boolean;
  offsetMixed?: boolean;
  formatMixed?: boolean;
}) {
  const today = todayFrom(useStore((s) => s.today));
  const preview = (f: FieldDraft) =>
    f.kind === 'page' ? formatPageNo({ offset: 0, ...f }, 2, 33) : fieldValue({ offset: 0, ...f }, today) || '—';

  return (
    <div className="field-settings">
      {tile !== 'dday' && (
        <>
          {/* 표시 형식 버튼은 없앴다 — 코드로 직접 쓴다(2026-10-13 사용자 결정). 코드 표는 단추로 열고 닫는다. */}
          <CodeInput
            key={formatMixed ? '' : spec.format}
            value={formatMixed ? '' : spec.format}
            preview={(code) => preview({ ...spec, format: code })}
            placeholder={tile === 'page' ? 'n / N' : 'YYYY.MM.DD (ddd)'}
            onCommit={(code) => apply({ format: code })}
          />
          {tile === 'date' && (
            <label className="field-toggle" title="이 페이지 날짜가 든 한 주를 ‘시작~끝’으로(예: 10/12~10/18)">
              <input
                type="checkbox"
                checked={spec.kind === 'range'}
                onChange={(e) => apply({ kind: e.target.checked ? 'range' : undefined })}
              />
              한 주 범위(시작~끝)
            </label>
          )}
          <CodeGuide tile={tile} spec={spec} />
        </>
      )}

      {tile === 'dday' && (
        <>
          <PopRow label="기준일">
            <input type="date" value={spec.target ?? ''} onChange={(e) => apply({ format: '', kind: 'dday', target: e.target.value || undefined })} />
          </PopRow>
          <PopRow label="지난 뒤">
            <span className="seg">
              {(
                [
                  ['plus', 'D+3'],
                  ['blank', '비우기'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  className={(spec.after ?? 'plus') === id ? 'on' : ''}
                  onClick={() => apply({ kind: 'dday', after: id === 'plus' ? undefined : id })}
                >
                  {label}
                </button>
              ))}
            </span>
          </PopRow>
          {spec.target && <div className="period-summary">{preview({ ...spec, kind: 'dday' })}</div>}
        </>
      )}

      {tile === 'page' && (
        <>
          <PopRow label="시작 번호">
            <input
              type="number"
              min={0}
              value={spec.start ?? 1}
              onChange={(e) => apply({ start: Math.max(0, Math.round(Number(e.target.value) || 0)) })}
            />
          </PopRow>
        </>
      )}

      {usesDate(spec) &&
        (picked ? (
          <PopRow label="날짜">
            <span className="numfield" title="이 페이지에서 몇째 날짜를 쓸지">
              이 페이지의
              <input
                type="number"
                min={1}
                step={1}
                value={offsetMixed ? '' : (spec.offset ?? 0) + 1}
                placeholder={offsetMixed ? '—' : undefined}
                onChange={(e) => apply({ offset: Math.max(1, Math.round(Number(e.target.value) || 1)) - 1 })}
              />
              번째
            </span>
          </PopRow>
        ) : (
          <NextFieldRow />
        ))}
    </div>
  );
}

/**
 * 다음에 찍을 칸의 날짜 — ‘이 페이지의 n번째’와 ‘찍을 때마다 다음 날짜로’(세부계획 A4.3:
 * 배치할 때마다 날짜를 무조건 늘리지 않는다. 위클리처럼 칸마다 다른 날짜일 때만 켠다).
 */
function NextFieldRow() {
  const next = useStore((s) => s.fieldNext);
  const setNext = useStore((s) => s.setFieldNext);
  return (
    <>
      <PopRow label="날짜">
        <span className="numfield" title="다음에 놓을 칸이 이 페이지에서 몇째 날짜를 쓸지">
          이 페이지의
          <input
            type="number"
            min={1}
            step={1}
            value={next.offset + 1}
            onChange={(e) => setNext({ offset: Math.max(1, Math.round(Number(e.target.value) || 1)) - 1 })}
          />
          번째
        </span>
      </PopRow>
      <label className="field-toggle">
        <input type="checkbox" checked={next.advance} onChange={(e) => setNext({ advance: e.target.checked })} />
        놓을 때마다 다음 날짜로
      </label>
    </>
  );
}

/**
 * 달 모양(Moon 타일) — 날짜에 맞춰 차고 기우는 달(8단계, core/moon). 크기·굵기·색은 위쪽 막대.
 * 고른 달이 있으면 그 달의 날짜 순번을, 없으면 다음에 놓을 달의 순번을 정한다.
 */
export function MoonPanel({ moons, apply }: { moons: MoonObject[]; apply: (patch: MoonStyle) => void }) {
  const first = moons[0];
  const offsetMixed = moons.some((m) => m.offset !== first?.offset);
  return (
    <div className="field-settings">
      {first ? (
        <PopRow label="날짜">
          <span className="numfield" title="이 페이지에서 몇째 날짜의 달인지">
            이 페이지의
            <input
              type="number"
              min={1}
              step={1}
              value={offsetMixed ? '' : first.offset + 1}
              placeholder={offsetMixed ? '—' : undefined}
              onChange={(e) => apply({ offset: Math.max(1, Math.round(Number(e.target.value) || 1)) - 1 })}
            />
            번째
          </span>
        </PopRow>
      ) : (
        <NextFieldRow />
      )}
    </div>
  );
}

/** 형식 코드를 직접 쓰는 칸 — 치는 동안 미리보기만 바뀌고, Enter나 칸을 떠날 때 적용한다. */
/** 형식 코드 표 — 단추로 열고 닫는다(2026-10-13). 오늘 날짜로 실제 값을 함께 보여준다. */
const DATE_CODES: [code: string, meaning: string][] = [
  ['YYYY', '해'],
  ['YY', '해 두 자리'],
  ['M', '달'],
  ['MM', '달 두 자리'],
  ['MMM', '달 영어 약자'],
  ['MMMM', '달 영어'],
  ['D', '날'],
  ['DD', '날 두 자리'],
  ['ddd', '요일'],
  ['dddd', '요일 길게'],
  ['eee', '요일 영어'],
  ['eeee', '요일 영어 길게'],
  ['w', '주차'],
];

const PAGE_CODES: [code: string, meaning: string, example: string][] = [
  ['n', '번호', '3'],
  ['nn', '번호 두 자리', '03'],
  ['nnn', '번호 세 자리', '003'],
  ['N', '전체 장 수', '33'],
];

function CodeGuide({ tile, spec }: { tile: FieldTile; spec: FieldDraft }) {
  const today = todayFrom(useStore((s) => s.today));
  const [open, setOpen] = useState(false);
  const rows: [string, string, string][] =
    tile === 'page'
      ? PAGE_CODES
      : DATE_CODES.map(([code, meaning]) => [code, meaning, fieldValue({ ...spec, offset: 0, kind: undefined, format: code }, today)]);
  return (
    <div className="code-guide">
      <button className="ghost code-guide-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
        형식 코드 {open ? '▴' : '▾'}
      </button>
      {open && (
        <table>
          <tbody>
            {rows.map(([code, meaning, example]) => (
              <tr key={code}>
                <td className="code">{code}</td>
                <td>{meaning}</td>
                <td className="example">{example}</td>
              </tr>
            ))}
            <tr>
              <td className="code">{'{글자}'}</td>
              <td colSpan={2}>코드와 겹치는 글자는 그대로</td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );
}

function CodeInput({
  value,
  preview,
  placeholder,
  onCommit,
}: {
  value: string;
  preview: (code: string) => string;
  placeholder: string;
  onCommit: (code: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const commit = () => {
    if (draft.trim() !== '' && draft !== value) onCommit(draft);
  };
  return (
    <div className="code-input">
      <PopRow label="직접 입력">
        <input
          type="text"
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
          }}
        />
      </PopRow>
      {draft.trim() !== '' && <div className="code-preview">미리보기 {preview(draft)}</div>}
    </div>
  );
}
