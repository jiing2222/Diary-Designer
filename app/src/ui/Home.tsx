import { useState } from 'react';

/**
 * 토성 홈(리뉴얼, design/리뉴얼/디자인.md ‘토성 홈 그림 (4차 스케치)’).
 *
 * 행성은 Create, 안쪽 링은 Learn, 바깥 링은 Library. 글자는 평소에 보이지 않고
 * 마우스를 올리거나 키보드로 고르면 그 자리의 색이 진해지며 알약 이름표가 뜬다.
 * 링은 앞쪽 반과 뒤쪽 반을 따로 그린다 — 뒤쪽 반은 행성 뒤로 숨고 앞쪽 반은 행성 위를
 * 지나간다. 두 반 모두 같은 링이라 마우스를 올리면 함께 진해진다.
 */
type Spot = 'planet' | 'inner' | 'outer';

const RING = {
  inner: { rx: 184, ry: 50, d: 'M156 210 A184 50 0 0 1 524 210', front: 'M156 210 A184 50 0 0 0 524 210' },
  outer: { rx: 234, ry: 72, d: 'M106 210 A234 72 0 0 1 574 210', front: 'M106 210 A234 72 0 0 0 574 210' },
};

export function Home({ onCreate, onLibrary, onLearn }: { onCreate: () => void; onLibrary: () => void; onLearn: () => void }) {
  const [hot, setHot] = useState<Spot | null>(null);
  const action: Record<Spot, () => void> = { planet: onCreate, inner: onLearn, outer: onLibrary };

  const bind = (spot: Spot) => ({
    onMouseEnter: () => setHot(spot),
    onMouseLeave: () => setHot((h) => (h === spot ? null : h)),
    onFocus: () => setHot(spot),
    onBlur: () => setHot((h) => (h === spot ? null : h)),
    onClick: action[spot],
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        action[spot]();
      }
    },
    tabIndex: 0,
    role: 'button',
  });

  const ring = (spot: 'inner' | 'outer', half: 'back' | 'front') => {
    const r = RING[spot];
    const d = half === 'back' ? r.d : r.front;
    return (
      <g className={`home-ring ${spot} ${hot === spot ? 'on' : ''}`} {...(half === 'front' ? bind(spot) : {})} aria-label={spot === 'inner' ? 'Learn' : 'Library'}>
        <path className="band" d={d} />
        <path className="particles" d={half === 'back' ? d : flip(d)} />
        <path className="hit" d={d} onMouseEnter={() => setHot(spot)} onMouseLeave={() => setHot((h) => (h === spot ? null : h))} onClick={action[spot]} />
      </g>
    );
  };

  return (
    <div className="home">
      <svg className="home-saturn" viewBox="0 0 680 400" role="img" aria-label="Rings 홈">
        <defs>
          <clipPath id="home-planet-clip">
            <circle cx="340" cy="205" r="92" />
          </clipPath>
          <g id="home-stripes">
            <path d="M0 150 q46 -10 92 0 t92 0" className="stripe dark" strokeWidth="10" />
            <path d="M0 188 q46 8 92 0 t92 0" className="stripe light" strokeWidth="7" />
            <path d="M0 222 q46 -8 92 0 t92 0" className="stripe dark" strokeWidth="13" />
            <path d="M0 258 q46 6 92 0 t92 0" className="stripe light" strokeWidth="6" />
          </g>
        </defs>
        <g className="home-stars">
          <path className="star tw" d="M600 100 l3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 8 -3z" />
          <path className="star tw" style={{ animationDelay: '1s' }} d="M100 290 l2.4 6 6 2.4 -6 2.4 -2.4 6 -2.4 -6 -6 -2.4 6 -2.4z" />
          <circle className="star tw" style={{ animationDelay: '.4s' }} cx="90" cy="130" r="3" />
          <circle className="star" cx="140" cy="110" r="3.5" />
          <circle className="star tw" style={{ animationDelay: '1.6s' }} cx="180" cy="145" r="3" />
          <circle className="star" cx="540" cy="310" r="3" />
          <circle className="star tw" style={{ animationDelay: '2s' }} cx="585" cy="280" r="3.5" />
          <circle className="star tw" cx="480" cy="62" r="2.2" />
        </g>
        <g transform="rotate(-14 340 210)">
          {ring('outer', 'back')}
          {ring('inner', 'back')}
        </g>
        <g className={`home-planet ${hot === 'planet' ? 'on' : ''}`} {...bind('planet')} aria-label="Create">
          <circle className="body" cx="340" cy="205" r="92" />
          <g clipPath="url(#home-planet-clip)">
            <g transform="translate(248 0)">
              <g className="spin">
                <use href="#home-stripes" />
                <use href="#home-stripes" x="184" />
              </g>
            </g>
          </g>
          <circle className="outline" cx="340" cy="205" r="92" />
        </g>
        <g transform="rotate(-14 340 210)">
          {ring('inner', 'front')}
          {ring('outer', 'front')}
        </g>
        <Pill show={hot === 'planet'} x={340} y={206} label="Create" tone="brown" />
        <Pill show={hot === 'inner'} x={462} y={274} label="Learn" tone="blue" />
        <Pill show={hot === 'outer'} x={548} y={316} label="Library" tone="blue" />
      </svg>
    </div>
  );
}

/** 링의 앞쪽 반은 입자가 반대 방향으로 흘러야 한 바퀴로 이어져 보인다 — 경로 방향을 뒤집는다. */
function flip(d: string): string {
  const m = d.match(/^M(\S+) (\S+) A(\S+) (\S+) 0 0 0 (\S+) (\S+)$/);
  if (!m) return d;
  const [, x1, y1, rx, ry, x2, y2] = m;
  return `M${x2} ${y2} A${rx} ${ry} 0 0 1 ${x1} ${y1}`;
}

function Pill({ show, x, y, label, tone }: { show: boolean; x: number; y: number; label: string; tone: 'brown' | 'blue' }) {
  const width = label.length * 9 + 28;
  return (
    <g className={`home-pill ${tone} ${show ? 'on' : ''}`} transform={`translate(${x - width / 2} ${y - 16})`}>
      <rect width={width} height={32} rx={16} />
      <text x={width / 2} y={21} textAnchor="middle">
        {label}
      </text>
    </g>
  );
}
