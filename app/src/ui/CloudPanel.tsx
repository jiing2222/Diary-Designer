/**
 * 클라우드 — 로그인과 동기화 상태.
 *
 * **서버를 정하지 않은 빌드에서는 아무것도 그리지 않는다**(cloud/client의
 * `cloudEnabled`). 서버 없이 쓰는 사람에게 쓸 수 없는 버튼을 보여줄 이유가
 * 없다.
 *
 * 여기서 하는 일은 로그인·로그아웃과 **지금 상태를 정직하게 보여주는 것**뿐이다.
 * 실제로 올리고 내리는 것은 App.tsx의 effect가 한다 — 화면이 열려 있든
 * 닫혀 있든 동기화는 계속돼야 하므로, 그 일을 이 컴포넌트가 들고 있으면
 * 안 된다.
 */

import { useEffect, useRef, useState } from 'react';
import {
  cloudEnabled,
  cloudErrorText,
  currentUser,
  onAuthChange,
  signIn,
  signOut,
  signUp,
  type CloudUser,
} from '../cloud/client';
import { forgetRecord } from '../cloud/projects';

/** 지금 동기화가 어디까지 갔는지. App.tsx가 정하고 여기서 보여주기만 한다. */
export type SyncState =
  | { kind: 'idle' }
  | { kind: 'syncing' }
  | { kind: 'saved'; at: Date }
  | { kind: 'error'; text: string };

function statusText(sync: SyncState): string {
  switch (sync.kind) {
    case 'syncing':
      return '올리는 중…';
    case 'saved':
      return `${sync.at.getHours()}시 ${String(sync.at.getMinutes()).padStart(2, '0')}분에 저장됨`;
    case 'error':
      return sync.text;
    case 'idle':
      return '';
  }
}

export function CloudPanel({ sync }: { sync: SyncState }) {
  const [user, setUser] = useState<CloudUser | null>(() => currentUser());
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => onAuthChange(setUser), []);

  // 바깥을 누르거나 Esc — 설정 말풍선과 같은 방식이다(SettingsPanel).
  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
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

  if (!cloudEnabled) return null;

  return (
    <div className="cloud" ref={wrapRef}>
      <button
        className="ghost cloud-trigger"
        onClick={() => setOpen((v) => !v)}
        title={user ? `${user.email}으로 로그인함` : '로그인하면 다른 기기에서도 이어서 작업합니다'}
      >
        <span className={`cloud-dot ${user ? sync.kind : 'out'}`} aria-hidden="true" />
        {user ? '클라우드' : '로그인'}
      </button>

      {user && sync.kind !== 'idle' && (
        <span className={`cloud-status ${sync.kind === 'error' ? 'bad' : ''}`}>
          {statusText(sync)}
        </span>
      )}

      {open && (
        <div className="popover popover-below cloud-pop">
          <h2>클라우드</h2>
          <div className="popover-body">
            {user ? (
              <SignedIn
                user={user}
                sync={sync}
                onSignOut={() => {
                  signOut();
                  forgetRecord();
                  setOpen(false);
                }}
              />
            ) : (
              <SignInForm onDone={() => setOpen(false)} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SignedIn({
  user,
  sync,
  onSignOut,
}: {
  user: CloudUser;
  sync: SyncState;
  onSignOut: () => void;
}) {
  return (
    <div className="cloud-signed">
      <p className="cloud-email">{user.email}</p>
      <p className="note">
        작업이 자동으로 서버에 올라갑니다. 다른 기기에서 같은 계정으로 로그인하면 이어서 할 수
        있습니다.
      </p>
      {/*
        올라가지 않는 것을 미리 말해둔다. 다른 컴퓨터에서 열었을 때 글꼴이
        기본 글꼴로 보이면 고장 난 것으로 오해하기 딱 좋다 — 그때 가서
        알리면 늦는다.
      */}
      <p className="note">
        글꼴·이미지 <b>파일</b>은 올라가지 않습니다. 다른 기기에서는 같은 이름으로 다시 등록해야
        합니다.
      </p>
      {sync.kind === 'error' && <p className="cloud-error">{sync.text}</p>}
      <button className="ghost" onClick={onSignOut}>
        로그아웃
      </button>
    </div>
  );
}

function SignInForm({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'up') await signUp(email, password);
      else await signIn(email, password);
      onDone();
    } catch (err) {
      setError(cloudErrorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="cloud-form" onSubmit={(e) => void submit(e)}>
      <p className="note">
        로그인하면 작업이 서버에도 저장돼서, 브라우저를 지우거나 다른 기기에서 열어도 이어서 할 수
        있습니다.
      </p>

      <label className="cloud-field">
        <span>이메일</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />
      </label>

      <label className="cloud-field">
        <span>비밀번호</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={mode === 'up' ? 'new-password' : 'current-password'}
          /* PocketBase 기본값이 8자다. 눌러보고 나서 알게 하지 않는다. */
          minLength={8}
          required
        />
      </label>

      {error && <p className="cloud-error">{error}</p>}

      <div className="cloud-actions">
        <button type="submit" disabled={busy}>
          {busy ? '잠시만요…' : mode === 'up' ? '가입하고 시작' : '로그인'}
        </button>
        <button
          type="button"
          className="ghost"
          onClick={() => {
            setMode((m) => (m === 'in' ? 'up' : 'in'));
            setError(null);
          }}
        >
          {mode === 'in' ? '처음이신가요? 가입' : '이미 계정이 있어요'}
        </button>
      </div>
    </form>
  );
}
