import { ApiError, type ActiveRoom, type AdminStats, type AuthUser, type UserRole } from '@vca/shared';
import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent, type MouseEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { CloseIcon, PencilIcon, PlusIcon, ShieldIcon, TrashIcon, VideoIcon, PeopleIcon, UserIcon } from './Icons';
import { Line } from './Line';
import { Avatar } from './RoomBadge';

type Draft = { name: string; email: string; password: string; role: UserRole };

const fmtUptime = (sec: number) => {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
};
const ago = (iso: string) => {
  const diff = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (diff < 1) return 'Just now';
  if (diff < 60) return `${diff} minutes ago`;
  if (diff < 1440) return `${Math.floor(diff / 60)} hours ago`;
  return `${Math.floor(diff / 1440)} days ago`;
};

/* ─── mini chart ──────────────────────────────────────── */

function MiniChart({ data }: { data: { day: string; count: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  const W = 280;
  const H = 120;
  const pad = { t: 10, b: 22, l: 32, r: 10 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;

  const points = data.map((d, i) => {
    const x = pad.l + (i / Math.max(1, data.length - 1)) * iw;
    const y = pad.t + ih - (d.count / max) * ih;
    return { x, y, ...d };
  });

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const area = `${path} L${points[points.length - 1].x.toFixed(1)},${pad.t + ih} L${points[0].x.toFixed(1)},${pad.t + ih} Z`;
  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(max * f));

  return (
    <svg className="admin-chart" viewBox={`0 0 ${W} ${H}`} aria-label="Daily activity chart">
      {gridLines.map((v) => {
        const y = pad.t + ih - (v / max) * ih;
        return (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y} y2={y} className="admin-chart__grid" />
            <text x={pad.l - 6} y={y + 3} className="admin-chart__label" textAnchor="end">{v}</text>
          </g>
        );
      })}
      <path d={area} className="admin-chart__area" />
      <path d={path} className="admin-chart__line" />
      {points.map((p) => (
        <circle key={p.day} cx={p.x} cy={p.y} r={3.5} className="admin-chart__dot">
          <title>{p.day}: {p.count}</title>
        </circle>
      ))}
      {points.map((p) => (
        <text key={p.day} x={p.x} y={H - 4} className="admin-chart__xlabel" textAnchor="middle">{p.day}</text>
      ))}
    </svg>
  );
}

/* ─── stat card ────────────────────────────────────────── */

function StatCard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: string }) {
  return (
    <div className="admin-stat">
      <span className="admin-stat__label">{label}</span>
      <span className="admin-stat__value" style={accent ? { color: accent } : undefined}>{value}</span>
      {sub && <span className="admin-stat__sub">{sub}</span>}
    </div>
  );
}

/* ─── user form dialog ─────────────────────────────────── */

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
      <form className="modal__card card" onClick={(e: MouseEvent) => e.stopPropagation()} onSubmit={submit} noValidate>
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
              onChange={(e: ChangeEvent<HTMLSelectElement>) => setD({ ...d, role: e.target.value as UserRole })}
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
          <button type="button" className="btn btn--secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn--primary" disabled={busy} data-testid="save-user">
            {busy ? 'Saving…' : isNew ? 'Create user' : 'Save changes'}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ─── user row with "..." menu ─────────────────────────── */

function UserRow({ u, isSelf, onEdit, onDelete }: { u: AuthUser; isSelf: boolean; onEdit: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('click', close, true);
    return () => document.removeEventListener('click', close, true);
  }, [open]);

  return (
    <div className="admin-dir__row">
      <Avatar id={u.id} name={u.name || u.email || '?'} size={38} />
      <div className="admin-dir__info">
        <strong>{u.name || '—'}</strong>
        <span>{u.email || 'No email'}</span>
      </div>
      <span className={`pill pill--${u.role === 'admin' ? 'admin' : 'user'}`}>{u.role === 'admin' ? 'Admin' : 'User'}</span>
      <div className="admin-dir__menu" ref={ref}>
        <button className="icon-btn admin-dir__dots" onClick={() => setOpen(!open)} aria-label="Actions" title="Actions">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" /></svg>
        </button>
        {open && (
          <div className="admin-dir__dropdown">
            <button onClick={() => { setOpen(false); onEdit(); }}><PencilIcon width={14} height={14} /> Edit</button>
            <button className="admin-dir__danger" onClick={() => { setOpen(false); onDelete(); }} disabled={isSelf}>
              <TrashIcon width={14} height={14} /> Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── main dashboard ───────────────────────────────────── */

export function AdminView() {
  const { api, user } = useAuth();
  const [users, setUsers] = useState<AuthUser[] | null>(null);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [editing, setEditing] = useState<AuthUser | null>(null);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [usersRes, statsRes] = await Promise.all([api.adminListUsers(), api.adminStats()]);
      setUsers(usersRes.users);
      setTotal(usersRes.total);
      setStats(statsRes);
    } catch (ex) {
      setError(ex instanceof ApiError ? ex.message : 'Could not load dashboard data.');
      setUsers([]);
    }
  }, [api]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 30000);
    return () => clearInterval(t);
  }, [load]);

  const openNew = () => { setEditing(null); setShowForm(true); };
  const openEdit = (u: AuthUser) => { setEditing(u); setShowForm(true); };
  const onSaved = (_u: AuthUser, verb: string) => {
    setShowForm(false);
    setFlash(`${_u.name || _u.email} ${verb}.`);
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

  // Build a simple activity log from user data
  const recentActivity: { icon: string; text: string; time: string }[] = [];
  if (stats) {
    for (const room of stats.activeRooms) {
      for (const p of room.participants) {
        recentActivity.push({ icon: 'call', text: `${p.name} joined ${room.roomId}`, time: 'Live' });
      }
    }
  }
  if (users) {
    const sorted = [...users].sort((a, b) => {
      const ta = a.lastLoginAt ? new Date(a.lastLoginAt).getTime() : 0;
      const tb = b.lastLoginAt ? new Date(b.lastLoginAt).getTime() : 0;
      return tb - ta;
    });
    for (const u of sorted.slice(0, 6)) {
      if (u.lastLoginAt) recentActivity.push({ icon: 'login', text: `${u.name || u.email} signed in`, time: ago(u.lastLoginAt) });
    }
    const newUsers = [...users].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    for (const u of newUsers.slice(0, 3)) {
      recentActivity.push({ icon: 'signup', text: `${u.name || u.email} registered`, time: ago(u.createdAt) });
    }
  }

  const loading = users === null;

  return (
    <section className="page admin-dash" aria-label="Admin dashboard" data-testid="admin">
      {/* ─ header ─ */}
      <header className="admin-dash__head">
        <span className="card__icon card__icon--face"><ShieldIcon width={22} height={22} /></span>
        <div className="admin-dash__headtext">
          <h1>Admin Dashboard</h1>
          <span className="admin-dash__badge">{loading ? '…' : total} Registered Accounts</span>
        </div>
        <button className="btn btn--primary btn--small" onClick={openNew} data-testid="add-user">
          <PlusIcon width={16} height={16} /> New User
        </button>
      </header>

      {flash && <p className="form-msg form-msg--ok" role="status">{flash}</p>}
      {error && <p className="form-msg" role="alert">{error}</p>}

      {/* ─ stats row ─ */}
      <div className="admin-dash__stats">
        <StatCard label="Total Users:" value={loading ? '…' : total} />
        <StatCard label="Active Calls:" value={stats?.activeCalls.rooms ?? 0} sub={stats ? `${stats.activeCalls.participants} participant${stats.activeCalls.participants !== 1 ? 's' : ''}` : undefined} />
        <StatCard label="System Status:" value="Online" accent="var(--green, #22c55e)" />
        <StatCard label="Uptime:" value={stats ? fmtUptime(stats.uptimeSec) : '…'} sub={stats ? `${stats.recentLogins} logins this week` : undefined} />
      </div>

      {/* ─ main grid ─ */}
      <div className="admin-dash__grid">
        {/* left: user directory */}
        <div className="card admin-dash__dir">
          <header className="card__head">
            <h2><PeopleIcon width={18} height={18} /> User Directory</h2>
          </header>
          {loading ? (
            <div className="skeleton-list" aria-hidden="true"><i /></div>
          ) : users!.length === 0 ? (
            <p className="card__empty">No accounts yet.</p>
          ) : (
            <div className="admin-dir__list" data-testid="user-table">
              {users!.map((u) => (
                <UserRow
                  key={u.id}
                  u={u}
                  isSelf={u.id === user?.id}
                  onEdit={() => openEdit(u)}
                  onDelete={() => void remove(u)}
                />
              ))}
            </div>
          )}
        </div>

        {/* right column */}
        <div className="admin-dash__right">
          {/* daily activity chart */}
          <div className="card admin-dash__chart">
            <header className="card__head"><h2>Daily Activity</h2></header>
            {stats ? <MiniChart data={stats.dailyActivity} /> : <div className="skeleton-list" aria-hidden="true"><i /></div>}
          </div>

          {/* active calls */}
          <div className="card admin-dash__calls">
            <header className="card__head"><h2><VideoIcon width={18} height={18} /> Active Rooms</h2></header>
            {stats && stats.activeRooms.length > 0 ? (
              <ul className="admin-activity">
                {stats.activeRooms.map((r: ActiveRoom) => (
                  <li key={r.roomId}>
                    <span className="admin-activity__icon admin-activity__icon--call"><VideoIcon width={14} height={14} /></span>
                    <span className="admin-activity__text">
                      <strong>{r.roomId}</strong> — {r.participants.length} participant{r.participants.length !== 1 ? 's' : ''}
                      <em>{r.participants.map((p) => p.name).join(', ')}</em>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="card__empty">No active calls right now.</p>
            )}
          </div>
        </div>
      </div>

      {/* ─ bottom row ─ */}
      <div className="admin-dash__bottom">
        {/* activity log */}
        <div className="card admin-dash__log">
          <header className="card__head"><h2>Activity Log</h2></header>
          {recentActivity.length > 0 ? (
            <ul className="admin-activity">
              {recentActivity.slice(0, 10).map((a, i) => (
                <li key={i}>
                  <span className={`admin-activity__icon admin-activity__icon--${a.icon}`}>
                    {a.icon === 'call' ? <VideoIcon width={14} height={14} /> : <UserIcon width={14} height={14} />}
                  </span>
                  <span className="admin-activity__text">{a.text}</span>
                  <time>{a.time}</time>
                </li>
              ))}
            </ul>
          ) : (
            <p className="card__empty">No recent activity.</p>
          )}
        </div>

        {/* quick resources */}
        <div className="card admin-dash__resources">
          <header className="card__head"><h2>Quick Resources</h2></header>
          <div className="admin-resources__grid">
            <a className="admin-resources__item" href="/people" onClick={(e: MouseEvent) => { e.preventDefault(); }}>
              <PeopleIcon width={22} height={22} />
              <span>Browse Users</span>
            </a>
            <a className="admin-resources__item" href="/network" onClick={(e: MouseEvent) => { e.preventDefault(); }}>
              <UserIcon width={22} height={22} />
              <span>Connections</span>
            </a>
            <a className="admin-resources__item" href="/meet" onClick={(e: MouseEvent) => { e.preventDefault(); }}>
              <VideoIcon width={22} height={22} />
              <span>Active Call Monitor</span>
            </a>
            <a className="admin-resources__item" href="/" onClick={(e: MouseEvent) => { e.preventDefault(); }}>
              <ShieldIcon width={22} height={22} />
              <span>Server Health</span>
            </a>
          </div>
        </div>
      </div>

      {showForm && <UserForm editing={editing} selfId={user?.id ?? ''} onClose={() => setShowForm(false)} onSaved={onSaved} />}
    </section>
  );
}
