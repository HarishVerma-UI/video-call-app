import { ApiError, passwordStrength } from '@vca/shared';
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { useAuth } from '../auth/AuthContext';

type Mode = 'login' | 'register';
type Field = 'name' | 'email' | 'password';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function validate(mode: Mode, v: Record<Field, string>): Partial<Record<Field, string>> {
  const e: Partial<Record<Field, string>> = {};
  if (mode === 'register' && v.name.trim().length < 2) e.name = 'Tell us your name (2+ characters).';
  if (!EMAIL.test(v.email.trim())) e.email = 'Enter a valid email address.';
  if (mode === 'register') {
    if (v.password.length < 8) e.password = 'Use at least 8 characters.';
    else if (!/[a-zA-Z]/.test(v.password) || !/\d/.test(v.password)) e.password = 'Include a letter and a number.';
  } else if (!v.password) e.password = 'Enter your password.';
  return e;
}

/* ---------- decorative stage ---------- */

const ORBIT = [
  { initials: 'PS', hue: 'violet', ring: 'outer', angle: 0 },
  { initials: 'AK', hue: 'cyan', ring: 'outer', angle: 72 },
  { initials: 'MR', hue: 'amber', ring: 'outer', angle: 144 },
  { initials: 'RJ', hue: 'pink', ring: 'outer', angle: 216 },
  { initials: 'SN', hue: 'green', ring: 'outer', angle: 288 },
  { initials: 'DV', hue: 'blue', ring: 'inner', angle: 40 },
  { initials: 'TK', hue: 'pink', ring: 'inner', angle: 160 },
  { initials: 'LO', hue: 'cyan', ring: 'inner', angle: 280 },
];

function Stage() {
  return (
    <section className="auth__stage" aria-hidden="true">
      <div className="aurora">
        <span className="aurora__blob aurora__blob--1" />
        <span className="aurora__blob aurora__blob--2" />
        <span className="aurora__blob aurora__blob--3" />
      </div>
      <div className="stars" />

      <div className="constellation">
        {(['outer', 'inner'] as const).map((ring) => (
          <div key={ring} className={`ring ring--${ring}`}>
            <svg className="ring__lines" viewBox="-100 -100 200 200">
              {ORBIT.filter((o) => o.ring === ring).map((o) => {
                const r = ring === 'outer' ? 92 : 100; // node distance as % of the ring's half-width
                const rad = (o.angle * Math.PI) / 180;
                return (
                  <line
                    key={o.initials + o.angle}
                    x1="0"
                    y1="0"
                    x2={(Math.cos(rad) * r).toFixed(2)}
                    y2={(Math.sin(rad) * r).toFixed(2)}
                    className="signal"
                    style={{ animationDelay: `${(o.angle / 360) * -2.4}s` }}
                  />
                );
              })}
            </svg>
            {ORBIT.filter((o) => o.ring === ring).map((o) => (
              <div key={o.initials} className="node" style={{ ['--angle' as string]: `${o.angle}deg` }}>
                <div className={`bubble bubble--${o.hue}`}>
                  <span>{o.initials}</span>
                </div>
              </div>
            ))}
          </div>
        ))}
        <div className="core">
          <span className="core__pulse" />
          <span className="core__pulse core__pulse--late" />
          <div className="core__dot">
            <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="6" width="14" height="12" rx="3" />
              <path d="M16 10l6-3v10l-6-3z" />
            </svg>
          </div>
        </div>
      </div>

      <div className="float-card float-card--chat">
        <span className="float-card__avatar bubble--amber">MR</span>
        <div>
          <strong>Meera</strong>
          <p>Joining in 2 min 👋</p>
        </div>
      </div>
      <div className="float-card float-card--speak">
        <div className="wave">
          {Array.from({ length: 5 }, (_, i) => (
            <i key={i} style={{ animationDelay: `${i * 0.12}s` }} />
          ))}
        </div>
        <span>Arjun is speaking</span>
      </div>

      <div className="auth__pitch">
        <h2>
          Step into
          <br />
          <span className="grad">the room.</span>
        </h2>
        <p>Peer-to-peer video for up to six people, on web, Android &amp; iOS. One account, every device.</p>
      </div>
    </section>
  );
}

/* ---------- form pieces ---------- */

interface InputProps {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  error?: string;
  autoComplete: string;
  icon: ReactNode;
  trailing?: ReactNode;
  onKeyUp?: (e: KeyboardEvent<HTMLInputElement>) => void;
  autoFocus?: boolean;
  name: string;
}

function FloatingInput({ label, error, icon, trailing, onChange, ...rest }: InputProps) {
  const id = useId();
  return (
    <div className={`fi${error ? ' fi--error' : ''}`}>
      <span className="fi__icon">{icon}</span>
      <input
        id={id}
        placeholder=" "
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-err` : undefined}
        onChange={(e) => onChange(e.target.value)}
        {...rest}
      />
      <label htmlFor={id}>{label}</label>
      {trailing}
      {error && (
        <p className="fi__error" id={`${id}-err`}>
          {error}
        </p>
      )}
    </div>
  );
}

const I = {
  user: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  ),
  mail: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="M3 7l9 6 9-6" />
    </svg>
  ),
  lock: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <rect x="4" y="10" width="16" height="11" rx="3" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  ),
  eye: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  eyeOff: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3 3.9M6.3 6.3A17 17 0 0 0 2 12s3.5 7 10 7a9.6 9.6 0 0 0 5.7-1.8M9.9 9.9a3 3 0 0 0 4.2 4.2M3 3l18 18" />
    </svg>
  ),
};

/* ---------- page ---------- */

export function AuthPage() {
  const { login, register, notice } = useAuth();
  const [mode, setMode] = useState<Mode>(() => (location.pathname.startsWith('/register') ? 'register' : 'login'));
  const [values, setValues] = useState<Record<Field, string>>({ name: '', email: '', password: '' });
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const [serverErrors, setServerErrors] = useState<Partial<Record<Field, string>>>({});
  const [banner, setBanner] = useState<string | null>(notice);
  const [shake, setShake] = useState(0);
  const [busy, setBusy] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => setBanner(notice), [notice]);

  // Keep /login and /register in the URL (but don't clobber a /r/<room> invite link).
  useEffect(() => {
    if (location.pathname.startsWith('/r/')) return;
    const path = mode === 'register' ? '/register' : '/login';
    if (location.pathname !== path) history.replaceState(null, '', path + location.search);
  }, [mode]);

  const clientErrors = validate(mode, values);
  const errorFor = (f: Field) => serverErrors[f] ?? (touched[f] ? clientErrors[f] : undefined);
  const strength = passwordStrength(values.password);
  const set = (f: Field) => (v: string) => {
    setValues((s) => ({ ...s, [f]: v }));
    setServerErrors((s) => ({ ...s, [f]: undefined }));
  };

  const switchMode = (m: Mode) => {
    if (m === mode) return;
    setMode(m);
    setTouched({});
    setServerErrors({});
    setBanner(null);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched({ name: true, email: true, password: true });
    if (Object.keys(clientErrors).length) {
      setShake((n) => n + 1);
      formRef.current?.querySelector<HTMLInputElement>('[aria-invalid="true"]')?.focus();
      return;
    }
    setBusy(true);
    setBanner(null);
    try {
      if (mode === 'register') await register(values.name.trim(), values.email.trim(), values.password);
      else await login(values.email.trim(), values.password);
    } catch (err) {
      const apiErr = err instanceof ApiError ? err : null;
      setServerErrors((apiErr?.fields ?? {}) as Partial<Record<Field, string>>);
      setBanner(apiErr?.message ?? 'Something went wrong. Please try again.');
      setShake((n) => n + 1);
      setBusy(false);
    }
  };

  const capsCheck = (e: KeyboardEvent<HTMLInputElement>) => setCapsLock(e.getModifierState?.('CapsLock') ?? false);

  return (
    <div className="auth" data-mode={mode}>
      <Stage />

      <section className="auth__panel">
        <div className="auth__card">
          <div className="logo">
            <span className="logo__mark" />
            Huddle
          </div>

          <div key={mode} className="auth__heading">
            <h1>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
            <p>{mode === 'login' ? 'Sign in to start or join a call.' : 'It takes 20 seconds. No credit card, no downloads.'}</p>
          </div>

          <div className="seg" role="tablist" aria-label="Sign in or create an account">
            <span className="seg__thumb" />
            <button role="tab" type="button" aria-selected={mode === 'login'} onClick={() => switchMode('login')}>
              Sign in
            </button>
            <button role="tab" type="button" aria-selected={mode === 'register'} onClick={() => switchMode('register')}>
              Create account
            </button>
          </div>

          {banner && (
            <div key={shake} className={`auth__banner${shake ? ' shake' : ''}`} role="alert">
              {banner}
            </div>
          )}

          <form ref={formRef} className="auth__form" onSubmit={submit} noValidate>
            <div className={`collapse${mode === 'register' ? ' collapse--open' : ''}`}>
              <div>
                <FloatingInput
                  name="name"
                  label="Full name"
                  type="text"
                  autoComplete="name"
                  value={values.name}
                  onChange={set('name')}
                  onBlur={() => setTouched((t) => ({ ...t, name: true }))}
                  error={mode === 'register' ? errorFor('name') : undefined}
                  icon={I.user}
                />
              </div>
            </div>
            <FloatingInput
              name="email"
              label="Email"
              type="email"
              autoComplete="email"
              value={values.email}
              onChange={set('email')}
              onBlur={() => setTouched((t) => ({ ...t, email: true }))}
              error={errorFor('email')}
              icon={I.mail}
              autoFocus
            />
            <FloatingInput
              name="password"
              label="Password"
              type={showPw ? 'text' : 'password'}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={values.password}
              onChange={set('password')}
              onBlur={() => setTouched((t) => ({ ...t, password: true }))}
              onKeyUp={capsCheck}
              error={errorFor('password')}
              icon={I.lock}
              trailing={
                <button
                  type="button"
                  className="fi__toggle"
                  onClick={() => setShowPw((s) => !s)}
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                >
                  {showPw ? I.eyeOff : I.eye}
                </button>
              }
            />
            {capsLock && <p className="caps">⇪ Caps Lock is on</p>}

            {mode === 'register' && values.password && (
              <div className={`meter meter--${strength.score}`} aria-live="polite">
                <div className="meter__bars">
                  {[1, 2, 3, 4].map((i) => (
                    <span key={i} className={i <= strength.score ? 'on' : ''} />
                  ))}
                </div>
                <span className="meter__label">{strength.label}</span>
              </div>
            )}

            <button className="auth__submit" type="submit" disabled={busy}>
              {busy ? <span className="spinner" aria-label="Please wait" /> : mode === 'login' ? 'Sign in' : 'Create account'}
              {!busy && <span className="auth__arrow">→</span>}
            </button>
          </form>

          <p className="auth__switch">
            {mode === 'login' ? "New to Huddle? " : 'Already have an account? '}
            <button type="button" className="link-btn" onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}>
              {mode === 'login' ? 'Create an account' : 'Sign in'}
            </button>
          </p>
        </div>
      </section>
    </div>
  );
}
