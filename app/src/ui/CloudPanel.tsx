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
import { useStore } from '../store';
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
import { t } from '../lang';

/** 지금 동기화가 어디까지 갔는지. ui/cloudSync가 정하고(store의 cloudStatus) 여기서 보여주기만 한다. */
export type SyncState =
  | { kind: 'local' }
  | { kind: 'syncing' }
  | { kind: 'saved'; at: Date }
  | { kind: 'error'; text: string };

function statusText(sync: SyncState): string {
  switch (sync.kind) {
    case 'local':
      return t('이 기기에 저장', 'Saved on this device');
    case 'syncing':
      return t('계정과 맞추는 중…', 'Syncing…');
    case 'saved':
      return t(
        `${sync.at.getHours()}시 ${String(sync.at.getMinutes()).padStart(2, '0')}분에 저장됨`,
        `Saved at ${sync.at.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`,
      );
    case 'error':
      return sync.text;
  }
}

export function CloudPanel() {
  const status = useStore((s) => s.cloudStatus);
  const sync: SyncState = status.kind === 'saved' ? { kind: 'saved', at: new Date(status.at) } : status;
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
        title={user ? t(`${user.email} 계정`, `Signed in as ${user.email}`) : t('계정 로그인', 'Sign in')}
      >
        <span className={`cloud-dot ${user ? sync.kind : 'out'}`} aria-hidden="true" />
        {checking ? t('계정 확인 중…', 'Checking account…') : user ? t('계정', 'Account') : t('로그인', 'Sign in')}
      </button>

      {user && sync.kind !== 'local' && (
        <span className={`cloud-status ${sync.kind === 'error' ? 'bad' : ''}`}>
          {statusText(sync)}
        </span>
      )}

      {open && (
        <div className="popover popover-below cloud-pop" role="dialog" aria-label={t('계정', 'Account')}>
          <h2>{t('계정', 'Account')}</h2>
          <div className="popover-body">
            {sessionError && <p className="cloud-error" role="alert">{t("계정을 확인하지 못했어요. 로컬 작업은 계속할 수 있어요.", "Couldn't check your account. You can keep working on this device.")} {sessionError}</p>}
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
          ? t('작업은 지금 이 기기에 저장됩니다.', 'Your works are saved on this device.')
          : t('작업이 계정에도 저장됩니다. 다른 기기에서 같은 계정으로 로그인하면 이어서 할 수 있습니다.', 'Your works are also saved to your account. Sign in on another device to pick up where you left off.')}
      </p>
      {sync.kind !== 'local' && (
        <p className="note">{t('글꼴·이미지 파일도 함께 올라가요. 다른 기기에서는 처음 맞출 때 받아 와요.', 'Font and image files are uploaded too. Other devices download them on their first sync.')}</p>
      )}
      {sync.kind === 'error' && <p className="cloud-error">{sync.text}</p>}
      <AccountForm onDeleted={onSignOut} />
      <button className="ghost" onClick={onSignOut}>
        {t('로그아웃', 'Sign out')}
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
        setMsg({ ok: true, text: t('비밀번호를 바꿨습니다.', 'Password changed.') });
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
          {t('비밀번호 변경', 'Change password')}
        </button>
        <button className="ghost danger" onClick={() => open('delete')}>
          {t('탈퇴', 'Delete account')}
        </button>
        {msg && <p className={msg.ok ? 'note' : 'cloud-error'}>{msg.text}</p>}
      </div>
    );
  }

  return (
    <form className="cloud-form" onSubmit={(e) => void submit(e)}>
      <label className="cloud-field">
        <span>{t('현재 비밀번호', 'Current password')}</span>
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
          <span>{t('새 비밀번호', 'New password')}</span>
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
      {mode === 'delete' && <p className="cloud-error">{t('계정과 서버에 저장된 자료가 모두 지워집니다. 이 기기에 저장된 작업은 남습니다.', 'Your account and everything saved on the server will be deleted. Works saved on this device stay.')}</p>}
      {msg && <p className="cloud-error" role="alert">{msg.text}</p>}
      <div className="cloud-actions">
        <button type="submit" disabled={busy} className={mode === 'delete' ? 'danger' : undefined}>
          {busy ? t('잠시만요…', 'One moment…') : mode === 'password' ? t('바꾸기', 'Change') : t('탈퇴하기', 'Delete account')}
        </button>
        <button type="button" className="ghost" disabled={busy} onClick={() => open('closed')}>
          {t('취소', 'Cancel')}
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
        {t('계정을 만들거나 로그인할 수 있어요. 작업은 지금 이 기기에 저장됩니다.', 'Create an account or sign in. Your works are saved on this device for now.')}
      </p>

      <label className="cloud-field">
        <span>{t('이메일', 'Email')}</span>
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
        <span>{t('비밀번호', 'Password')}</span>
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
          {busy ? t('잠시만요…', 'One moment…') : mode === 'up' ? t('가입하고 시작', 'Sign up') : t('로그인', 'Sign in')}
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
          {mode === 'in' ? t('처음이신가요? 가입', 'New here? Sign up') : t('이미 계정이 있어요', 'I already have an account')}
        </button>
      </div>
    </form>
  );
}
