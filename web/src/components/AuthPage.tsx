import { ApiError, initials, passwordStrength } from '@vca/shared';
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { useAuth } from '../auth/AuthContext';
import { Aperture } from './Aperture';

type Mode = 'login' | 'register';
type Field = 'name' | 'email' | 'password';
type Lens = 'shut' | 'open' | 'peek' | 'blink' | 'wide';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const LENS_OPEN: Record<Lens, number> = { shut: 0, open: 0.62, peek: 0.1, blink: 0, wide: 1 };
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, reducedMotion() ? 0 : ms));

function validate(mode: Mode, v: Record<Field, string>): Partial<Record<Field, string>> {
  const e: Partial<Record<Field, string>> = {};
  if (mode === 'register' && v.name.trim().length < 2) e.name = 'Add your name, at least 2 characters.';
  if (!EMAIL.test(v.email.trim())) e.email = 'Enter an email like name@example.com.';
  if (mode === 'register') {
    if (v.password.length < 8) e.password = 'Use at least 8 characters.';
    else if (!/[a-zA-Z]/.test(v.password) || !/\d/.test(v.password)) e.password = 'Mix in at least one letter and one number.';
  } else if (!v.password) e.password = 'Enter your password.';
  return e;
}

/* ---------- what you see through the lens ---------- */

const CAST = [
  { name: 'Meera', bg: ['#FFB48F', '#E8735A'], tone: '#5B2A3A' },
  { name: 'Arjun', bg: ['#8EE6C9', '#3E9C8C'], tone: '#163C3C' },
  { name: 'Priya', bg: ['#FFD27A', '#E39A3B'], tone: '#4D2E14' },
  { name: 'Dev', bg: ['#C7B6FF', '#7D63D1'], tone: '#2A1D55' },
];

function Portrait({ name, bg, tone, mine }: { name: string; bg: string[]; tone: string; mine?: boolean }) {
  return (
    <div className="portrait" style={{ background: `radial-gradient(120% 90% at 35% 25%, ${bg[0]}, ${bg[1]})` }}>
      <svg viewBox="-100 -100 200 200" className="portrait__figure" aria-hidden="true">
        <circle cx="0" cy="-12" r="34" fill={tone} />
        <path d="M -78 100 C -74 44 -40 30 0 30 C 40 30 74 44 78 100 Z" fill={tone} />
        {mine && (
          <text x="0" y="-1" textAnchor="middle" className="portrait__initials" fill={bg[0]}>
            {initials(name)}
          </text>
        )}
      </svg>
      <span className="portrait__tag">
        {!mine && (
          <span className="portrait__wave" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        )}
        {mine ? `${name.trim().split(/\s+/)[0]} (you)` : name}
      </span>
    </div>
  );
}

function LensScene({ myName }: { myName: string }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (myName || reducedMotion()) return;
    const t = setInterval(() => setI((n) => (n + 1) % CAST.length), 3400);
    return () => clearInterval(t);
  }, [myName]);

  if (myName.trim()) return <Portrait name={myName} bg={['#FFB48F', '#FF6A55']} tone="#2A1D45" mine />;
  return (
    <>
      {CAST.map((c, n) => (
        <div key={c.name} className={`scene-slide${n === i ? ' scene-slide--on' : ''}`}>
          <Portrait {...c} />
        </div>
      ))}
    </>
  );
}

/* ---------- the lens barrel's aperture scale ---------- */

const STOPS = ['1.4', '2', '2.8', '4', '5.6', '8', '11', '16'];
const STEP = 13; // degrees between stops

function FStopRing({ open }: { open: number }) {
  // fully open → f/1.4, nearly shut → f/16
  const k = Math.max(0, Math.min(STOPS.length - 1, ((1 - open) / 0.9) * (STOPS.length - 1)));
  return (
    <svg className="fring" viewBox="-120 -120 240 240" aria-hidden="true">
      {/* stops run anticlockwise up the left of the barrel, clear of the heading */}
      <g style={{ transform: 'rotate(-36deg)' }}>
      <g className="fring__scale" style={{ transform: `rotate(${k * STEP}deg)` }}>
        {STOPS.map((s, n) => (
          <g key={s} transform={`rotate(${-n * STEP})`}>
            <line x1="0" y1="-108" x2="0" y2="-103" className="fring__tick" />
            <text x="0" y="-111" textAnchor="middle" className={`fring__label${Math.round(k) === n ? ' fring__label--on' : ''}`}>
              {s}
            </text>
          </g>
        ))}
        {Array.from({ length: 60 }, (_, n) => (
          <line key={n} x1="0" y1="-104" x2="0" y2="-102" transform={`rotate(${n * 6})`} className="fring__minor" />
        ))}
      </g>
      </g>
      <g transform="rotate(-36)">
        <path d="M -4 -99 L 4 -99 L 0 -94 Z" className="fring__marker" />
      </g>
    </svg>
  );
}

/* ---------- form field ---------- */

function Line(props: {
  label: string;
  type: string;
  name: string;
  value: string;
  autoComplete: string;
  error?: string;
  onChange: (v: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  onKeyUp?: (e: KeyboardEvent<HTMLInputElement>) => void;
  trailing?: ReactNode;
  autoFocus?: boolean;
}) {
  const id = useId();
  const { label, error, onChange, trailing, ...rest } = props;
  return (
    <div className={`line${error ? ' line--error' : ''}`}>
      <label htmlFor={id}>{label}</label>
      <div className="line__row">
        <input
          id={id}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-e` : undefined}
          onChange={(e) => onChange(e.target.value)}
          {...rest}
        />
        {trailing}
      </div>
      <span className="line__rule" />
      {error && (
        <p className="line__error" id={`${id}-e`}>
          {error}
        </p>
      )}
    </div>
  );
}

/* ---------- page ---------- */

const COPY = {
  login: { title: ['Back in', 'focus.'], sub: 'Sign in to start a call or join one.', cta: 'Sign in' },
  register: { title: ['Get in', 'the picture.'], sub: 'One account for web, Android and iOS. Calls hold up to six people.', cta: 'Create account' },
};

export function AuthPage() {
  const { login, register, notice } = useAuth();
  const [mode, setMode] = useState<Mode>(() => (location.pathname.startsWith('/register') ? 'register' : 'login'));
  const [v, setV] = useState<Record<Field, string>>({ name: '', email: '', password: '' });
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const [serverErrors, setServerErrors] = useState<Partial<Record<Field, string>>>({});
  const [message, setMessage] = useState<string | null>(notice);
  const [busy, setBusy] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [caps, setCaps] = useState(false);
  const [lens, setLens] = useState<Lens>('shut');
  const [leaving, setLeaving] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // The one orchestrated moment on arrival: the iris opens.
  useEffect(() => {
    const t = setTimeout(() => setLens('open'), reducedMotion() ? 0 : 250);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => setMessage(notice), [notice]);

  useEffect(() => {
    if (location.pathname.startsWith('/r/')) return; // keep invite links intact
    const path = mode === 'register' ? '/register' : '/login';
    if (location.pathname !== path) history.replaceState(null, '', path + location.search);
  }, [mode]);

  const errors = validate(mode, v);
  const errorFor = (f: Field) => serverErrors[f] ?? (touched[f] ? errors[f] : undefined);
  const strength = passwordStrength(v.password);
  const set = (f: Field) => (val: string) => {
    setV((s) => ({ ...s, [f]: val }));
    setServerErrors((s) => ({ ...s, [f]: undefined }));
  };

  const blink = async () => {
    setLens('blink');
    await wait(380);
    setLens(document.activeElement?.getAttribute('name') === 'password' ? 'peek' : 'open');
  };

  const switchMode = (m: Mode) => {
    if (m === mode) return;
    setMode(m);
    setTouched({});
    setServerErrors({});
    setMessage(null);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched({ name: true, email: true, password: true });
    if (Object.keys(errors).length) {
      void blink();
      formRef.current?.querySelector<HTMLInputElement>('[aria-invalid="true"]')?.focus();
      return;
    }
    setBusy(true);
    setMessage(null);
    const enter = async () => {
      setLens('wide');
      setLeaving(true);
      await wait(720);
    };
    try {
      if (mode === 'register') await register(v.name.trim(), v.email.trim(), v.password, enter);
      else await login(v.email.trim(), v.password, enter);
    } catch (err) {
      const apiErr = err instanceof ApiError ? err : null;
      setServerErrors((apiErr?.fields ?? {}) as Partial<Record<Field, string>>);
      setMessage(apiErr?.message ?? 'That didn’t go through. Check your connection and try again.');
      setBusy(false);
      void blink();
    }
  };

  const open = LENS_OPEN[lens];
  const copy = COPY[mode];

  return (
    <div className={`studio${leaving ? ' studio--leaving' : ''}`} data-mode={mode}>
      <div className="studio__grain" aria-hidden="true" />

      <header className="studio__brand">
        <Aperture open={0.42} className="mark" />
        <span>Huddle</span>
      </header>

      <div className="lens" data-lens={lens}>
        <FStopRing open={open} />
        <Aperture open={open} className="lens__iris" label={`Preview of a call. The lens is ${lens === 'peek' ? 'closed while you type your password' : 'open'}.`}>
          <LensScene myName={mode === 'register' ? v.name : ''} />
        </Aperture>
        <p className="lens__caption" aria-live="polite">
          {lens === 'peek' ? 'Lens closed while you type your password.' : ' '}
        </p>
      </div>

      <main className="studio__panel">
        <h1 key={mode} className="studio__title">
          <span>{copy.title[0]}</span>
          <span>{copy.title[1]}</span>
        </h1>
        <p className="studio__sub">{copy.sub}</p>

        <div className="switch" role="tablist" aria-label="Sign in or create an account">
          <button role="tab" type="button" aria-selected={mode === 'login'} onClick={() => switchMode('login')}>
            Sign in
          </button>
          <button role="tab" type="button" aria-selected={mode === 'register'} onClick={() => switchMode('register')}>
            Create account
          </button>
          <span className="switch__bar" aria-hidden="true" />
        </div>

        {message && (
          <p className="studio__message" role="alert">
            {message}
          </p>
        )}

        <form ref={formRef} className="studio__form" onSubmit={submit} noValidate>
          <div className={`reveal${mode === 'register' ? ' reveal--open' : ''}`} aria-hidden={mode !== 'register'}>
            <div>
              <Line
                name="name"
                label="Your name"
                type="text"
                autoComplete="name"
                value={v.name}
                onChange={set('name')}
                onBlur={() => v.name && setTouched((t) => ({ ...t, name: true }))}
                error={mode === 'register' ? errorFor('name') : undefined}
              />
            </div>
          </div>
          <Line
            name="email"
            label="Email"
            type="email"
            autoComplete="email"
            value={v.email}
            onChange={set('email')}
            onBlur={() => v.email && setTouched((t) => ({ ...t, email: true }))}
            error={errorFor('email')}
            autoFocus
          />
          <Line
            name="password"
            label="Password"
            type={showPw ? 'text' : 'password'}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            value={v.password}
            onChange={set('password')}
            onFocus={() => setLens('peek')}
            onBlur={() => {
              if (v.password) setTouched((t) => ({ ...t, password: true }));
              setLens((l) => (l === 'peek' ? 'open' : l));
            }}
            onKeyUp={(e) => setCaps(e.getModifierState?.('CapsLock') ?? false)}
            error={errorFor('password')}
            trailing={
              <button type="button" className="line__toggle" onClick={() => setShowPw((s) => !s)} aria-pressed={showPw}>
                {showPw ? 'Hide' : 'Show'}
              </button>
            }
          />
          {caps && <p className="studio__hint">Caps Lock is on.</p>}

          {mode === 'register' && v.password && (
            <div className={`meter meter--${strength.score}`} aria-live="polite">
              <div className="meter__track">
                <span style={{ width: `${strength.score * 25}%` }} />
              </div>
              <span className="meter__label">{strength.label}</span>
            </div>
          )}

          <button className="shutter" type="submit" disabled={busy}>
            <span className="shutter__dot" aria-hidden="true" />
            {busy ? (mode === 'login' ? 'Signing in…' : 'Creating account…') : copy.cta}
          </button>
        </form>
      </main>
    </div>
  );
}
