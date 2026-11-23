// Admin-only edit drawer for a user account: change name, email and role, set a
// new password, and review a pending recruiter application (Approve promotes the
// account to recruiter; Reject declines it). Every field maps to the existing
// PATCH /api/admin/users/:id, which is the server's source of truth and own guard
// (e.g. an admin can't strip their own super-admin access).
import { useEffect, useState } from 'react';
import { ROLE_LABEL, normalizeRole, type AdminUser, type UserRole } from '@vca/shared';
import { useAuth } from '../../auth/AuthContext';

function Ic({ d, size = 16 }: { d: string; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;
}
const ROLES: [UserRole, string][] = [['member', 'Member'], ['recruiter', 'Recruiter'], ['super_admin', 'Super Admin']];

export function UserEditDrawer({ user, onClose, onSaved }: { user: AdminUser; onClose: () => void; onSaved: (u: AdminUser) => void }) {
  const { api, user: me } = useAuth();
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email || '');
  const [role, setRole] = useState<UserRole>(normalizeRole(user.role || 'member'));
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const app = user.recruiterApplication;
  const pending = app?.status === 'pending';
  const isSelf = me?.id === user.id;

  const save = async () => {
    if (busy) return;
    setBusy(true); setErr(''); setOk('');
    const patch: { name?: string; email?: string; role?: UserRole; password?: string } = {};
    if (name.trim() !== user.name) patch.name = name.trim();
    if (email.trim() !== (user.email || '')) patch.email = email.trim();
    if (role !== normalizeRole(user.role || 'member')) patch.role = role;
    if (password) patch.password = password;
    if (!Object.keys(patch).length) { setOk('Nothing to save.'); setBusy(false); return; }
    try {
      const { user: updated } = await api.adminUpdateUser(user.id, patch);
      onSaved({ ...user, ...updated });
      setPassword(''); setOk('Saved.');
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not save changes.'); }
    finally { setBusy(false); }
  };
  const review = async (status: 'approved' | 'rejected') => {
    if (busy) return;
    setBusy(true); setErr(''); setOk('');
    try {
      const { user: updated } = await api.adminUpdateUser(user.id, { recruiterApplicationStatus: status });
      onSaved({ ...user, ...updated });
      setRole(normalizeRole(updated.role || 'member'));
      setOk(status === 'approved' ? 'Approved. Now a recruiter.' : 'Application rejected.');
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not update the application.'); }
    finally { setBusy(false); }
  };

  return (
    <div className="aa-drawer" role="dialog" aria-modal="true" aria-label={`Edit ${user.name}`}>
      <div className="aa-drawer__scrim" onClick={onClose} />
      <aside className="aa-drawer__panel">
        <header className="aa-drawer__head">
          <div className="aa-drawer__who">
            <div className="aa-drawer__name">Edit user</div>
            <div className="aa-drawer__mail">{user.email}</div>
            <span className={`aa-pill aa-pill--${normalizeRole(user.role) === 'super_admin' ? 'admin' : normalizeRole(user.role) === 'recruiter' ? 'recruiter' : 'member'}`}>{ROLE_LABEL[normalizeRole(user.role || 'member')]}</span>
          </div>
          <button className="aa-iconbtn" onClick={onClose} aria-label="Close"><Ic d="M18 6 6 18M6 6l12 12" size={18} /></button>
        </header>

        <div className="aa-drawer__body">
          {pending && (
            <section className="aa-card" style={{ borderColor: 'var(--aa-accent)', background: 'var(--aa-accent-soft)' }}>
              <div className="aa-card__head"><h3>Recruiter application · pending</h3></div>
              <dl className="aa-dlgrid">
                <div className="aa-dl"><dt>Company</dt><dd>{app?.company || '-'}</dd></div>
                <div className="aa-dl"><dt>Website</dt><dd>{app?.website ? <a href={app.website} target="_blank" rel="noreferrer">{app.website}</a> : '-'}</dd></div>
              </dl>
              {app?.reason && <p className="aa-drawer__bio" style={{ marginTop: 8 }}>{app.reason}</p>}
              <div className="aa-form__actions" style={{ marginTop: 12 }}>
                <button className="aa-btn aa-btn--danger" disabled={busy} onClick={() => review('rejected')}><Ic d="M18 6 6 18M6 6l12 12" size={14} /> Reject</button>
                <button className="aa-btn aa-btn--primary" disabled={busy} onClick={() => review('approved')}><Ic d="M20 6 9 17l-5-5" size={14} /> Approve as recruiter</button>
              </div>
            </section>
          )}

          <div className="aa-form">
            <label className="aa-field aa-field--wide"><span>Full name</span><input value={name} onChange={(e) => setName(e.target.value)} /></label>
            <label className="aa-field aa-field--wide"><span>Email</span><input value={email} onChange={(e) => setEmail(e.target.value)} /></label>
            <label className="aa-field aa-field--wide"><span>Role</span>
              <select value={role} onChange={(e) => setRole(e.target.value as UserRole)}>{ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            </label>
            {isSelf && role !== 'super_admin' && <p className="aa-msg">You can’t remove your own super-admin access.</p>}
            <label className="aa-field aa-field--wide"><span>New password</span><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Leave blank to keep current" autoComplete="new-password" /></label>
            {err && <p className="aa-msg">{err}</p>}
            {ok && <p className="aa-msg aa-msg--ok">{ok}</p>}
            <div className="aa-form__actions">
              <button className="aa-btn" onClick={onClose}>Close</button>
              <button className="aa-btn aa-btn--primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save changes'}</button>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
