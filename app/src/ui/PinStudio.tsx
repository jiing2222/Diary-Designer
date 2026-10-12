import { useMemo, useRef, useState } from 'react';
import { facesOf, useStore } from '../store';
import { isTrashed } from '../core/library';
import { resolveObjectColors } from '../core/colors';
import { resolveRuleColors } from '../core/colorRules';
import { holeMarks } from '../core/punch';
import { sheetSideOf, type ResolvedFace, type Work } from '../core/work';
import type { Diary } from '../core/diary';
import { pinText, titleLines } from '../core/pins';
import { fontBytes } from '../fonts/registry';
import { InsertView } from './InsertView';

/**
 * Pin Studio — 핀터레스트 홍보 이미지 만들기(개발용, Library → Pins. 개발 서버에서만 보인다).
 *
 * 면 하나가 핀 하나다. 속지는 편집기·작업 카드와 **같은 InsertView**로 그려서, 화면에서 본 것과
 * 핀 이미지가 어긋나지 않는다. PNG로 바꿀 때는 SVG를 그림으로 그리는데, 그림 안에서는 문서의
 * CSS와 글꼴이 안 보이므로 계산된 스타일을 속성으로 옮기고 글꼴 파일을 SVG 안에 심는다.
 */

const W = 1000;
const H = 1500;
const BG = '#f3efe7';
const INK = '#2e2723';
const SUB = '#6b6158';
/** 속지가 앉는 자리(px). */
const AREA = { x: 90, y: 230, w: 820, h: 1060 };
/** 한 작업에서 미리 그리는 최대 면 수 — 날짜 페이지 365장을 한꺼번에 그리면 화면이 멈춘다. */
const MAX_FACES = 24;

export function PinStudio() {
  const works = useStore((s) => s.works);
  const diaries = useStore((s) => s.diaries);
  const today = useStore((s) => s.today);
  const live = works.filter((w) => !isTrashed(w));
  const [workId, setWorkId] = useState(live[0]?.id ?? '');
  const work = live.find((w) => w.id === workId) ?? live[0];
  const diary = diaries.find((d) => d.id === work?.diaryId);
  const faces = useMemo(() => (work ? facesOf(work, today) : []), [work, today]);

  if (!work || !diary) return <div className="library-pane"><h2>Pins</h2><p className="muted">작업이 없어요.</p></div>;

  const shown = faces.slice(0, MAX_FACES);
  return (
    <div className="library-pane pin-studio">
      <div className="library-head">
        <h2>Pins</h2>
        <select value={work.id} onChange={(e) => setWorkId(e.target.value)}>
          {live.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
      </div>
      <p className="muted">
        면 하나가 핀 하나예요(1000×1500). PNG를 저장해 핀터레스트에 올리고, 제목·설명·보드는 복사해 붙여넣으세요.
        {faces.length > MAX_FACES && ` 앞의 ${MAX_FACES}면만 보여요.`}
      </p>
      <div className="pin-grid">
        {shown.map((f, i) => (
          <PinCard key={f.key} work={work} diary={diary} face={f} index={i} count={faces.length} />
        ))}
      </div>
    </div>
  );
}

function PinCard({ work, diary, face, index, count }: { work: Work; diary: Diary; face: ResolvedFace; index: number; count: number }) {
  const ref = useRef<SVGSVGElement>(null);
  const userFonts = useStore((s) => s.userFonts);
  const auto = pinText({ ...diary, holeCount: diary.punch.holeCount }, index + 1, count);
  const [title, setTitle] = useState(auto.title);
  const [busy, setBusy] = useState(false);
  const mirror = sheetSideOf(index, work.duplex).side === 'back';

  const scale = Math.min(AREA.w / diary.width, AREA.h / diary.height);
  const iw = diary.width * scale;
  const ih = diary.height * scale;
  const ix = AREA.x + (AREA.w - iw) / 2;
  const iy = AREA.y + (AREA.h - ih) / 2;
  const lines = titleLines(title);

  async function save() {
    if (!ref.current) return;
    setBusy(true);
    try {
      const fonts = await fontFaces(ref.current, userFonts);
      const png = await svgToPng(ref.current, fonts);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(png);
      a.download = `${work.name}-p${index + 1}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pin-card">
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="pin-preview" xmlns="http://www.w3.org/2000/svg">
        <rect width={W} height={H} fill={BG} />
        {lines.map((l, i) => (
          <text key={i} x={W / 2} y={lines.length === 1 ? 140 : 110 + i * 68} textAnchor="middle" fontSize="56" fontWeight="700" fontFamily="Pretendard" fill={INK}>
            {l}
          </text>
        ))}
        {/* 종이가 바탕에서 뜨도록 살짝 어긋난 그림자 한 장 — 필터 없이(그림으로 옮길 때 안전하다). */}
        <rect x={ix + 6} y={iy + 8} width={iw} height={ih} fill="#000" fillOpacity="0.07" />
        <svg x={ix} y={iy} width={iw} height={ih} viewBox={`0 0 ${diary.width} ${diary.height}`}>
          <rect width={diary.width} height={diary.height} fill="#fff" />
          <InsertView
            insert={diary}
            grid={face.background}
            objects={resolveObjectColors(face.objects, work.palette)}
            safeZoneWidth={diary.punch.safeZoneWidth}
            mode="print"
            mirror={mirror}
            calendarContext={{
              year: face.month.year,
              page: face.month.month - 1,
              rules: face.colorRules ?? resolveRuleColors(work.colorRules, work.palette),
            }}
          />
          {/* 링 바인더 속지라는 것을 한눈에 — 실제 구멍 자리·지름(다이어리의 타공 설정) 그대로 뚫는다. */}
          {holeMarks(diary.width, diary.height, diary.punch, mirror).map((h, i) => (
            <circle key={i} cx={h.cx} cy={h.cy} r={h.r} fill={BG} />
          ))}
        </svg>
        <rect x={ix} y={iy} width={iw} height={ih} fill="none" stroke="#d9d4cb" strokeWidth="2" />
        <text x={W / 2} y={1365} textAnchor="middle" fontSize="30" fontFamily="Pretendard" fill={SUB}>{auto.sizeLine}</text>
        <text x={W / 2} y={1430} textAnchor="middle" fontSize="30" fontWeight="700" fontFamily="Pretendard" fill={INK}>Rings</text>
      </svg>
      <input className="pin-title" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="핀 제목" />
      <p className="muted pin-board">보드: {auto.board}</p>
      <div className="pin-actions">
        <button className="primary" disabled={busy} onClick={() => void save()}>{busy ? '저장 중…' : 'PNG 저장'}</button>
        <button className="ghost" onClick={() => void navigator.clipboard.writeText(title)}>제목 복사</button>
        <button className="ghost" onClick={() => void navigator.clipboard.writeText(auto.description)}>설명 복사</button>
      </div>
    </div>
  );
}

/* ────────────────────────── SVG → PNG ────────────────────────── */

/** 그림 속 SVG에는 문서 CSS가 안 닿는다 — 칠·선·글꼴처럼 모양을 정하는 값만 속성으로 옮긴다. */
const STYLE_PROPS = [
  'fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin',
  'stroke-opacity', 'opacity', 'font-family', 'font-size', 'font-weight', 'font-style', 'visibility', 'display',
];

/** 이 그림에 쓰인 글꼴만 data URL로 — 기본 글꼴(Pretendard 보통·굵게)과 등록한 글꼴 중 쓰인 것. */
async function fontFaces(svg: SVGSVGElement, userFonts: { id: string; family: string }[]): Promise<string> {
  const markup = svg.outerHTML;
  const faces: string[] = [];
  for (const [file, weight] of [['Pretendard-Regular.ttf', 400], ['Pretendard-Bold.ttf', 700]] as const) {
    const blob = await (await fetch(`/fonts/${file}`)).blob();
    faces.push(`@font-face{font-family:'Pretendard';font-weight:${weight};src:url(${await dataUrl(blob)})}`);
  }
  for (const f of userFonts) {
    const buf = fontBytes(f.id);
    if (buf && markup.includes(f.family)) faces.push(`@font-face{font-family:'${f.family}';src:url(${await dataUrl(new Blob([buf]))})}`);
  }
  return faces.join('');
}

async function svgToPng(svg: SVGSVGElement, fontCss: string): Promise<Blob> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const from = [svg, ...svg.querySelectorAll('*')];
  const to = [clone, ...clone.querySelectorAll('*')];
  from.forEach((el, i) => {
    const cs = getComputedStyle(el);
    const style = STYLE_PROPS.map((p) => `${p}:${cs.getPropertyValue(p)}`).join(';');
    to[i].setAttribute('style', style);
  });
  clone.setAttribute('width', String(W));
  clone.setAttribute('height', String(H));
  const styleEl = document.createElementNS('http://www.w3.org/2000/svg', 'style');
  styleEl.textContent = fontCss;
  clone.insertBefore(styleEl, clone.firstChild);

  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('핀 이미지를 그리지 못했어요'));
      img.src = url;
    });
    // 글꼴이 그림 안에서 다 읽히기 전에 그리면 기본 글꼴로 찍힌다 — 한 박자 기다린다.
    await new Promise((r) => setTimeout(r, 150));
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    canvas.getContext('2d')!.drawImage(img, 0, 0, W, H);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG로 바꾸지 못했어요'))), 'image/png'),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

function dataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error('파일을 읽지 못했어요'));
    r.readAsDataURL(blob);
  });
}
