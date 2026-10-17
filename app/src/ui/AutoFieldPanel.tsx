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
import { t } from '../lang';

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
      {TILES.map((tile) => (
        <button
          key={tile.id}
          className={`tool-tile ${active === tile.id ? 'on' : ''}`}
          onClick={() => onPick(tile.id)}
          title={tile.key ? `${tile.label} (${tile.key})` : tile.label}
        >
          <span className="auto-glyph">{tile.glyph}</span>
          <span>{tile.label}</span>
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
            <label className="field-toggle" title={t('이 페이지 날짜가 든 한 주를 ‘시작~끝’으로(예: 10/12~10/18)', "The week containing this page's date as start–end (e.g. 10/12–10/18)")}>
              <input
                type="checkbox"
                checked={spec.kind === 'range'}
                onChange={(e) => apply({ kind: e.target.checked ? 'range' : undefined })}
              />
              {t('한 주 범위(시작~끝)', 'Week range (start–end)')}
            </label>
          )}
          <CodeGuide tile={tile} spec={spec} />
        </>
      )}

      {tile === 'dday' && (
        <>
          <PopRow label={t('기준일', 'Reference date')}>
            <input type="date" value={spec.target ?? ''} onChange={(e) => apply({ format: '', kind: 'dday', target: e.target.value || undefined })} />
          </PopRow>
          <PopRow label={t('지난 뒤', 'After it passes')}>
            <span className="seg">
              {(
                [
                  ['plus', 'D+3'],
                  ['blank', t('비우기', 'Blank')],
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
          <PopRow label={t('시작 번호', 'Start number')}>
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
          <PopRow label={t('날짜', 'Date')}>
            <span className="numfield" title={t('이 페이지에서 몇째 날짜를 쓸지', 'Which date on this page to use')}>
              {t('이 페이지의', 'Date')}
              <input
                type="number"
                min={1}
                step={1}
                value={offsetMixed ? '' : (spec.offset ?? 0) + 1}
                placeholder={offsetMixed ? '—' : undefined}
                onChange={(e) => apply({ offset: Math.max(1, Math.round(Number(e.target.value) || 1)) - 1 })}
              />
              {t('번째', 'on this page')}
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
      <PopRow label={t('날짜', 'Date')}>
        <span className="numfield" title={t('다음에 놓을 칸이 이 페이지에서 몇째 날짜를 쓸지', 'Which date on this page the next field uses')}>
          {t('이 페이지의', 'Date')}
          <input
            type="number"
            min={1}
            step={1}
            value={next.offset + 1}
            onChange={(e) => setNext({ offset: Math.max(1, Math.round(Number(e.target.value) || 1)) - 1 })}
          />
          {t('번째', 'on this page')}
        </span>
      </PopRow>
      <label className="field-toggle">
        <input type="checkbox" checked={next.advance} onChange={(e) => setNext({ advance: e.target.checked })} />
        {t('놓을 때마다 다음 날짜로', 'Next date each time you place one')}
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
        <PopRow label={t('날짜', 'Date')}>
          <span className="numfield" title={t('이 페이지에서 몇째 날짜의 달인지', "Which date's month on this page")}>
            {t('이 페이지의', 'Date')}
            <input
              type="number"
              min={1}
              step={1}
              value={offsetMixed ? '' : first.offset + 1}
              placeholder={offsetMixed ? '—' : undefined}
              onChange={(e) => apply({ offset: Math.max(1, Math.round(Number(e.target.value) || 1)) - 1 })}
            />
            {t('번째', 'on this page')}
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
// 함수로 둔다 — 모듈을 읽을 때 한 번 정하면 언어가 바뀌어도 그대로 남는다.
const dateCodes = (): [code: string, meaning: string][] => [
  ['YYYY', t('해', 'Year')],
  ['YY', t('해 두 자리', 'Year, 2 digits')],
  ['M', t('달', 'Month')],
  ['MM', t('달 두 자리', 'Month, 2 digits')],
  ['MMM', t('달 영어 약자', 'Month, short')],
  ['MMMM', t('달 영어', 'Month, full')],
  ['D', t('날', 'Day')],
  ['DD', t('날 두 자리', 'Day, 2 digits')],
  ['ddd', t('요일', 'Weekday (Korean)')],
  ['dddd', t('요일 길게', 'Weekday, long (Korean)')],
  ['eee', t('요일 영어', 'Weekday')],
  ['eeee', t('요일 영어 길게', 'Weekday, long')],
  ['w', t('주차', 'Week number')],
];

const pageCodes = (): [code: string, meaning: string, example: string][] => [
  ['n', t('번호', 'Number'), '3'],
  ['nn', t('번호 두 자리', 'Number, 2 digits'), '03'],
  ['nnn', t('번호 세 자리', 'Number, 3 digits'), '003'],
  ['N', t('전체 장 수', 'Total pages'), '33'],
];

function CodeGuide({ tile, spec }: { tile: FieldTile; spec: FieldDraft }) {
  const today = todayFrom(useStore((s) => s.today));
  const [open, setOpen] = useState(false);
  const rows: [string, string, string][] =
    tile === 'page'
      ? pageCodes()
      : dateCodes().map(([code, meaning]) => [code, meaning, fieldValue({ ...spec, offset: 0, kind: undefined, format: code }, today)]);
  return (
    <div className="code-guide">
      <button className="ghost code-guide-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
        {t('형식 코드', 'Format codes')} {open ? '▴' : '▾'}
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
              <td className="code">{t('{글자}', '{text}')}</td>
              <td colSpan={2}>{t('코드와 겹치는 글자는 그대로', 'Text that clashes with a code stays as typed')}</td>
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
      <PopRow label={t('직접 입력', 'Custom')}>
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
      {draft.trim() !== '' && <div className="code-preview">{t('미리보기', 'Preview')} {preview(draft)}</div>}
    </div>
  );
}
