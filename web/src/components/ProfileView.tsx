import { ApiError, passwordStrength, type FaceCredential } from '@vca/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { PasskeyCancelled, passkeysSupported, unlockName } from '../auth/passkey';
import { ago } from '../format';
import { FaceIdIcon, KeyIcon, LaptopIcon, PhoneDeviceIcon, SignOutIcon, TrashIcon } from './Icons';
import { Line } from './Line';
import { Avatar } from './RoomBadge';

type Fields = Record<string, string | undefined>;
type Msg = { ok: boolean; text: string } | null;

function Status({ msg }: { msg: Msg }) {
  if (!msg) return null;
  return (
    <p className={`form-msg${msg.ok ? ' form-msg--ok' : ''}`} role="status">
      {msg.text}
    </p>
  );
}

function FaceDevices() {
  const { api, user, addFaceToAccount, refreshUser } = useAuth();
  const [list, setList] = useState<FaceCredential[] | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .credentials()
      .then(({ credentials }) => setList(credentials))
      .catch(() => setList([]));
  }, [api]);

  const add = async () => {
    setMsg(null);
    setBusy(true);
    try {
      await addFaceToAccount();
      setList((await api.credentials()).credentials);
      setMsg({ ok: true, text: 'Face sign-in is on for this device.' });
    } catch (err) {
      if (!(err instanceof PasskeyCancelled)) setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (c: FaceCredential) => {
    setMsg(null);
    try {
      setList((await api.removeCredential(c.id)).credentials);
      setMsg({ ok: true, text: `Removed “${c.name}”. It can no longer sign in to your account.` });
      await refreshUser();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof ApiError ? err.message : 'Couldn’t remove that device.' });
    }
  };

  return (
    <section className="card" aria-labelledby="face-h">
      <header className="card__head">
        <span className="card__icon card__icon--face">
          <FaceIdIcon width={22} height={22} />
        </span>
        <div>
          <h2 id="face-h">Face sign-in</h2>
          <p>Devices that can sign in with Face ID, Windows Hello, Android face unlock or fingerprint. Your face never leaves the device.</p>
        </div>
      </header>
      {list === null ? (
        <div className="skeleton-list" aria-hidden="true">
          <i />
        </div>
      ) : list.length === 0 ? (
        <p className="card__empty">No devices yet.{user?.hasPassword ? ' You sign in with your password.' : ''}</p>
      ) : (
        <ul className="devices" data-testid="face-devices">
          {list.map((c) => (
            <li key={c.id} className="devices__row">
              <span className="devices__icon">{c.kind === 'device' || /iPhone|Android/.test(c.name) ? <PhoneDeviceIcon /> : <LaptopIcon />}</span>
              <span className="devices__main">
                <strong>
                  {c.name}
                  {c.synced && <span className="pill">Synced</span>}
                  {c.kind === 'device' && <span className="pill">Huddle app</span>}
                </strong>
                <span>
                  Added {ago(c.createdAt)} · last used {ago(c.lastUsedAt)}
                </span>
              </span>
              <button className="icon-btn icon-btn--danger" onClick={() => void remove(c)} aria-label={`Remove ${c.name}`} title="Remove">
                <TrashIcon width={18} height={18} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Status msg={msg} />
      {passkeysSupported() && (
        <button className="btn btn--secondary" onClick={() => void add()} disabled={busy} data-testid="add-face">
          <FaceIdIcon width={18} height={18} /> {busy ? `Waiting for ${unlockName()}…` : 'Set up face sign-in on this device'}
        </button>
      )}
    </section>
  );
}

export function ProfileView() {
  const { user, updateProfile, changePassword, logout } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [emailPw, setEmailPw] = useState('');
  const [dErr, setDErr] = useState<Fields>({});
  const [dMsg, setDMsg] = useState<Msg>(null);
  const [savingD, setSavingD] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [pErr, setPErr] = useState<Fields>({});
  const [pMsg, setPMsg] = useState<Msg>(null);
  const [savingP, setSavingP] = useState(false);
  if (!user) return null;

  const hasPassword = user.hasPassword !== false;
  const emailChanged = email.trim().toLowerCase() !== user.email;
  const dirty = name.trim().replace(/\s+/g, ' ') !== user.name || emailChanged;
  const strength = passwordStrength(next);

  const saveDetails = async (e: FormEvent) => {
    e.preventDefault();
    setDMsg(null);
    const errs: Fields = {};
    if (name.trim().length < 2) errs.name = 'Use at least 2 characters.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) errs.email = 'Enter an email like name@example.com.';
    if (emailChanged && hasPassword && !emailPw) errs.currentPassword = 'Enter your current password to change your email.';
    setDErr(errs);
    if (Object.keys(errs).length) return;
    setSavingD(true);
    try {
      const u = await updateProfile({
        name: name.trim(),
        ...(emailChanged ? { email: email.trim(), ...(hasPassword ? { currentPassword: emailPw } : {}) } : {}),
      });
      setName(u.name);
      setEmail(u.email);
      setEmailPw('');
      setDMsg({ ok: true, text: 'Saved. People in your next meeting will see the new details.' });
    } catch (err) {
      const apiErr = err instanceof ApiError ? err : null;
      setDErr(apiErr?.fields ?? {});
      setDMsg({ ok: false, text: apiErr?.message ?? 'Couldn’t save. Check your connection and try again.' });
    } finally {
      setSavingD(false);
    }
  };

  const savePassword = async (e: FormEvent) => {
    e.preventDefault();
    setPMsg(null);
    const errs: Fields = {};
    if (hasPassword && !current) errs.currentPassword = 'Enter your current password.';
    if (next.length < 8) errs.newPassword = 'Use at least 8 characters.';
    else if (!/[a-zA-Z]/.test(next) || !/\d/.test(next)) errs.newPassword = 'Mix in at least one letter and one number.';
    setPErr(errs);
    if (Object.keys(errs).length) return;
    setSavingP(true);
    try {
      await changePassword(hasPassword ? current : null, next);
      setCurrent('');
      setNext('');
      setPMsg({
        ok: true,
        text: hasPassword ? 'Password changed. Your other devices have been signed out.' : 'Backup password added. You can now sign in with your email too.',
      });
    } catch (err) {
      const apiErr = err instanceof ApiError ? err : null;
      setPErr(apiErr?.fields ?? {});
      setPMsg({ ok: false, text: apiErr?.message ?? 'Couldn’t change your password. Try again.' });
    } finally {
      setSavingP(false);
    }
  };

  return (
    <section className="page page--narrow" aria-label="Your profile" data-testid="profile">
      <header className="profile-hero">
        <Avatar id={user.id} name={name || user.name} size={72} ring />
        <div>
          <h1>{user.name}</h1>
          <p>
            {user.email} · member since {new Date(user.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
          </p>
        </div>
        <button className="btn btn--secondary btn--small profile-hero__out" onClick={() => logout()} data-testid="sign-out">
          <SignOutIcon width={16} height={16} /> Sign out
        </button>
      </header>

      <form className="card" onSubmit={saveDetails} noValidate aria-labelledby="details-h">
        <header className="card__head">
          <div>
            <h2 id="details-h">Details</h2>
            <p>How you appear in meetings and chat.</p>
          </div>
        </header>
        <div className="card__grid">
          <Line name="name" label="Name" type="text" autoComplete="name" value={name} onChange={setName} error={dErr.name} />
          <Line name="email" label="Email" type="email" autoComplete="email" value={email} onChange={setEmail} error={dErr.email} />
        </div>
        {emailChanged && hasPassword && (
          <Line
            name="currentPassword"
            label="Current password (to confirm the new email)"
            type="password"
            autoComplete="current-password"
            value={emailPw}
            onChange={setEmailPw}
            error={dErr.currentPassword}
          />
        )}
        <Status msg={dMsg} />
        <button className="btn btn--primary" type="submit" disabled={savingD || !dirty} data-testid="save-details">
          {savingD ? 'Saving…' : 'Save changes'}
        </button>
      </form>

      <FaceDevices />

      <form className="card" onSubmit={savePassword} noValidate aria-labelledby="pw-h">
        <header className="card__head">
          <span className="card__icon">
            <KeyIcon width={20} height={20} />
          </span>
          <div>
            <h2 id="pw-h">{hasPassword ? 'Password' : 'Backup password'}</h2>
            <p>
              {hasPassword
                ? 'Changing your password signs you out on your other devices.'
                : 'Your account has no password. Add one so you can still sign in on a device without face unlock.'}
            </p>
          </div>
        </header>
        <div className="card__grid">
          {hasPassword && (
            <Line
              name="currentPassword"
              label="Current password"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={setCurrent}
              error={pErr.currentPassword}
            />
          )}
          <Line name="newPassword" label={hasPassword ? 'New password' : 'Password'} type="password" autoComplete="new-password" value={next} onChange={setNext} error={pErr.newPassword} />
        </div>
        {next && (
          <div className={`meter meter--${strength.score}`} aria-live="polite">
            <div className="meter__track">
              <span style={{ width: `${strength.score * 25}%` }} />
            </div>
            <span className="meter__label">{strength.label}</span>
          </div>
        )}
        <Status msg={pMsg} />
        <button className="btn btn--secondary" type="submit" disabled={savingP || !next || (hasPassword && !current)} data-testid="save-password">
          {savingP ? 'Saving…' : hasPassword ? 'Change password' : 'Add password'}
        </button>
      </form>
    </section>
  );
}
