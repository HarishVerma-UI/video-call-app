// Password reset, served at /reset-password.
//   • no ?token  → "request a link" form: enter email, we send a reset link
//     (in dev with no mail provider the link is shown on screen).
//   • ?token=…   → "set a new password" form: choose a new password, which signs
//     you in. An invalid or expired token is explained with a way to start over.
import { ApiError } from '@vca/shared';
import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { Line } from './Line';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const tokenFromUrl = () => new URLSearchParams(location.search).get('token') ?? '';

export function ResetPasswordPage() {
  const token = tokenFromUrl();
  return (
    <div className="auth">
      <main className="auth__panel">
        <div className="auth__card">
          <a className="auth__brandmark auth__brandmark--link" href="/" aria-label="Huddle home page">Huddle</a>
          <a className="auth__back" href="/login">← Back to sign in</a>
          {token ? <SetNewPassword token={token} /> : <RequestLink />}
        </div>
      </main>
    </div>
  );
}

/* ---------- step 1: request a reset link ---------- */
function RequestLink() {
  const { api } = useAuth();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [devUrl, setDevUrl] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!EMAIL.test(email.trim())) { setError('Enter a valid email address.'); return; }
    setBusy(true); setError('');
    try {
      const r = await api.forgotPassword({ email: email.trim() });
      setDevUrl(r.resetUrl ?? null);
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.');
    } finally { setBusy(false); }
  };

  if (sent) {
    return (
      <>
        <h1 className="auth__title">Check your email</h1>
        <p className="auth__lede">If an account exists for <strong>{email.trim()}</strong>, we’ve sent a link to reset your password. It expires in 1 hour.</p>
        {devUrl && (
          <div className="auth__devlink">
            <p>Email isn’t configured on this server, so here’s your reset link:</p>
            <a href={devUrl}>{devUrl}</a>
          </div>
        )}
        <a className="btn btn--primary btn--wide" href="/login">Back to sign in</a>
      </>
    );
  }
  return (
    <>
      <h1 className="auth__title">Reset your password</h1>
      <p className="auth__lede">Enter the email for your account and we’ll send you a link to choose a new password.</p>
      <form className="auth__form" onSubmit={submit} noValidate>
        <Line name="email" label="Email" type="email" autoComplete="username" value={email} onChange={setEmail} error={error} autoFocus />
        <button className="btn btn--primary" type="submit" disabled={busy} data-testid="reset-request">
          {busy ? 'Sending…' : 'Send reset link'}
        </button>
      </form>
    </>
  );
}

/* ---------- step 2: set a new password with the token ---------- */
function SetNewPassword({ token }: { token: string }) {
  const { resetPassword } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [fields, setFields] = useState<{ password?: string; confirm?: string }>({});
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const f: { password?: string; confirm?: string } = {};
    if (password.length < 8) f.password = 'Use at least 8 characters.';
    else if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) f.password = 'Mix in at least one letter and one number.';
    if (confirm !== password) f.confirm = 'Passwords don’t match.';
    setFields(f);
    if (Object.keys(f).length) return;

    setBusy(true); setError('');
    try {
      await resetPassword(token, password);
      // Signed in — land in the app with a clean URL.
      window.location.assign('/');
    } catch (err) {
      if (err instanceof ApiError && err.fields?.password) {
        setFields({ password: err.fields.password });
      } else {
        setError(err instanceof ApiError ? err.message : 'Could not reset your password. Try again.');
      }
      setBusy(false);
    }
  };

  return (
    <>
      <h1 className="auth__title">Choose a new password</h1>
      <p className="auth__lede">Pick a new password for your account. You’ll be signed in right after.</p>
      {error && <p className="auth__msg" role="alert">{error} <a href="/reset-password">Request a new link</a>.</p>}
      <form className="auth__form" onSubmit={submit} noValidate>
        <Line name="new-password" label="New password" type="password" autoComplete="new-password" value={password} onChange={setPassword} error={fields.password} autoFocus />
        <Line name="confirm-password" label="Confirm new password" type="password" autoComplete="new-password" value={confirm} onChange={setConfirm} error={fields.confirm} />
        <button className="btn btn--primary" type="submit" disabled={busy} data-testid="reset-submit">
          {busy ? 'Saving…' : 'Set password & sign in'}
        </button>
      </form>
    </>
  );
}
