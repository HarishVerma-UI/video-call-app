import { ApiError, colorFor, initials, passwordStrength } from '@vca/shared';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { CloseIcon } from './Icons';
import { Line } from './Line';

type Fields = Record<string, string | undefined>;

/** Edit your name, email and password. Opens over the lobby. */
export function ProfilePanel({ onClose }: { onClose: () => void }) {
  const { user, updateProfile, changePassword } = useAuth();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  // --- details ---
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [detailsPw, setDetailsPw] = useState('');
  const [detailsErr, setDetailsErr] = useState<Fields>({});
  const [detailsMsg, setDetailsMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [savingDetails, setSavingDetails] = useState(false);
  const emailChanged = !!user && email.trim().toLowerCase() !== user.email;
  const detailsDirty = !!user && (name.trim().replace(/\s+/g, ' ') !== user.name || emailChanged);

  // --- password ---
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [pwErr, setPwErr] = useState<Fields>({});
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [savingPw, setSavingPw] = useState(false);
  const strength = passwordStrength(next);

  // Close on Escape; keep focus inside the dialog.
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLInputElement>('input')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current();
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const els = [...dialogRef.current.querySelectorAll<HTMLElement>('button, input')].filter((el) => !(el as HTMLButtonElement).disabled);
      if (!els.length) return;
      const first = els[0];
      const last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, []); // once: focus the first field, trap Tab, close on Escape

  if (!user) return null;

  const saveDetails = async (e: FormEvent) => {
    e.preventDefault();
    setDetailsMsg(null);
    const errs: Fields = {};
    if (name.trim().length < 2) errs.name = 'Use at least 2 characters.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) errs.email = 'Enter an email like name@example.com.';
    if (emailChanged && !detailsPw) errs.currentPassword = 'Enter your current password to change your email.';
    setDetailsErr(errs);
    if (Object.keys(errs).length) return;
    setSavingDetails(true);
    try {
      const updated = await updateProfile({
        name: name.trim(),
        ...(emailChanged ? { email: email.trim(), currentPassword: detailsPw } : {}),
      });
      setName(updated.name);
      setEmail(updated.email);
      setDetailsPw('');
      setDetailsMsg({ ok: true, text: 'Saved. People in your next call will see the new details.' });
    } catch (err) {
      const apiErr = err instanceof ApiError ? err : null;
      setDetailsErr(apiErr?.fields ?? {});
      setDetailsMsg({ ok: false, text: apiErr?.message ?? 'Couldn’t save. Check your connection and try again.' });
    } finally {
      setSavingDetails(false);
    }
  };

  const savePassword = async (e: FormEvent) => {
    e.preventDefault();
    setPwMsg(null);
    const errs: Fields = {};
    if (!current) errs.currentPassword = 'Enter your current password.';
    if (next.length < 8) errs.newPassword = 'Use at least 8 characters.';
    else if (!/[a-zA-Z]/.test(next) || !/\d/.test(next)) errs.newPassword = 'Mix in at least one letter and one number.';
    setPwErr(errs);
    if (Object.keys(errs).length) return;
    setSavingPw(true);
    try {
      await changePassword(current, next);
      setCurrent('');
      setNext('');
      setPwMsg({ ok: true, text: 'Password changed. You’re still signed in here; your other devices have been signed out.' });
    } catch (err) {
      const apiErr = err instanceof ApiError ? err : null;
      setPwErr(apiErr?.fields ?? {});
      setPwMsg({ ok: false, text: apiErr?.message ?? 'Couldn’t change your password. Try again.' });
    } finally {
      setSavingPw(false);
    }
  };

  const joined = new Date(user.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  return (
    <div className="sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="profile" role="dialog" aria-modal="true" aria-labelledby="profile-title" ref={dialogRef} data-testid="profile">
        <header className="profile__head">
          <span className="profile__avatar" style={{ background: colorFor(user.id) }}>
            {initials(name || user.name)}
          </span>
          <div>
            <h2 id="profile-title">Your profile</h2>
            <p>Member since {joined}</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close profile">
            <CloseIcon width={18} height={18} />
          </button>
        </header>

        <form className="profile__form" onSubmit={saveDetails} noValidate>
          <h3>Details</h3>
          <Line name="name" label="Name" type="text" autoComplete="name" value={name} onChange={setName} error={detailsErr.name} />
          <Line name="email" label="Email" type="email" autoComplete="email" value={email} onChange={setEmail} error={detailsErr.email} />
          {emailChanged && (
            <Line
              name="currentPassword"
              label="Current password (to confirm the new email)"
              type="password"
              autoComplete="current-password"
              value={detailsPw}
              onChange={setDetailsPw}
              error={detailsErr.currentPassword}
            />
          )}
          {detailsMsg && (
            <p className={`profile__msg${detailsMsg.ok ? ' profile__msg--ok' : ''}`} role="status">
              {detailsMsg.text}
            </p>
          )}
          <button className="shutter profile__save" type="submit" disabled={savingDetails || !detailsDirty}>
            {savingDetails ? 'Saving…' : 'Save changes'}
          </button>
        </form>

        <form className="profile__form" onSubmit={savePassword} noValidate>
          <h3>Password</h3>
          <Line
            name="currentPassword"
            label="Current password"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={setCurrent}
            error={pwErr.currentPassword}
          />
          <Line name="newPassword" label="New password" type="password" autoComplete="new-password" value={next} onChange={setNext} error={pwErr.newPassword} />
          {next && (
            <div className={`meter meter--${strength.score}`} aria-live="polite">
              <div className="meter__track">
                <span style={{ width: `${strength.score * 25}%` }} />
              </div>
              <span className="meter__label">{strength.label}</span>
            </div>
          )}
          {pwMsg && (
            <p className={`profile__msg${pwMsg.ok ? ' profile__msg--ok' : ''}`} role="status">
              {pwMsg.text}
            </p>
          )}
          <button className="ghost-btn profile__pw" type="submit" disabled={savingPw || !current || !next}>
            {savingPw ? 'Changing…' : 'Change password'}
          </button>
          <p className="profile__note">Changing your password signs you out on your other devices.</p>
        </form>
      </div>
    </div>
  );
}
