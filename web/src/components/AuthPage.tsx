import { ApiError, passwordStrength, type Providers } from '@vca/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { API_BASE } from '../config';
import { Aperture } from './Aperture';
import { GitHubIcon, GoogleIcon } from './Icons';
import { Line } from './Line';
import { ModeToggle } from './ModeToggle';

type Tab = 'login' | 'register';
type Fields = Partial<Record<'name' | 'email' | 'password', string>>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function pathTab(): Tab {
  return location.pathname === '/register' ? 'register' : 'login';
}

/** Read ?oauth_error=… left by a failed social login redirect, then clean the URL. */
function readOAuthError(): string | null {
  try {
    const u = new URL(location.href);
    const err = u.searchParams.get('oauth_error');
    if (!err) return null;
    u.searchParams.delete('oauth_error');
    history.replaceState(null, '', u.pathname + (u.search || '') + u.hash);
    return err;
  } catch {
    return null;
  }
}

function startOAuth(provider: string) {
  const next = encodeURIComponent(location.pathname + location.search);
  window.location.href = `${API_BASE}/api/auth/oauth/${provider}/start?next=${next}`;
}

function SocialButtons({ providers }: { providers: Providers }) {
  const hasAny = providers.google || providers.github;
  if (!hasAny) return null;
  return (
    <>
      <div className="social">
        {providers.google && (
          <button type="button" className="btn btn--social" onClick={() => startOAuth('google')} data-testid="oauth-google">
            <GoogleIcon /> Continue with Google
          </button>
        )}
        {providers.github && (
          <button type="button" className="btn btn--social" onClick={() => startOAuth('github')} data-testid="oauth-github">
            <GitHubIcon /> Continue with GitHub
          </button>
        )}
      </div>
      <div className="or">
        <span>or use your email</span>
      </div>
    </>
  );
}

export function AuthPage() {
  const { login, register, notice } = useAuth();
  const [tab, setTabState] = useState<Tab>(pathTab);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Fields>({});
  const [message, setMessage] = useState<string | null>(() => readOAuthError() ?? notice);
  const [busy, setBusy] = useState(false);
  const [providers, setProviders] = useState<Providers>({});
  const strength = passwordStrength(password);

  useEffect(() => setMessage((m) => m ?? notice), [notice]);
  useEffect(() => {
    let cancelled = false;
    // Which social buttons to show is decided by the server's configuration.
    fetch(`${API_BASE}/api/auth/providers`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d?.providers) setProviders(d.providers);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const setTab = (t: Tab) => {
    setTabState(t);
    setErrors({});
    setMessage(null);
    const path = t === 'register' ? '/register' : '/login';
    if (!location.pathname.startsWith('/r/') && location.pathname !== path) history.replaceState(null, '', path);
  };

  const fail = (err: unknown) => {
    if (err instanceof ApiError) {
      setErrors(err.fields as Fields);
      setMessage(err.message);
    } else setMessage((err as Error)?.message ?? 'Something went wrong. Please try again.');
  };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    setMessage(null);
    const e: Fields = {};
    if (tab === 'register' && name.trim().length < 2) e.name = 'Add your name, at least 2 characters.';
    if (!EMAIL.test(email.trim())) e.email = 'Enter an email like name@example.com.';
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
        </div>
        <div className="auth__pitch">
          <h2>Meet face to face.</h2>
          <p>Sign in with your email, Google or GitHub, then start a group meeting in one click — up to 10 people.</p>
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
            {tab === 'login' ? 'Sign in with your email and password.' : 'Join with your email and a password, or use Google or GitHub.'}
          </p>

          {message && (
            <p className="auth__msg" role="alert" data-testid="auth-message">
              {message}
            </p>
          )}

          <SocialButtons providers={providers} />

          <form className="auth__form" onSubmit={submit} noValidate>
            {tab === 'register' && <Line name="name" label="Your name" type="text" autoComplete="name" value={name} onChange={setName} error={errors.name} />}
            <Line name="email" label="Email" type="email" autoComplete={tab === 'login' ? 'username' : 'email'} value={email} onChange={setEmail} error={errors.email} />
            <Line
              name="password"
              label="Password"
              type="password"
              autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={setPassword}
              error={errors.password}
            />
            {tab === 'register' && password && (
              <div className={`meter meter--${strength.score}`} aria-live="polite">
                <div className="meter__track">
                  <span style={{ width: `${strength.score * 25}%` }} />
                </div>
                <span className="meter__label">{strength.label}</span>
              </div>
            )}
            <button className="btn btn--primary btn--wide" type="submit" disabled={busy} data-testid="password-submit">
              {busy ? (tab === 'login' ? 'Signing in…' : 'Creating…') : tab === 'login' ? 'Sign in' : 'Create account'}
            </button>
          </form>
        </div>
        <p className="auth__foot">Private group video calls · up to 10 people</p>
      </main>
    </div>
  );
}
