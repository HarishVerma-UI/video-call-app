import { ApiError, type AuthUser, type UserRole } from '@vca/shared';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { CloseIcon, PencilIcon, PlusIcon, ShieldIcon, TrashIcon } from './Icons';
import { Line } from './Line';
import { Avatar } from './RoomBadge';

type Draft = { name: string; email: string; password: string; role: UserRole };

const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const fmtWhen = (iso?: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Never');
const authMethod = (u: AuthUser) => (u.provider ? u.provider[0].toUpperCase() + u.provider.slice(1) : u.hasPassword ? 'Password' : '—');

/** Create- or edit-user dialog. */
function UserForm({ editing, selfId, onClose, onSaved }: { editing: AuthUser | null; selfId: string; onClose: () => void; onSaved: (u: AuthUser, verb: string) => void }) {
  const { api } = useAuth();
  const isNew = !editing;
  const isSelf = !!editing && editing.id === selfId;
  const [d, setD] = useState<Draft>({ name: editing?.name ?? '', email: editing?.email ?? '', password: '', role: (editing?.role as UserRole) ?? 'user' });
  const [err, setErr] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr({});
    setMsg(null);
    try {
      if (!editing) {
        const { user } = await api.adminCreateUser({ name: d.name.trim(), email: d.email.trim(), password: d.password, role: d.role });
        onSaved(user, 'created');
      } else {
        const patch: { name?: string; email?: string; role?: UserRole; password?: string } = { name: d.name.trim(), email: d.email.trim(), role: d.role };
        if (d.password) patch.password = d.password;
        const { user } = await api.adminUpdateUser(editing.id, patch);
        onSaved(user, 'updated');
      }
    } catch (ex) {
      const ae = ex instanceof ApiError ? ex : null;
      setErr(ae?.fields ?? {});
      setMsg(ae?.message ?? 'Could not save this user.');
      setBusy(false);
    }
  };

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label={isNew ? 'Add user' : 'Edit user'} onClick={onClose}>
      <form className="modal__card card" onClick={(e) => e.stopPropagation()} onSubmit={submit} noValidate>
        <header className="card__head">
          <div>
            <h2>{isNew ? 'Add user' : 'Edit user'}</h2>
            <p>{isNew ? 'Create an account people can sign in with.' : 'Update this account’s details.'}</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <CloseIcon width={20} height={20} />
          </button>
        </header>
        <div className="card__grid">
          <Line name="name" label="Name" type="text" autoComplete="off" value={d.name} onChange={(v) => setD({ ...d, name: v })} error={err.name} />
          <Line name="email" label="Email" type="email" autoComplete="off" value={d.email} onChange={(v) => setD({ ...d, email: v })} error={err.email} />
        </div>
        <Line
          name="password"
          label={isNew ? 'Password' : 'New password (leave blank to keep)'}
          type="password"
          autoComplete="new-password"
          value={d.password}
          onChange={(v) => setD({ ...d, password: v })}
          error={err.password}
        />
        <div className={`line${err.role ? ' line--error' : ''}`}>
          <label htmlFor="admin-role">Role</label>
          <div className="line__row">
            <select
              id="admin-role"
              className="admin__select"
              value={d.role}
              disabled={isSelf}
              onChange={(e) => setD({ ...d, role: e.target.value as UserRole })}
              data-testid="user-role"
            >
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <span className="line__rule" />
          {isSelf && <p className="line__hint">You can’t change your own role.</p>}
          {err.role && <p className="line__error">{err.role}</p>}
        </div>
        {msg && <p className="form-msg" role="alert">{msg}</p>}
        <div className="modal__actions">
          <button type="button" className="btn btn--secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn--primary" disabled={busy} data-testid="save-user">
            {busy ? 'Saving…' : isNew ? 'Create user' : 'Save changes'}
          </button>
        </div>
      </form>
    </div>
  );
}

export function AdminView() {
  const { api, user } = useAuth();
  const [users, setUsers] = useState<AuthUser[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [editing, setEditing] = useState<AuthUser | null>(null);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await api.adminListUsers();
      setUsers(r.users);
      setTotal(r.total);
    } catch (ex) {
      setError(ex instanceof ApiError ? ex.message : 'Could not load users.');
      setUsers([]);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const openNew = () => {
    setEditing(null);
    setShowForm(true);
  };
  const openEdit = (u: AuthUser) => {
    setEditing(u);
    setShowForm(true);
  };
  const onSaved = (u: AuthUser, verb: string) => {
    setShowForm(false);
    setFlash(`${u.name || u.email} ${verb}.`);
    void load();
  };
  const remove = async (u: AuthUser) => {
    if (!window.confirm(`Delete ${u.name || u.email}? This cannot be undone.`)) return;
    setFlash(null);
    setError(null);
    try {
      await api.adminDeleteUser(u.id);
      setFlash(`Deleted ${u.name || u.email}.`);
      void load();
    } catch (ex) {
      setError(ex instanceof ApiError ? ex.message : 'Could not delete this user.');
    }
  };

  return (
    <section className="page" aria-label="Admin dashboard" data-testid="admin">
      <header className="admin__hero">
        <span className="card__icon card__icon--face">
          <ShieldIcon width={22} height={22} />
        </span>
        <div className="admin__hero-text">
          <h1>Admin dashboard</h1>
          <p>{users === null ? 'Loading accounts…' : `${total} registered ${total === 1 ? 'account' : 'accounts'}`}</p>
        </div>
        <button className="btn btn--primary btn--small" onClick={openNew} data-testid="add-user">
          <PlusIcon width={16} height={16} /> New user
        </button>
      </header>

      {flash && <p className="form-msg form-msg--ok" role="status">{flash}</p>}
      {error && <p className="form-msg" role="alert">{error}</p>}

      <div className="card admin__tablewrap">
        {users === null ? (
          <div className="skeleton-list" aria-hidden="true">
            <i />
          </div>
        ) : users.length === 0 ? (
          <p className="card__empty">No accounts yet.</p>
        ) : (
          <table className="admin__table" data-testid="user-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Sign-in</th>
                <th>Joined</th>
                <th>Last seen</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <span className="admin__user">
                      <Avatar id={u.id} name={u.name || u.email || '?'} size={32} />
                      <span className="admin__user-text">
                        <strong>{u.name || '—'}</strong>
                        <span>{u.email || 'No email'}</span>
                      </span>
                    </span>
                  </td>
                  <td>
                    <span className={`pill pill--${u.role === 'admin' ? 'admin' : 'user'}`}>{u.role === 'admin' ? 'Admin' : 'User'}</span>
                  </td>
                  <td>{authMethod(u)}</td>
                  <td>{fmtDate(u.createdAt)}</td>
                  <td>{fmtWhen(u.lastLoginAt)}</td>
                  <td className="admin__row-actions">
                    <button className="icon-btn" onClick={() => openEdit(u)} aria-label={`Edit ${u.name || u.email}`} title="Edit">
                      <PencilIcon width={18} height={18} />
                    </button>
                    <button
                      className="icon-btn icon-btn--danger"
                      onClick={() => void remove(u)}
                      disabled={u.id === user?.id}
                      aria-label={`Delete ${u.name || u.email}`}
                      title={u.id === user?.id ? 'You can’t delete yourself' : 'Delete'}
                    >
                      <TrashIcon width={18} height={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showForm && <UserForm editing={editing} selfId={user?.id ?? ''} onClose={() => setShowForm(false)} onSaved={onSaved} />}
    </section>
  );
}
