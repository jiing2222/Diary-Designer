import { useEffect, useState } from 'react';
import { RingsLogo } from './icons';

/**
 * 시작 화면 — 처음 온 사람이 보는 곳.
 *
 * **앱 화면이 아니라 소개 화면이다.** 그래서 App의 머리줄·도구줄을 쓰지
 * 않고 자기 것을 따로 그린다(App.tsx가 이 화면일 때는 앱 껍데기를 아예
 * 그리지 않는다) — 폭도 앱처럼 화면 끝까지 가지 않고 1120px에서 멈춘다.
 *
 * 만든 양식이 있으면 여기 머물 이유가 없다. App이 되살리기를 마친 뒤
 * 양식이 있으면 곧장 갤러리로 보낸다 — 이 화면으로 돌아오는 길은 앱
 * 머리줄의 로고다.
 */

/**
 * 제목에서 돌아가는 낱말.
 *
 * "Make your ___ system" — 이 프로그램이 무엇을 만드는 것인지 한 낱말로
 * 못 박지 않으려는 것이다. 쓰는 사람마다 부르는 이름이 다르다(속지·플래너·
 * 바인더). 여러 개를 차례로 보여주면 "그중 내 것"이 있다.
 */
const HERO_WORDS = ['own', 'paper', 'planner', 'diary', 'binder'];

/** 낱말이 머무는 시간과, 사라졌다 나타나는 데 걸리는 시간. */
const WORD_HOLD_MS = 3400;
const WORD_FADE_MS = 200;

/** 아래 미리보기가 저절로 넘어가는 간격. */
const MOCK_CYCLE_MS = 4000;

type MockScreen = 'insert' | 'template' | 'print';

const MOCK_ORDER: MockScreen[] = ['insert', 'template', 'print'];

const MOCK_LABEL: Record<MockScreen, string> = {
  insert: 'M6 · 80 × 125mm · 2.5mm dots',
  template: 'All templates · 4',
  print: 'A4 · 4 per sheet (2 × 2)',
};

export function StartScreen({ onStart }: { onStart: () => void }) {
  return (
    <div className="start">
      <StartHeader onStart={onStart} />
      <main className="start-main">
        <Hero onStart={onStart} />
        <ProductMock />
        <FeatureCards onStart={onStart} />
      </main>
    </div>
  );
}

function StartHeader({ onStart }: { onStart: () => void }) {
  return (
    <header className="start-header">
      <div className="start-header-inner">
        <div className="start-logo">
          <RingsLogo />
          <span>Rings</span>
        </div>

        {/*
          앱 안으로 들어가는 문이 넷처럼 보이지만 실제로는 하나다 — 어느
          것을 눌러도 갤러리에서 시작한다. 양식을 고르기 전에는 편집할
          것도 인쇄할 것도 없기 때문이다. Notebooks는 아직 열지 않았다.
        */}
        <nav className="start-nav">
          <button onClick={onStart}>Template</button>
          <button onClick={onStart}>Inserts</button>
          <button className="off" disabled title="Coming soon">
            Notebooks
          </button>
          <button onClick={onStart}>Print</button>
        </nav>

        <div className="start-header-right">
          <button className="ghost" disabled title="Coming soon">
            Sign in
          </button>
          <button className="primary" onClick={onStart}>
            Start Rings — it's free
          </button>
        </div>
      </div>
    </header>
  );
}

function Hero({ onStart }: { onStart: () => void }) {
  const word = useRotatingWord();

  return (
    <section className="start-hero">
      <h1>
        <div>Make your</div>
        <div className="start-hero-line">
          {/*
            낱말이 바뀌어도 줄이 흔들리지 않도록 자리를 미리 잡아둔다.
            길이가 제각각이라(own ↔ planner) 폭을 안 고정하면 "system"이
            바뀔 때마다 좌우로 밀린다.
          */}
          <span className="start-hero-slot">
            <span className={`start-hero-word ${word.fading ? 'out' : ''}`}>
              <span className="start-hero-dot" />
              <em>{word.text}</em>
            </span>
          </span>
          <span>system</span>
        </div>
      </h1>

      <p className="start-lede">
        Draw freely on the dot grid, then print it at exactly the size your binder takes.
      </p>

      <button className="primary start-cta" onClick={onStart}>
        Start Rings — it's free
      </button>

      <div className="start-meta">
        <span>M6 · A5 · A6 · Personal</span>
        <span className="start-meta-sep" />
        <span>No sign-up needed</span>
      </div>
    </section>
  );
}

/**
 * 제목의 낱말을 돌린다.
 *
 * 사라지는 동안(`fading`)에는 낱말을 바꾸지 않는다 — 흐려지는 도중에
 * 글자가 바뀌면 두 낱말이 겹쳐 보인다. 다 사라진 뒤에 갈아 끼운다.
 *
 * 움직임을 꺼둔 사람에게는 첫 낱말만 보여주고 아예 돌리지 않는다 —
 * 애니메이션을 줄여달라는 요청은 "천천히"가 아니라 "멈춰라"에 가깝다.
 */
function useRotatingWord(): { text: string; fading: boolean } {
  const [index, setIndex] = useState(0);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let swap: ReturnType<typeof setTimeout>;
    const tick = setInterval(() => {
      setFading(true);
      swap = setTimeout(() => {
        setIndex((i) => (i + 1) % HERO_WORDS.length);
        setFading(false);
      }, WORD_FADE_MS);
    }, WORD_HOLD_MS);

    return () => {
      clearInterval(tick);
      clearTimeout(swap);
    };
  }, []);

  return { text: HERO_WORDS[index], fading };
}

/**
 * 앱이 어떻게 생겼는지 보여주는 상자.
 *
 * 실제 앱을 띄우지 않고 그림으로 흉내 낸다. 진짜를 띄우면 소개 화면이
 * 앱 전체를 끌고 들어와야 하고, 아직 양식이 하나도 없는 사람에게는
 * 빈 화면만 보인다.
 *
 * 저절로 넘어가되 눌러서 고를 수도 있다. 직접 고르면 저절로 넘어가는
 * 시계를 다시 맞춘다 — 보려던 것이 곧바로 넘어가버리면 답답하다.
 */
function ProductMock() {
  const [screen, setScreen] = useState<MockScreen>('insert');
  const [pinnedAt, setPinnedAt] = useState(0);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = setInterval(() => {
      setScreen((s) => MOCK_ORDER[(MOCK_ORDER.indexOf(s) + 1) % MOCK_ORDER.length]);
    }, MOCK_CYCLE_MS);
    return () => clearInterval(t);
  }, [pinnedAt]);

  function pick(s: MockScreen) {
    setScreen(s);
    setPinnedAt((n) => n + 1);
  }

  return (
    <div className="start-mock">
      <div className="start-mock-bar">
        <div className="start-mock-pills">
          {MOCK_ORDER.map((s) => (
            <button
              key={s}
              className={screen === s ? 'on' : ''}
              onClick={() => pick(s)}
              aria-pressed={screen === s}
            >
              {s === 'insert' ? 'Inserts' : s === 'template' ? 'Template' : 'Print'}
            </button>
          ))}
        </div>
        <span className="start-mock-label">{MOCK_LABEL[screen]}</span>
      </div>

      <div className="start-mock-body">
        {screen === 'insert' && <InsertMock />}
        {screen === 'template' && <TemplateMock />}
        {screen === 'print' && <PrintMock />}
      </div>
    </div>
  );
}

function MockPanel({ title, items, activeIndex }: { title: string; items: string[]; activeIndex: number }) {
  return (
    <div className="start-mock-side">
      <div className="start-mock-side-title">{title}</div>
      <div className="start-mock-list">
        {items.map((it, i) => (
          <div key={it} className={i === activeIndex ? 'on' : ''}>
            {it}
          </div>
        ))}
      </div>
    </div>
  );
}

function InsertMock() {
  return (
    <>
      <MockPanel title="Elements" items={['Text', 'Table', 'Check box', 'Image', 'Calendar']} activeIndex={0} />

      <div className="start-mock-stage">
        {/* 속지 한 장. 실제 M6 비율(80 × 125mm) 그대로다. */}
        <svg viewBox="0 0 80 125" preserveAspectRatio="xMidYMid meet" className="start-mock-sheet">
          <defs>
            <pattern id="startDots" width="2.5" height="2.5" patternUnits="userSpaceOnUse">
              <circle cx="1.25" cy="1.25" r="0.16" fill="#c2c2bc" />
            </pattern>
          </defs>
          <rect x="0" y="0" width="80" height="125" fill="#fff" />
          <rect x="6" y="6" width="68" height="113" fill="url(#startDots)" />
          <rect x="8" y="11" width="24" height="3" rx="0.5" fill="#1c1c1a" />
          <rect x="8" y="18" width="64" height="0.3" fill="#1c1c1a" />
          <g stroke="#8e8e88" strokeWidth="0.22" fill="none">
            <path d="M8 24 H72 M8 38 H72 M8 52 H72 M8 66 H72" />
            <path d="M8 24 V66 M24 24 V66 M40 24 V66 M56 24 V66 M72 24 V66" />
          </g>
          <g>
            <rect x="8" y="74" width="2.6" height="2.6" fill="none" stroke="#8e8e88" strokeWidth="0.22" />
            <rect x="13" y="75" width="40" height="0.3" fill="#c2c2bc" />
            <rect x="8" y="81" width="2.6" height="2.6" fill="none" stroke="#8e8e88" strokeWidth="0.22" />
            <rect x="13" y="82" width="48" height="0.3" fill="#c2c2bc" />
            <rect x="8" y="88" width="2.6" height="2.6" fill="none" stroke="#8e8e88" strokeWidth="0.22" />
            <rect x="13" y="89" width="34" height="0.3" fill="#c2c2bc" />
          </g>
          <rect x="8" y="98" width="64" height="0.3" fill="#1c1c1a" />
          {/* 고른 것 하나 — 네 귀에 손잡이가 붙어 있다. */}
          <rect x="7.4" y="103" width="30" height="10" fill="none" stroke="#2f6f4f" strokeWidth="0.3" />
          <g fill="#2f6f4f">
            <rect x="6.6" y="102.2" width="1.6" height="1.6" />
            <rect x="36.6" y="102.2" width="1.6" height="1.6" />
            <rect x="6.6" y="112.2" width="1.6" height="1.6" />
            <rect x="36.6" y="112.2" width="1.6" height="1.6" />
          </g>
        </svg>
      </div>

      <div className="start-mock-side right">
        <div className="start-mock-side-title">Selected · Table</div>
        <div className="start-mock-fields">
          <MockField label="X" value="8.0mm" />
          <MockField label="Y" value="103.0mm" />
          <MockField label="Width" value="30.0mm" />
          <MockField label="Height" value="10.0mm" />
        </div>
        <div className="start-mock-foot">Snaps to the grid · 2.5mm</div>
      </div>
    </>
  );
}

function MockField({ label, value }: { label: string; value: string }) {
  return (
    <div className="start-mock-field">
      <span>{label}</span>
      <span className="start-mock-value">{value}</span>
    </div>
  );
}

function TemplateMock() {
  const cards = [
    { name: 'M6-1', size: '80 × 125mm', on: true },
    { name: 'M6-2', size: '80 × 125mm', on: false },
    { name: 'A5-1', size: '148 × 210mm', on: false },
  ];

  return (
    <>
      <MockPanel title="View" items={['All', 'Images', 'Fonts']} activeIndex={0} />

      <div className="start-mock-stage">
        <div className="start-mock-cards">
          {cards.map((c) => (
            <div key={c.name} className={`start-mock-card ${c.on ? 'on' : ''}`}>
              <div className="start-mock-thumb" />
              <div className="start-mock-card-name">{c.name}</div>
              <div className="start-mock-card-size">{c.size}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="start-mock-side right">
        <div className="start-mock-side-title">Size</div>
        <div className="start-mock-sizes">
          <div>A5 · A6</div>
          <div className="on">M6 · M5</div>
          <div>ETC</div>
        </div>
      </div>
    </>
  );
}

function PrintMock() {
  return (
    <>
      <MockPanel title="Settings" items={['Paper', 'View', 'Insert']} activeIndex={0} />

      <div className="start-mock-stage">
        {/* A4 한 장에 M6 넉 장. 모서리의 짧은 선이 재단 표시다. */}
        <svg viewBox="0 0 210 297" preserveAspectRatio="xMidYMid meet" className="start-mock-sheet">
          <rect x="0" y="0" width="210" height="297" fill="#fff" />
          <g fill="none" stroke="#dededa" strokeWidth="0.8">
            <rect x="15" y="15" width="80" height="125" />
            <rect x="115" y="15" width="80" height="125" />
            <rect x="15" y="150" width="80" height="125" />
            <rect x="115" y="150" width="80" height="125" />
          </g>
          <g fill="#c2c2bc">
            <rect x="24" y="24" width="20" height="3" rx="0.6" />
            <rect x="124" y="24" width="20" height="3" rx="0.6" />
            <rect x="24" y="159" width="20" height="3" rx="0.6" />
            <rect x="124" y="159" width="20" height="3" rx="0.6" />
          </g>
          <g stroke="#b6b6b0" strokeWidth="0.4">
            <path d="M0 6 H6 M0 12 V0" />
            <path d="M204 6 H210 M210 12 V0" />
            <path d="M0 291 H6 M0 285 V297" />
            <path d="M204 291 H210 M210 285 V297" />
          </g>
        </svg>
      </div>

      <div className="start-mock-side right">
        <div className="start-mock-side-title">Slot assignment</div>
        <div className="start-mock-slots">
          <span className="a" />
          <span className="b" />
          <span className="a" />
          <span className="b" />
        </div>
        <div className="start-mock-foot">4 per sheet · 2 × 2</div>
      </div>
    </>
  );
}

const FEATURES: { title: string; tone: 'accent' | 'soft' | 'ink' | 'muted' }[] = [
  { title: 'Start a new diary', tone: 'accent' },
  { title: 'Get the dots right for your size', tone: 'soft' },
  { title: 'Hand it straight to a print shop', tone: 'ink' },
  { title: 'Share a finished insert', tone: 'muted' },
  { title: 'Lay out many sheets at once', tone: 'accent' },
];

function FeatureCards({ onStart }: { onStart: () => void }) {
  return (
    <section className="start-features">
      <p className="start-features-title">What you can do with Rings</p>
      <div className="start-feature-grid">
        {FEATURES.map((f, i) => (
          <button key={f.title} className="start-feature" onClick={onStart}>
            <span className={`start-feature-icon ${f.tone}`}>
              <FeatureIcon index={i} />
            </span>
            <span className="start-feature-name">
              {f.title} <span className="start-feature-arrow">→</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function FeatureIcon({ index }: { index: number }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: '#fff',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  if (index === 1) {
    return (
      <svg {...common} strokeWidth={0}>
        {[7, 12, 17].map((y) =>
          [7, 12, 17].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.3" fill="#fff" />),
        )}
      </svg>
    );
  }
  if (index === 2) {
    return (
      <svg {...common}>
        <path d="M6 3h9l4 4v14H6z" />
        <path d="M15 3v4h4" />
      </svg>
    );
  }
  if (index === 3) {
    return (
      <svg {...common}>
        <rect x="4" y="5" width="16" height="14" rx="1.5" />
        <circle cx="9" cy="10" r="1.4" fill="#fff" stroke="none" />
        <path d="M5 17l4.5-5 3 3 3-4 4.5 6" />
      </svg>
    );
  }
  if (index === 4) {
    return (
      <svg {...common}>
        <rect x="4" y="4" width="7" height="7" rx="1" />
        <rect x="13" y="4" width="7" height="7" rx="1" />
        <rect x="4" y="13" width="7" height="7" rx="1" />
        <rect x="13" y="13" width="7" height="7" rx="1" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <rect x="4" y="4" width="7" height="9" rx="1" />
      <rect x="13" y="4" width="7" height="6" rx="1" />
      <rect x="13" y="12" width="7" height="8" rx="1" />
      <rect x="4" y="15" width="7" height="5" rx="1" />
    </svg>
  );
}
