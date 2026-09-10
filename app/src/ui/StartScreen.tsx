import { useEffect, useState } from 'react';
import { RingsLogo } from './icons';

/**
 * 시작 화면 — 처음 온 사람이 보는 곳.
 *
 * **앱 화면이 아니라 소개 화면이다.** 그래서 App의 머리줄·도구줄을 쓰지
 * 않고 자기 것을 따로 그린다(App.tsx가 이 화면일 때는 앱 껍데기를 아예
 * 그리지 않는다) — 폭도 앱처럼 화면 끝까지 가지 않고 1120px에서 멈춘다.
 *
 * 저장된 양식이 있어도 새로고침하면 여기서 시작한다. 앱 머리줄의 로고로도
 * 이 화면에 돌아올 수 있다.
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
  insert: 'M6 · 80 × 125mm · 2.5mm 도트',
  template: '전체 템플릿 · 4개',
  print: 'A4 · 4 per sheet (2 × 2)',
};

export function StartScreen({ onStart, onNavigate }: {
  onStart: () => void;
  onNavigate: (page: 'gallery' | 'edit' | 'print') => void;
}) {
  // 자동 전환 상태는 중앙 소개 미리보기에서만 사용한다.
  const [screen, setScreen] = useState<MockScreen>('insert');
  const [pinnedAt, setPinnedAt] = useState(0);

  useEffect(() => {
    const t = setInterval(() => {
      setScreen((s) => MOCK_ORDER[(MOCK_ORDER.indexOf(s) + 1) % MOCK_ORDER.length]);
    }, MOCK_CYCLE_MS);
    return () => clearInterval(t);
  }, [pinnedAt]);

  function pick(s: MockScreen) {
    setScreen(s);
    // 직접 골랐으면 시계를 다시 맞춘다 — 보려던 것이 곧바로 넘어가면 답답하다.
    setPinnedAt((n) => n + 1);
  }

  return (
    <div className="start">
      <StartHeader onNavigate={onNavigate} onStart={onStart} />
      <main className="start-main">
        <Hero onStart={onStart} />
        <ProductMock screen={screen} onPick={pick} />
        <Showcase onStart={onStart} />
      </main>
    </div>
  );
}

function StartHeader({
  onNavigate,
  onStart,
}: {
  onNavigate: (page: 'gallery' | 'edit' | 'print') => void;
  onStart: () => void;
}) {
  return (
    <header className="start-header">
      <div className="start-header-inner">
        <div className="start-logo">
          <RingsLogo />
          <span>Rings</span>
        </div>

        {/* 홈에서는 목적지 페이지가 열려 있지 않으므로 선택 표시를 하지 않는다. */}
        <nav className="start-nav" aria-label="주 메뉴">
          <button onClick={() => onNavigate('gallery')}>
            Template
          </button>
          <button onClick={() => onNavigate('edit')}>
            Inserts
          </button>
          <button className="off" disabled title="전용 페이지 준비 중">Notebooks</button>
          <button onClick={() => onNavigate('print')}>
            Print
          </button>
        </nav>

        <div className="start-header-right">
          <button className="start-plain">로그인</button>
          <button className="start-header-cta" onClick={onStart}>
            Rings 무료로 사용하기
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
        도트 위에 자유롭게 표현하고, 규격에 맞춰 간편하게 인쇄하세요.
      </p>

      <div className="start-cta-row">
        <button className="start-cta" onClick={onStart}>
          Rings 무료로 사용하기
        </button>
      </div>

      <div className="start-meta">
        <span>M6 · A5 · A6 · 퍼스널</span>
        <span className="start-meta-sep" />
        <span>가입 없이 바로 시작</span>
      </div>
    </section>
  );
}

/**
 * 제목의 낱말을 돌린다.
 *
 * 사라지는 동안(`fading`)에는 낱말을 바꾸지 않는다 — 흐려지는 도중에
 * 글자가 바뀌면 두 낱말이 겹쳐 보인다. 다 사라진 뒤에 갈아 끼운다.
 */
function useRotatingWord(): { text: string; fading: boolean } {
  const [index, setIndex] = useState(0);
  const [fading, setFading] = useState(false);

  useEffect(() => {
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
function ProductMock({ screen, onPick }: { screen: MockScreen; onPick: (s: MockScreen) => void }) {
  // 디자인의 알약 차례는 Template · Inserts · Print다. 저절로 넘어가는
  // 차례(MOCK_ORDER)와 다르므로 여기만 따로 적는다.
  const pills: MockScreen[] = ['template', 'insert', 'print'];

  return (
    <div className="start-mock">
      <div className="start-mock-bar">
        <div className="start-mock-pills">
          {pills.map((s) => (
            <button
              key={s}
              className={screen === s ? 'on' : ''}
              onClick={() => onPick(s)}
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
      <MockPanel title="요소" items={['글자', '표', '체크박스', '이미지', '달력']} activeIndex={0} />

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
        <div className="start-mock-side-title">선택한 요소 · 표</div>
        <div className="start-mock-fields">
          <MockField label="X" value="8.0mm" />
          <MockField label="Y" value="103.0mm" />
          <MockField label="너비" value="30.0mm" />
          <MockField label="높이" value="10.0mm" />
        </div>
        <div className="start-mock-foot">격자에 맞춰 붙습니다 · 2.5mm</div>
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
      <MockPanel title="보기" items={['전체', '이미지', '폰트']} activeIndex={0} />

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
        <div className="start-mock-side-title">규격</div>
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
      <MockPanel title="설정" items={['Paper', 'View', 'Insert']} activeIndex={0} />

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
  { title: '새 다이어리 시작하기', tone: 'accent' },
  { title: '규격에 맞는 도트 잡기', tone: 'soft' },
  { title: '인쇄소로 바로 넘기기', tone: 'ink' },
  { title: '완성한 속지 공유하기', tone: 'muted' },
  { title: '여러 장 한번에 배치하기', tone: 'accent' },
];

/**
 * 무엇을 할 수 있는지 크게 보여주는 자리.
 *
 * 위 미리보기가 "앱이 어떻게 생겼나"라면, 여기는 "그래서 무엇을 하나"다.
 * 큰 카드 셋(속지 제작 · 템플릿 · 인쇄)으로 보여준 뒤, 마지막에 작은
 * 고리 다섯 개로 갈래를 늘어놓는다.
 */
function Showcase({ onStart }: { onStart: () => void }) {
  return (
    <section className="start-showcase">
      <h2>도트 위에서 다이어리 한 권이 완성되는 곳</h2>

      <div className="start-show-grid">
        <ShowCard
          kicker="속지 제작"
          title="요소를 자유롭게 배치해 나만의 속지를 만드세요."
          onStart={onStart}
        >
          <ShowSheet />
        </ShowCard>

        <ShowCard
          kicker="템플릿"
          title="규격에 맞는 템플릿을 고르고 바로 시작하세요."
          onStart={onStart}
          frameClass="tall"
        >
          <div className="start-show-templates">
            <div className="on">
              <div className="start-show-thumb" />
              <div className="start-show-name">M6-1</div>
            </div>
            <div>
              <div className="start-show-thumb" />
              <div className="start-show-name">M6-2</div>
            </div>
            <div>
              <div className="start-show-thumb" />
              <div className="start-show-name">A5-1</div>
            </div>
            <div className="add">
              <span className="plus">+</span>
              <span>새 템플릿</span>
            </div>
          </div>
        </ShowCard>
      </div>

      {/* 인쇄만 옆으로 넓은 카드다 — 용지와 칸 배정을 나란히 보여줘야 해서다. */}
      <div className="start-show-wide">
        <div className="start-show-wide-head">
          <div>
            <div className="start-show-kicker">인쇄</div>
            <div className="start-show-title">
              종이 규격에 맞춰 크롭 마크까지 자동으로 준비하세요.
            </div>
          </div>
          <ArrowButton onClick={onStart} />
        </div>
        <div className="start-show-wide-body">
          <div className="start-show-frame">
            <ShowPaper />
          </div>
          <div className="start-show-slots">
            <div className="start-mock-side-title">Slot assignment</div>
            <div className="start-mock-slots">
              <span className="a" />
              <span className="b" />
              <span className="a" />
              <span className="b" />
            </div>
            <div className="start-mock-foot">4 per sheet · 2 × 2</div>
          </div>
        </div>
      </div>

      <p className="start-features-title">Rings로 할 수 있는 일 보기</p>
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

function ShowCard({
  kicker,
  title,
  onStart,
  frameClass,
  children,
}: {
  kicker: string;
  title: string;
  onStart: () => void;
  /** 액자를 다르게 잡아야 할 때. 템플릿 카드는 더 넉넉하다(디자인). */
  frameClass?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="start-show-card">
      <div className="start-show-head">
        <div>
          <div className="start-show-kicker">{kicker}</div>
          <div className="start-show-title">{title}</div>
        </div>
        <ArrowButton onClick={onStart} />
      </div>
      <div className={`start-show-frame ${frameClass ?? ''}`}>{children}</div>
    </div>
  );
}

function ArrowButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="start-show-arrow" onClick={onClick} aria-label="Rings 시작하기">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12h14" />
        <path d="M13 6l6 6-6 6" />
      </svg>
    </button>
  );
}

/* 속지 한 장 — 미리보기의 것과 같은 그림이되 고른 표시만 남긴다. */
function ShowSheet() {
  return (
    <svg viewBox="0 0 80 125" preserveAspectRatio="xMidYMid meet" className="start-show-sheet">
      <defs>
        <pattern id="showDots" width="2.5" height="2.5" patternUnits="userSpaceOnUse">
          <circle cx="1.25" cy="1.25" r="0.16" fill="#c2c2bc" />
        </pattern>
      </defs>
      <rect x="0" y="0" width="80" height="125" fill="#fff" />
      <rect x="6" y="6" width="68" height="113" fill="url(#showDots)" />
      <rect x="8" y="11" width="24" height="3" rx="0.5" fill="#1c1c1a" />
      <rect x="8" y="18" width="64" height="0.3" fill="#1c1c1a" />
      <g stroke="#8e8e88" strokeWidth="0.22" fill="none">
        <path d="M8 24 H72 M8 38 H72 M8 52 H72 M8 66 H72" />
        <path d="M8 24 V66 M24 24 V66 M40 24 V66 M56 24 V66 M72 24 V66" />
      </g>
      <rect x="7.4" y="103" width="30" height="10" fill="none" stroke="#2f6f4f" strokeWidth="0.3" />
      <g fill="#2f6f4f">
        <rect x="6.6" y="102.2" width="1.6" height="1.6" />
        <rect x="36.6" y="102.2" width="1.6" height="1.6" />
        <rect x="6.6" y="112.2" width="1.6" height="1.6" />
        <rect x="36.6" y="112.2" width="1.6" height="1.6" />
      </g>
    </svg>
  );
}

function ShowPaper() {
  return (
    <svg viewBox="0 0 210 297" preserveAspectRatio="xMidYMid meet" className="start-show-sheet">
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
