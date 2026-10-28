import { ApiError, passwordStrength } from '@vca/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { PasskeyCancelled, hasBuiltInUnlock, passkeysSupported, unlockName } from '../auth/passkey';
import { Aperture } from './Aperture';
import { CheckIcon, FaceIdIcon } from './Icons';
import { Line } from './Line';
import { ModeToggle } from './ModeToggle';

type Tab = 'login' | 'register';
type Face = 'idle' | 'asking' | 'waiting' | 'done';
type Fields = Partial<Record<'name' | 'email' | 'password', string>>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, reducedMotion() ? 0 : ms));

function pathTab(): Tab {
  return location.pathname === '/register' ? 'register' : 'login';
}

/** The big "use your face" button, with a scan animation while the device checks. */
function FaceButton({ state, label, hint, disabled, onClick }: { state: Face; label: string; hint: string; disabled?: boolean; onClick: () => void }) {
  const busy = state === 'asking' || state === 'waiting';
  return (
    <button
      type="button"
      className={`face-btn face-btn--${state}`}
      onClick={onClick}
      disabled={disabled || busy || state === 'done'}
      aria-busy={busy}
      data-testid="face-btn"
    >
      <span className="face-btn__icon" aria-hidden="true">
        {state === 'done' ? <CheckIcon width={26} height={26} /> : <FaceIdIcon width={28} height={28} />}
        <i className="face-btn__scan" />
      </span>
      <span className="face-btn__text">
        <strong>{state === 'waiting' ? `Look at your camera…` : state === 'asking' ? 'Getting ready…' : state === 'done' ? 'Verified' : label}</strong>
        <span>{state === 'waiting' ? `Finish the ${unlockName()} prompt on your device.` : hint}</span>
      </span>
    </button>
  );
}

export function AuthPage() {
  const { login, register, loginWithFace, registerWithFace, notice } = useAuth();
  const [tab, setTabState] = useState<Tab>(pathTab);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Fields>({});
  const [message, setMessage] = useState<string | null>(notice);
  const [face, setFace] = useState<Face>('idle');
  const [busy, setBusy] = useState(false);
  const [usePassword, setUsePassword] = useState(!passkeysSupported());
  const [builtIn, setBuiltIn] = useState(true);
  const canFace = passkeysSupported();
  const strength = passwordStrength(password);

  useEffect(() => {
    void hasBuiltInUnlock().then(setBuiltIn);
  }, []);
  useEffect(() => setMessage(notice), [notice]);

  const setTab = (t: Tab) => {
    setTabState(t);
    setErrors({});
    setMessage(null);
    setFace('idle');
    const path = t === 'register' ? '/register' : '/login';
    if (!location.pathname.startsWith('/r/') && location.pathname !== path) history.replaceState(null, '', path);
  };

  const hint = builtIn ? `Uses ${unlockName()} on this device. Your face never leaves it.` : 'Use your phone or a security key to confirm it’s you.';
  const celebrate = async () => {
    setFace('done');
    await wait(650);
  };
  const fail = (err: unknown) => {
    setFace('idle');
    if (err instanceof PasskeyCancelled) setMessage('Face sign-in was cancelled. Try again, or use your email and password.');
    else if (err instanceof ApiError) {
      setErrors(err.fields as Fields);
      setMessage(err.message);
    } else setMessage((err as Error)?.message ?? 'Something went wrong. Please try again.');
  };

  const faceLogin = async () => {
    setMessage(null);
    setFace('asking');
    try {
      await loginWithFace(celebrate, () => setFace('waiting'));
    } catch (err) {
      fail(err);
    }
  };

  const checkNameEmail = (): Fields => {
    const e: Fields = {};
    if (name.trim().length < 2) e.name = 'Add your name, at least 2 characters.';
    if (!EMAIL.test(email.trim())) e.email = 'Enter an email like name@example.com.';
    return e;
  };

  const faceRegister = async () => {
    setMessage(null);
    const e = checkNameEmail();
    setErrors(e);
    if (Object.keys(e).length) return;
    setFace('asking');
    try {
      await registerWithFace(name.trim(), email.trim(), celebrate, () => setFace('waiting'));
    } catch (err) {
      fail(err);
    }
  };

  const submitPassword = async (ev: FormEvent) => {
    ev.preventDefault();
    setMessage(null);
    const e: Fields = tab === 'register' ? checkNameEmail() : {};
    if (tab === 'login' && !EMAIL.test(email.trim())) e.email = 'Enter an email like name@example.com.';
    if (tab === 'login' && !password) e.password = 'Enter your password.';
    if (tab === 'register') {
      if (password.length < 8) e.password = 'Use at least 8 characters.';
      else if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) e.password = 'Mix in at least one letter and one number.';
    }
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      if (tab === 'login') await login(email.trim(), password);
      else await register(name.trim(), email.trim(), password);
    } catch (err) {
      setBusy(false);
      fail(err);
      if (err instanceof ApiError && err.status === 401) setPassword('');
    }
  };

  const lensOpen = face === 'waiting' ? 0.18 : face === 'asking' ? 0.4 : face === 'done' ? 1 : 0.62;

  return (
    <div className="auth">
      <aside className="auth__brand" aria-hidden="true">
        <div className="auth__logo">
          <Aperture open={0.42} className="mark" />
          Huddle
        </div>
        <div className="auth__scene">
          <div className="scene-window">
            <div className="scene-window__bar">
              <i />
              <i />
              <i />
              <span>Design review · 12:04</span>
            </div>
            <div className="scene-window__grid">
              {['MK', 'AR', 'PS', 'DV'].map((ini, i) => (
                <div key={ini} className={`scene-tile scene-tile--${i}`}>
                  <span>{ini}</span>
                </div>
              ))}
            </div>
          </div>
          <div className={`scene-lens scene-lens--${face}`}>
            <Aperture open={lensOpen} className="scene-lens__iris">
              <div className="scene-lens__face">
                <FaceIdIcon width={64} height={64} />
              </div>
            </Aperture>
            <i className="scene-lens__sweep" />
          </div>
        </div>
        <div className="auth__pitch">
          <h2>Meet face to face.</h2>
          <p>And sign in the same way. Huddle uses your device’s face unlock, so there’s no password to type or forget.</p>
        </div>
      </aside>

      <main className="auth__panel">
        <ModeToggle className="auth__mode" />
        <div className="auth__card">
          <div className="seg" role="tablist" aria-label="Account">
            <button role="tab" aria-selected={tab === 'login'} className={tab === 'login' ? 'is-on' : ''} onClick={() => setTab('login')} data-testid="tab-login">
              Sign in
            </button>
            <button role="tab" aria-selected={tab === 'register'} className={tab === 'register' ? 'is-on' : ''} onClick={() => setTab('register')} data-testid="tab-register">
              Create account
            </button>
            <i className="seg__thumb" style={{ transform: `translateX(${tab === 'login' ? 0 : 100}%)` }} />
          </div>

          <h1 className="auth__title">{tab === 'login' ? 'Welcome back' : 'Create your account'}</h1>
          <p className="auth__lede">
            {tab === 'login' ? 'Sign in with your face. No email or password needed.' : 'Your face unlocks your account. You can add a password later as a backup.'}
          </p>

          {message && (
            <p className="auth__msg" role="alert" data-testid="auth-message">
              {message}
            </p>
          )}

          {tab === 'login' ? (
            <>
              {canFace && <FaceButton state={face} label="Sign in with your face" hint={hint} onClick={() => void faceLogin()} />}
              <div className="or">
                <span>{canFace ? 'or use your email' : 'Sign in with your email'}</span>
              </div>
              <form className="auth__form" onSubmit={submitPassword} noValidate>
                <Line name="email" label="Email" type="email" autoComplete="username webauthn" value={email} onChange={setEmail} error={errors.email} />
                <Line name="password" label="Password" type="password" autoComplete="current-password" value={password} onChange={setPassword} error={errors.password} />
                <button className="btn btn--secondary btn--wide" type="submit" disabled={busy || face !== 'idle'} data-testid="password-submit">
                  {busy ? 'Signing in…' : 'Sign in with password'}
                </button>
              </form>
            </>
          ) : (
            <form className="auth__form" onSubmit={submitPassword} noValidate>
              <Line name="name" label="Your name" type="text" autoComplete="name" value={name} onChange={setName} error={errors.name} />
              <Line name="email" label="Email" type="email" autoComplete="email" value={email} onChange={setEmail} error={errors.email} />
              {!usePassword ? (
                <>
                  <FaceButton state={face} label="Create with face sign-in" hint={hint} onClick={() => void faceRegister()} />
                  <button type="button" className="link-btn auth__alt" onClick={() => setUsePassword(true)} data-testid="use-password">
                    Use a password instead
                  </button>
                </>
              ) : (
                <>
                  <Line
                    name="password"
                    label="Password"
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={setPassword}
                    error={errors.password}
                  />
                  {password && (
                    <div className={`meter meter--${strength.score}`} aria-live="polite">
                      <div className="meter__track">
                        <span style={{ width: `${strength.score * 25}%` }} />
                      </div>
                      <span className="meter__label">{strength.label}</span>
                    </div>
                  )}
                  <button className="btn btn--primary btn--wide" type="submit" disabled={busy} data-testid="password-submit">
                    {busy ? 'Creating…' : 'Create account'}
                  </button>
                  {canFace && (
                    <button type="button" className="link-btn auth__alt" onClick={() => setUsePassword(false)}>
                      Use face sign-in instead
                    </button>
                  )}
                </>
              )}
            </form>
          )}
          {!canFace && <p className="auth__fine">This browser can’t do face sign-in, so we’re using a password.</p>}
        </div>
        <p className="auth__foot">Private group video calls · up to 6 people</p>
      </main>
    </div>
  );
}
