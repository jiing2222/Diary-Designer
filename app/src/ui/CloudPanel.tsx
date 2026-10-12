/**
 * 클라우드 — 로그인과 동기화 상태.
 *
 * **서버를 정하지 않은 빌드에서는 아무것도 그리지 않는다**(cloud/client의
 * `cloudEnabled`). 서버 없이 쓰는 사람에게 쓸 수 없는 버튼을 보여줄 이유가
 * 없다.
 *
 * 여기서 하는 일은 로그인·로그아웃과 **지금 상태를 정직하게 보여주는 것**뿐이다.
 * 작업별 동기화는 8-2에서 연결한다. 그 전에는 로컬 저장 상태를 분명히
 * 알리고, 로그인만 했다고 작업이 서버에 올라갔다고 표시하지 않는다.
 */

import { useEffect, useRef, useState } from 'react';
import {
  changePassword,
  cloudEnabled,
  cloudErrorText,
  deleteAccount,
  currentUser,
  onAuthChange,
  signIn,
  signOut,
  signUp,
  refreshSession,
  type CloudUser,
} from '../cloud/client';

/** 지금 동기화가 어디까지 갔는지. App.tsx가 정하고 여기서 보여주기만 한다. */
export type SyncState =
  | { kind: 'local' }
  | { kind: 'idle' }
  | { kind: 'syncing' }
  | { kind: 'saved'; at: Date }
  | { kind: 'error'; text: string };

function statusText(sync: SyncState): string {
  switch (sync.kind) {
    case 'local':
      return '이 기기에 저장';
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

export function CloudPanel({ sync = { kind: 'local' } }: { sync?: SyncState }) {
  const [user, setUser] = useState<CloudUser | null>(() => currentUser());
  const [checking, setChecking] = useState(() => currentUser() !== null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    const stop = onAuthChange((next) => {
      setUser(next);
      setSessionError(null);
    });
    void refreshSession().catch((err) => {
      if (alive) setSessionError(cloudErrorText(err));
    }).finally(() => {
      if (alive) setChecking(false);
    });
    return () => { alive = false; stop(); };
  }, []);

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
        aria-expanded={open}
        aria-haspopup="dialog"
        title={user ? `${user.email} 계정` : '계정 로그인'}
      >
        <span className={`cloud-dot ${user ? sync.kind : 'out'}`} aria-hidden="true" />
        {checking ? '계정 확인 중…' : user ? '계정' : '로그인'}
      </button>

      {user && sync.kind !== 'idle' && sync.kind !== 'local' && (
        <span className={`cloud-status ${sync.kind === 'error' ? 'bad' : ''}`}>
          {statusText(sync)}
        </span>
      )}

      {open && (
        <div className="popover popover-below cloud-pop" role="dialog" aria-label="계정">
          <h2>계정</h2>
          <div className="popover-body">
            {sessionError && <p className="cloud-error" role="alert">계정을 확인하지 못했어요. 로컬 작업은 계속할 수 있어요. {sessionError}</p>}
            {user ? (
              <SignedIn
                user={user}
                sync={sync}
                onSignOut={() => {
                  signOut();
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
        {sync.kind === 'local'
          ? '작업은 지금 이 기기에 저장됩니다. 다른 기기에서 이어 쓰는 기능은 준비 중이에요.'
          : '작업이 서버에도 저장됩니다. 다른 기기에서 같은 계정으로 로그인하면 이어서 할 수 있습니다.'}
      </p>
      {/*
        올라가지 않는 것을 미리 말해둔다. 다른 컴퓨터에서 열었을 때 글꼴이
        기본 글꼴로 보이면 고장 난 것으로 오해하기 딱 좋다 — 그때 가서
        알리면 늦는다.
      */}
      {sync.kind !== 'local' && <p className="note">
        글꼴·이미지 <b>파일</b>은 올라가지 않습니다. 다른 기기에서는 같은 이름으로 다시 등록해야
        합니다.
      </p>}
      {sync.kind === 'error' && <p className="cloud-error">{sync.text}</p>}
      <AccountForm onDeleted={onSignOut} />
      <button className="ghost" onClick={onSignOut}>
        로그아웃
      </button>
    </div>
  );
}

/** 계정 관리 — 비밀번호 바꾸기와 탈퇴. 평소엔 접혀 있다. */
function AccountForm({ onDeleted }: { onDeleted: () => void }) {
  const [mode, setMode] = useState<'closed' | 'password' | 'delete'>('closed');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function open(m: typeof mode) {
    setMode(m);
    setCurrent('');
    setNext('');
    setMsg(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      if (mode === 'password') {
        await changePassword(current, next);
        setMsg({ ok: true, text: '비밀번호를 바꿨습니다.' });
        setMode('closed');
      } else {
        await deleteAccount(current);
        onDeleted();
      }
    } catch (err) {
      setMsg({ ok: false, text: cloudErrorText(err, 'account') });
    } finally {
      setBusy(false);
    }
  }

  if (mode === 'closed') {
    return (
      <div className="cloud-actions">
        <button className="ghost" onClick={() => open('password')}>
          비밀번호 변경
        </button>
        <button className="ghost danger" onClick={() => open('delete')}>
          탈퇴
        </button>
        {msg && <p className={msg.ok ? 'note' : 'cloud-error'}>{msg.text}</p>}
      </div>
    );
  }

  return (
    <form className="cloud-form" onSubmit={(e) => void submit(e)}>
      <label className="cloud-field">
        <span>현재 비밀번호</span>
        <input
          type="password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          autoComplete="current-password"
          disabled={busy}
          required
        />
      </label>
      {mode === 'password' && (
        <label className="cloud-field">
          <span>새 비밀번호</span>
          <input
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            disabled={busy}
            required
          />
        </label>
      )}
      {mode === 'delete' && <p className="cloud-error">계정과 서버에 저장된 자료가 모두 지워집니다. 이 기기에 저장된 작업은 남습니다.</p>}
      {msg && <p className="cloud-error" role="alert">{msg.text}</p>}
      <div className="cloud-actions">
        <button type="submit" disabled={busy} className={mode === 'delete' ? 'danger' : undefined}>
          {busy ? '잠시만요…' : mode === 'password' ? '바꾸기' : '탈퇴하기'}
        </button>
        <button type="button" className="ghost" disabled={busy} onClick={() => open('closed')}>
          취소
        </button>
      </div>
    </form>
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
      setError(cloudErrorText(err, mode === 'up' ? 'signUp' : 'signIn'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="cloud-form" onSubmit={(e) => void submit(e)}>
      <p className="note">
        계정을 만들거나 로그인할 수 있어요. 작업은 지금 이 기기에 저장됩니다.
      </p>

      <label className="cloud-field">
        <span>이메일</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          disabled={busy}
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
          minLength={mode === 'up' ? 8 : undefined}
          disabled={busy}
          required
        />
      </label>

      {error && <p className="cloud-error" role="alert">{error}</p>}

      <div className="cloud-actions">
        <button type="submit" disabled={busy}>
          {busy ? '잠시만요…' : mode === 'up' ? '가입하고 시작' : '로그인'}
        </button>
        <button
          type="button"
          className="ghost"
          disabled={busy}
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
