// Standalone Admin Control Center — a full-screen app (its own shell, separate
// from the member chrome) for super-admins. Dashboard of real platform metrics
// plus Users / Connections / Posts / Comments / Jobs / Applications / Logs,
// every management table with checkbox selection and CRUD / bulk actions.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ROLE_LABEL, normalizeRole,
  type AdminApplication, type AdminComment, type AdminConnection, type AdminPost,
  type AdminStats, type AdminUser, type AuditEvent, type AuditCategory, type Job, type UserRole,
} from '@vca/shared';
import { useAuth } from '../../auth/AuthContext';
import '../../admin.css';
import { AreaChart, BarChart, Donut, Funnel } from './charts';

/* ---------- helpers ---------- */
const AV = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#6250d6', '#008300', '#e34948'];
const avColor = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return AV[h % AV.length]; };
const initials = (n: string) => (n || '?').split(' ').map((x) => x[0]).slice(0, 2).join('').toUpperCase();
const fmt = (n: number) => n.toLocaleString('en-US');
const fmtDate = (s?: string | null) => (s ? new Date(s).toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
function ago(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
function fmtTs(ts: number): string {
  const d = new Date(ts);
  return `${d.toLocaleDateString('en', { day: 'numeric', month: 'short' })} · ${d.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', hour12: false })}`;
}
function downloadCsv(name: string, rows: (string | number)[][]) {
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}
function downloadJson(name: string, obj: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

/* ---------- selection hook ---------- */
function useSelection(items: { id: string }[]) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  useEffect(() => { setSel(new Set()); }, [items]);
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allOn = items.length > 0 && items.every((i) => sel.has(i.id));
  const toggleAll = () => setSel(allOn ? new Set() : new Set(items.map((i) => i.id)));
  const clear = () => setSel(new Set());
  return { sel, toggle, toggleAll, allOn, clear };
}

/* ---------- data-loading hook ---------- */
function usePage<T>(loader: () => Promise<T>, deps: unknown[] = []): { data: T | null; loading: boolean; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  useEffect(() => {
    let live = true;
    setLoading(true);
    loaderRef.current().then((d) => { if (live) { setData(d); setLoading(false); } }).catch(() => { if (live) setLoading(false); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, ...deps]);
  return { data, loading, reload: () => setTick((t) => t + 1) };
}

/* ---------- small UI bits ---------- */
function Ic({ d, size = 18 }: { d: string; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;
}
const ICON = {
  dash: 'M4 4h6v8H4zM14 4h6v5h-6zM14 13h6v7h-6zM4 16h6v4H4z',
  users: 'M9 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3.5 20a5.5 5.5 0 0 1 11 0M16 6.5a3 3 0 0 1 0 6M18 20a4.8 4.8 0 0 0-3-4.4',
  conn: 'M6 8l12 8M6 6a2 2 0 1 0 .1 0M18 18a2 2 0 1 0 .1 0M18 6a2 2 0 1 0 .1 0',
  posts: 'M4 4h16v12H9l-4 3zM7 9h10M7 13h7',
  comments: 'M21 15a3 3 0 0 1-3 3H8l-4 3V6a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3z',
  jobs: 'M3 7h18v13H3zM8 7V5h8v2',
  apps: 'M8 3H6a2 2 0 0 0-2 2v14l4-3h10a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2M9 12l2 2 4-4',
  logs: 'M4 5h16M4 10h16M4 15h10M4 20h7',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4-4',
  trash: 'M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13',
  download: 'M12 3v12M8 11l4 4 4-4M5 21h14',
  back: 'M15 18l-6-6 6-6',
  menu: 'M4 6h16M4 12h16M4 18h16',
  dot3: 'M5 12h.01M12 12h.01M19 12h.01',
};

function roleCls(role?: UserRole | string): string {
  const r = normalizeRole(role || 'member');
  return r === 'super_admin' ? 'admin' : r === 'recruiter' ? 'recruiter' : 'member';
}

/* ================= DASHBOARD ================= */
function DashboardPage() {
  const { api } = useAuth();
  const { data: stats } = usePage<AdminStats>(() => api.adminStats());
  const { data: audit } = usePage(() => api.adminAudit({ limit: 6 }));
  const { data: counts } = usePage(async () => {
    const [p, c, cn] = await Promise.all([
      api.adminListPosts({ limit: 1 }), api.adminListComments({ limit: 1 }), api.adminListConnections({ limit: 1 }),
    ]);
    return { posts: p.total, comments: c.total, connections: cn.total };
  });
  if (!stats) return <div className="aa-skeleton" />;

  const kpis: { label: string; val: number; icon: string; c: string }[] = [
    { label: 'Total users', val: stats.totalUsers, icon: ICON.users, c: '--aa-s1' },
    { label: 'Recruiters & admins', val: (stats.byRole.recruiter || 0) + (stats.byRole.super_admin || 0), icon: ICON.users, c: '--aa-s7' },
    { label: 'Connections', val: counts?.connections ?? 0, icon: ICON.conn, c: '--aa-s3' },
    { label: 'Posts', val: counts?.posts ?? 0, icon: ICON.posts, c: '--aa-s2' },
    { label: 'Comments', val: counts?.comments ?? 0, icon: ICON.comments, c: '--aa-s5' },
    { label: 'Live jobs', val: stats.jobsActive, icon: ICON.jobs, c: '--aa-s4' },
    { label: 'Applications', val: stats.applicationsTotal, icon: ICON.apps, c: '--aa-s6' },
    { label: 'New signups (7d)', val: stats.recentSignups, icon: ICON.users, c: '--aa-accent' },
  ];
  const catColors: Record<string, string> = { tech: 'var(--aa-s1)', 'non-tech': 'var(--aa-s2)' };

  return (
    <>
      <div className="aa-kpis">
        {kpis.map((k) => (
          <div className="aa-kpi" key={k.label}>
            <div className="aa-kpi__top">
              <span className="aa-kpi__ic" style={{ background: `color-mix(in srgb, var(${k.c}) 14%, transparent)`, color: `var(${k.c})` }}><Ic d={k.icon} size={18} /></span>
            </div>
            <div><div className="aa-kpi__val aa-tnum">{fmt(k.val)}</div><div className="aa-kpi__label">{k.label}</div></div>
          </div>
        ))}
      </div>

      <div className="aa-grid-3">
        <div className="aa-card">
          <div className="aa-card__head"><h3>User growth</h3><span className="aa-sub">cumulative · last 12 months</span></div>
          <div className="aa-chart-body"><AreaChart data={stats.userGrowth.map((m) => m.total)} labels={stats.userGrowth.map((m) => m.label)} /></div>
        </div>
        <div className="aa-card">
          <div className="aa-card__head"><h3>Jobs by domain</h3><span className="aa-sub">{stats.jobsTotal} total</span></div>
          <Donut segments={[
            { name: 'Tech', value: stats.jobsByCategory.tech, color: catColors.tech },
            { name: 'Non-tech', value: stats.jobsByCategory['non-tech'], color: catColors['non-tech'] },
          ]} />
        </div>
      </div>

      <div className="aa-grid-2">
        <div className="aa-card">
          <div className="aa-card__head"><h3>Daily activity</h3><span className="aa-sub">logins · last 7 days</span></div>
          <div className="aa-chart-body"><BarChart data={stats.dailyActivity.map((d) => d.count)} labels={stats.dailyActivity.map((d) => d.day)} color="var(--aa-s3)" /></div>
        </div>
        <div className="aa-card">
          <div className="aa-card__head"><h3>Applications funnel</h3><span className="aa-sub">by status</span></div>
          <Funnel stages={[
            { name: 'Applied', value: stats.applicationsByStatus.applied, color: 'var(--aa-s1)' },
            { name: 'Shortlisted', value: stats.applicationsByStatus.shortlisted, color: 'var(--aa-s7)' },
            { name: 'Not selected', value: stats.applicationsByStatus.rejected, color: 'var(--aa-crit)' },
          ]} />
        </div>
      </div>

      <div className="aa-card">
        <div className="aa-card__head"><h3>Recent activity</h3></div>
        <div className="aa-feed">
          {!audit ? <div className="aa-empty">Loading…</div> : audit.events.length === 0 ? <div className="aa-empty">No activity recorded yet.</div> :
            audit.events.map((e) => (
              <div className="aa-feeditem" key={e.id}>
                <span className="aa-feed-dot" style={{ background: 'var(--aa-accent-soft)', color: 'var(--aa-accent)' }}><Ic d={ICON.logs} size={16} /></span>
                <div className="aa-feed-main"><p><b>{e.actorName}</b> {e.action}{e.target ? <> — <b>{e.target}</b></> : ''}</p><span className="aa-t">{ago(e.ts)}</span></div>
              </div>
            ))}
        </div>
      </div>
    </>
  );
}

/* ================= shared table pieces ================= */
function BulkBar({ n, children, onClear }: { n: number; children: ReactNode; onClear: () => void }) {
  if (n === 0) return null;
  return (
    <div className="aa-bulkbar">
      <span>{n} selected</span>
      <span className="aa-spacer" />
      {children}
      <button className="aa-btn aa-btn--sm" onClick={onClear}>Clear</button>
    </div>
  );
}
function HeadCheck({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return <th className="aa-cellcheck"><input type="checkbox" className="aa-check" checked={on} onChange={onToggle} aria-label="Select all" /></th>;
}

/* ================= USERS ================= */
function UsersPage() {
  const { api, user } = useAuth();
  const { data, loading, reload } = usePage(() => api.adminListUsers({ limit: 50 }));
  const users = data?.users ?? [];
  const { sel, toggle, toggleAll, allOn, clear } = useSelection(users);
  const [busy, setBusy] = useState(false);

  const del = async (ids: string[]) => {
    if (!ids.length || busy) return;
    if (!window.confirm(`Delete ${ids.length} user${ids.length > 1 ? 's' : ''}? This also removes their posts, connections and messages.`)) return;
    setBusy(true);
    try { await api.adminBulkDeleteUsers(ids); clear(); reload(); } finally { setBusy(false); }
  };

  return (
    <div className="aa-card">
      <BulkBar n={sel.size} onClear={clear}>
        <button className="aa-btn aa-btn--sm aa-btn--danger" disabled={busy} onClick={() => del([...sel])}><Ic d={ICON.trash} size={14} /> Delete</button>
      </BulkBar>
      <div className="aa-table-wrap">
        <table>
          <thead><tr>
            <HeadCheck on={allOn} onToggle={toggleAll} />
            <th>User</th><th>Role</th><th>Joined</th><th>Last active</th><th></th>
          </tr></thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="aa-empty">Loading…</td></tr>}
            {!loading && users.length === 0 && <tr><td colSpan={6} className="aa-empty">No users.</td></tr>}
            {(users as AdminUser[]).map((u) => (
              <tr key={u.id} className={sel.has(u.id) ? 'is-sel' : ''}>
                <td><input type="checkbox" className="aa-check" checked={sel.has(u.id)} onChange={() => toggle(u.id)} aria-label={`Select ${u.name}`} /></td>
                <td><div className="aa-u"><span className="aa-u__av" style={{ background: avColor(u.name) }}>{initials(u.name)}</span><div><div className="aa-u__name">{u.name}</div><div className="aa-u__mail">{u.email}</div></div></div></td>
                <td><span className={`aa-pill aa-pill--${roleCls(u.role)}`}>{ROLE_LABEL[normalizeRole(u.role || 'member')]}</span></td>
                <td>{fmtDate(u.createdAt)}</td>
                <td style={{ color: 'var(--aa-muted)' }}>{u.lastLoginAt ? ago(new Date(u.lastLoginAt).getTime()) : '—'}</td>
                <td><div className="aa-rowact">
                  <button className="aa-iconbtn aa-iconbtn--danger" title="Delete user" disabled={u.id === user?.id} onClick={() => del([u.id])}><Ic d={ICON.trash} size={15} /></button>
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="aa-tfoot"><span>{data?.total ?? users.length} users total</span></div>
    </div>
  );
}

/* ================= CONNECTIONS ================= */
function ConnectionsPage() {
  const { api } = useAuth();
  const { data, loading } = usePage(() => api.adminListConnections({ limit: 100 }));
  const conns = (data?.connections ?? []).map((c) => ({ ...c, id: c.pair }));
  const { sel, toggle, toggleAll, allOn, clear } = useSelection(conns);
  const exportSel = () => {
    const rows: (string | number)[][] = [['From', 'To', 'Status', 'Requested', 'Responded']];
    for (const c of conns) if (sel.has(c.pair)) rows.push([c.from.name, c.to.name, c.status, c.createdAt, c.updatedAt]);
    downloadCsv('huddle-connections.csv', rows);
  };
  return (
    <div className="aa-card">
      <BulkBar n={sel.size} onClear={clear}>
        <button className="aa-btn aa-btn--sm" onClick={exportSel}><Ic d={ICON.download} size={14} /> Export CSV</button>
      </BulkBar>
      <div className="aa-table-wrap">
        <table>
          <thead><tr><HeadCheck on={allOn} onToggle={toggleAll} /><th>From</th><th>To</th><th>Status</th><th>Requested</th><th>Responded</th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="aa-empty">Loading…</td></tr>}
            {!loading && conns.length === 0 && <tr><td colSpan={6} className="aa-empty">No connections.</td></tr>}
            {(conns as (AdminConnection & { id: string })[]).map((c) => (
              <tr key={c.pair} className={sel.has(c.pair) ? 'is-sel' : ''}>
                <td><input type="checkbox" className="aa-check" checked={sel.has(c.pair)} onChange={() => toggle(c.pair)} aria-label="Select connection" /></td>
                <td><div className="aa-u"><span className="aa-u__av" style={{ background: avColor(c.from.name) }}>{initials(c.from.name)}</span><span className="aa-u__name">{c.from.name}</span></div></td>
                <td><div className="aa-u"><span className="aa-u__av" style={{ background: avColor(c.to.name) }}>{initials(c.to.name)}</span><span className="aa-u__name">{c.to.name}</span></div></td>
                <td><span className={`aa-pill aa-pill--${c.status === 'accepted' ? 'good' : 'warn'}`}>{c.status === 'accepted' ? 'Accepted' : 'Pending'}</span></td>
                <td style={{ color: 'var(--aa-muted)' }}>{fmtDate(c.createdAt)}</td>
                <td style={{ color: 'var(--aa-muted)' }}>{c.status === 'accepted' ? fmtDate(c.updatedAt) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="aa-tfoot"><span>{data?.total ?? conns.length} connections total</span></div>
    </div>
  );
}

/* ================= POSTS ================= */
function PostsPage() {
  const { api } = useAuth();
  const { data, loading, reload } = usePage(() => api.adminListPosts({ limit: 50 }));
  const posts = data?.posts ?? [];
  const { sel, toggle, toggleAll, allOn, clear } = useSelection(posts);
  const [busy, setBusy] = useState(false);
  const del = async (ids: string[]) => {
    if (!ids.length || busy || !window.confirm(`Delete ${ids.length} post${ids.length > 1 ? 's' : ''}?`)) return;
    setBusy(true);
    try { await api.adminBulkDeletePosts(ids); clear(); reload(); } finally { setBusy(false); }
  };
  return (
    <div className="aa-card">
      <BulkBar n={sel.size} onClear={clear}>
        <button className="aa-btn aa-btn--sm aa-btn--danger" disabled={busy} onClick={() => del([...sel])}><Ic d={ICON.trash} size={14} /> Delete</button>
      </BulkBar>
      <div className="aa-table-wrap">
        <table>
          <thead><tr><HeadCheck on={allOn} onToggle={toggleAll} /><th>Author</th><th>Content</th><th>Likes</th><th>Comments</th><th>Posted</th><th></th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="aa-empty">Loading…</td></tr>}
            {!loading && posts.length === 0 && <tr><td colSpan={7} className="aa-empty">No posts.</td></tr>}
            {(posts as AdminPost[]).map((p) => (
              <tr key={p.id} className={sel.has(p.id) ? 'is-sel' : ''}>
                <td><input type="checkbox" className="aa-check" checked={sel.has(p.id)} onChange={() => toggle(p.id)} aria-label="Select post" /></td>
                <td><div className="aa-u"><span className="aa-u__av" style={{ background: avColor(p.authorName) }}>{initials(p.authorName)}</span><span className="aa-u__name">{p.authorName}</span></div></td>
                <td><div className="aa-trunc">{p.text || <em style={{ color: 'var(--aa-muted)' }}>photo</em>}</div></td>
                <td className="aa-tnum">{p.likeCount}</td>
                <td className="aa-tnum">{p.commentCount}</td>
                <td style={{ color: 'var(--aa-muted)' }}>{fmtDate(p.createdAt)}</td>
                <td><div className="aa-rowact"><button className="aa-iconbtn aa-iconbtn--danger" title="Delete post" onClick={() => del([p.id])}><Ic d={ICON.trash} size={15} /></button></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="aa-tfoot"><span>{data?.total ?? posts.length} posts total</span></div>
    </div>
  );
}

/* ================= COMMENTS ================= */
function CommentsPage() {
  const { api } = useAuth();
  const { data, loading, reload } = usePage(() => api.adminListComments({ limit: 80 }));
  const comments = data?.comments ?? [];
  const { sel, toggle, toggleAll, allOn, clear } = useSelection(comments);
  const [busy, setBusy] = useState(false);
  const del = async (ids: string[]) => {
    if (!ids.length || busy || !window.confirm(`Delete ${ids.length} comment${ids.length > 1 ? 's' : ''}?`)) return;
    setBusy(true);
    try {
      for (const id of ids) { const c = comments.find((x) => x.id === id); if (c) await api.adminDeleteComment(c.postId, c.id); }
      clear(); reload();
    } finally { setBusy(false); }
  };
  return (
    <div className="aa-card">
      <BulkBar n={sel.size} onClear={clear}>
        <button className="aa-btn aa-btn--sm aa-btn--danger" disabled={busy} onClick={() => del([...sel])}><Ic d={ICON.trash} size={14} /> Delete</button>
      </BulkBar>
      <div className="aa-table-wrap">
        <table>
          <thead><tr><HeadCheck on={allOn} onToggle={toggleAll} /><th>Author</th><th>Comment</th><th>On post</th><th>When</th><th></th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="aa-empty">Loading…</td></tr>}
            {!loading && comments.length === 0 && <tr><td colSpan={6} className="aa-empty">No comments.</td></tr>}
            {(comments as AdminComment[]).map((c) => (
              <tr key={c.id} className={sel.has(c.id) ? 'is-sel' : ''}>
                <td><input type="checkbox" className="aa-check" checked={sel.has(c.id)} onChange={() => toggle(c.id)} aria-label="Select comment" /></td>
                <td><div className="aa-u"><span className="aa-u__av" style={{ background: avColor(c.name) }}>{initials(c.name)}</span><span className="aa-u__name">{c.name}</span></div></td>
                <td><div className="aa-trunc" style={{ maxWidth: 240 }}>{c.text}</div></td>
                <td style={{ color: 'var(--aa-text-2)' }}><div className="aa-trunc" style={{ maxWidth: 200 }}>{c.postAuthor}: {c.postExcerpt}</div></td>
                <td style={{ color: 'var(--aa-muted)' }}>{c.ts ? ago(c.ts) : '—'}</td>
                <td><div className="aa-rowact"><button className="aa-iconbtn aa-iconbtn--danger" title="Delete comment" onClick={() => del([c.id])}><Ic d={ICON.trash} size={15} /></button></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="aa-tfoot"><span>{data?.total ?? comments.length} comments total</span></div>
    </div>
  );
}

/* ================= JOBS ================= */
function JobsPage() {
  const { api } = useAuth();
  const { data, loading, reload } = usePage(() => api.adminListJobs());
  const jobs = data?.jobs ?? [];
  const { sel, toggle, toggleAll, allOn, clear } = useSelection(jobs);
  const [busy, setBusy] = useState(false);
  const del = async (ids: string[]) => {
    if (!ids.length || busy || !window.confirm(`Delete ${ids.length} job${ids.length > 1 ? 's' : ''}?`)) return;
    setBusy(true);
    try { await api.adminBulkDeleteJobs(ids); clear(); reload(); } finally { setBusy(false); }
  };
  const catPill = (c: string) => (c === 'non-tech' ? 'muted' : c === 'tech' ? 'recruiter' : 'muted');
  return (
    <div className="aa-card">
      <BulkBar n={sel.size} onClear={clear}>
        <button className="aa-btn aa-btn--sm aa-btn--danger" disabled={busy} onClick={() => del([...sel])}><Ic d={ICON.trash} size={14} /> Delete</button>
      </BulkBar>
      <div className="aa-table-wrap">
        <table>
          <thead><tr><HeadCheck on={allOn} onToggle={toggleAll} /><th>Role</th><th>Category</th><th>Type</th><th>Recruiter</th><th>Applicants</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan={8} className="aa-empty">Loading…</td></tr>}
            {!loading && jobs.length === 0 && <tr><td colSpan={8} className="aa-empty">No jobs.</td></tr>}
            {(jobs as Job[]).map((j) => (
              <tr key={j.id} className={sel.has(j.id) ? 'is-sel' : ''}>
                <td><input type="checkbox" className="aa-check" checked={sel.has(j.id)} onChange={() => toggle(j.id)} aria-label="Select job" /></td>
                <td><div className="aa-u__name">{j.title}</div><div className="aa-u__mail">{j.company}</div></td>
                <td><span className={`aa-pill aa-pill--${catPill(j.category)}`}>{j.category === 'non-tech' ? 'Non-tech' : 'Tech'}</span></td>
                <td style={{ color: 'var(--aa-text-2)' }}>{j.type}</td>
                <td>{j.postedByName || '—'}</td>
                <td className="aa-tnum"><b>{j.applicantCount ?? 0}</b></td>
                <td><span className={`aa-pill aa-pill--${j.active === false ? 'muted' : 'good'}`}><span className="aa-pdot" />{j.active === false ? 'Closed' : 'Live'}</span></td>
                <td><div className="aa-rowact"><button className="aa-iconbtn aa-iconbtn--danger" title="Delete job" onClick={() => del([j.id])}><Ic d={ICON.trash} size={15} /></button></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="aa-tfoot"><span>{jobs.length} jobs</span></div>
    </div>
  );
}

/* ================= APPLICATIONS ================= */
function ApplicationsPage() {
  const { api } = useAuth();
  const { data, loading } = usePage(() => api.adminListApplications({ limit: 80 }));
  const apps = data?.applications ?? [];
  const { sel, toggle, toggleAll, allOn, clear } = useSelection(apps);
  const exportSel = () => {
    const rows: (string | number)[][] = [['Candidate', 'Role', 'Company', 'Status', 'Applied']];
    for (const a of apps) if (sel.has(a.id)) rows.push([a.userName, a.jobTitle, a.company, a.status, a.createdAt ?? '']);
    downloadCsv('huddle-applications.csv', rows);
  };
  const statusPill = (s: string) => (s === 'shortlisted' ? 'recruiter' : s === 'rejected' ? 'crit' : 'muted');
  const statusLabel = (s: string) => (s === 'shortlisted' ? 'Shortlisted' : s === 'rejected' ? 'Not selected' : 'Applied');
  return (
    <div className="aa-card">
      <BulkBar n={sel.size} onClear={clear}>
        <button className="aa-btn aa-btn--sm" onClick={exportSel}><Ic d={ICON.download} size={14} /> Export CSV</button>
      </BulkBar>
      <div className="aa-table-wrap">
        <table>
          <thead><tr><HeadCheck on={allOn} onToggle={toggleAll} /><th>Candidate</th><th>Role</th><th>Company</th><th>Status</th><th>Applied</th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="aa-empty">Loading…</td></tr>}
            {!loading && apps.length === 0 && <tr><td colSpan={6} className="aa-empty">No applications.</td></tr>}
            {(apps as AdminApplication[]).map((a) => (
              <tr key={a.id} className={sel.has(a.id) ? 'is-sel' : ''}>
                <td><input type="checkbox" className="aa-check" checked={sel.has(a.id)} onChange={() => toggle(a.id)} aria-label="Select application" /></td>
                <td><div className="aa-u"><span className="aa-u__av" style={{ background: avColor(a.userName) }}>{initials(a.userName)}</span><span className="aa-u__name">{a.userName}</span></div></td>
                <td>{a.jobTitle}</td>
                <td style={{ color: 'var(--aa-text-2)' }}>{a.company}</td>
                <td><span className={`aa-pill aa-pill--${statusPill(a.status)}`}>{statusLabel(a.status)}</span></td>
                <td style={{ color: 'var(--aa-muted)' }}>{fmtDate(a.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="aa-tfoot"><span>{data?.total ?? apps.length} applications total</span></div>
    </div>
  );
}

/* ================= LOGS ================= */
const LOG_CATS: { id: AuditCategory | 'all'; label: string }[] = [
  { id: 'all', label: 'All' }, { id: 'auth', label: 'Auth' }, { id: 'content', label: 'Content' }, { id: 'jobs', label: 'Jobs' }, { id: 'admin', label: 'Admin' }, { id: 'system', label: 'System' },
];
const CAT_COLOR: Record<string, string> = { auth: '--aa-s1', content: '--aa-s3', jobs: '--aa-s4', admin: '--aa-s7', system: '--aa-s6' };
function LogsPage() {
  const { api } = useAuth();
  const [cat, setCat] = useState<AuditCategory | 'all'>('all');
  const { data, loading } = usePage(() => api.adminAudit({ limit: 100, category: cat === 'all' ? undefined : cat }), [cat]);
  const events = data?.events ?? [];
  const exportLog = () => downloadCsv('huddle-audit.csv', [['Time', 'Actor', 'Action', 'Target', 'Category'], ...events.map((e) => [fmtTs(e.ts), e.actorName, e.action, e.target, e.category])]);
  return (
    <>
      <div className="aa-toolbar">
        <div className="aa-seg">{LOG_CATS.map((c) => <button key={c.id} className={cat === c.id ? 'is-on' : ''} onClick={() => setCat(c.id)}>{c.label}</button>)}</div>
        <span className="aa-spacer" />
        <button className="aa-btn aa-btn--sm" onClick={exportLog} disabled={events.length === 0}><Ic d={ICON.download} size={14} /> Export log</button>
      </div>
      <div className="aa-card">
        <div className="aa-logstream">
          {loading && <div className="aa-empty">Loading…</div>}
          {!loading && events.length === 0 && <div className="aa-empty">No events recorded in this category yet.</div>}
          {(events as AuditEvent[]).map((e) => {
            const c = CAT_COLOR[e.category] || '--aa-s1';
            return (
              <div className="aa-logrow" key={e.id}>
                <span className="aa-log-time">{fmtTs(e.ts)}</span>
                <span className="aa-log-ic" style={{ background: `color-mix(in srgb, var(${c}) 14%, transparent)`, color: `var(${c})` }}><Ic d={ICON.logs} size={16} /></span>
                <span className="aa-log-text"><b>{e.actorName}</b> {e.action}{e.target ? <span className="aa-meta"> — {e.target}</span> : ''}{e.meta ? <span className="aa-meta"> · {e.meta}</span> : ''}</span>
                <span className="aa-log-tag" style={{ background: `color-mix(in srgb, var(${c}) 14%, transparent)`, color: `var(${c})` }}>{e.category}</span>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

/* ================= SHELL ================= */
type Section = 'dashboard' | 'users' | 'connections' | 'posts' | 'comments' | 'jobs' | 'applications' | 'logs';
const SECTIONS: { id: Section; label: string; icon: string; group: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: ICON.dash, group: 'Overview' },
  { id: 'users', label: 'Users', icon: ICON.users, group: 'People & social' },
  { id: 'connections', label: 'Connections', icon: ICON.conn, group: 'People & social' },
  { id: 'posts', label: 'Posts', icon: ICON.posts, group: 'People & social' },
  { id: 'comments', label: 'Comments', icon: ICON.comments, group: 'People & social' },
  { id: 'jobs', label: 'Jobs', icon: ICON.jobs, group: 'Jobs & hiring' },
  { id: 'applications', label: 'Applications', icon: ICON.apps, group: 'Jobs & hiring' },
  { id: 'logs', label: 'Activity Logs', icon: ICON.logs, group: 'System' },
];
const TITLES: Record<Section, [string, string]> = {
  dashboard: ['Dashboard', 'Platform activity at a glance'],
  users: ['Users', 'Every registered account'],
  connections: ['Connections', 'Requests and accepted connections'],
  posts: ['Posts', 'Home-feed posts across the network'],
  comments: ['Comments', 'Comments on posts'],
  jobs: ['Jobs', 'Every job on the board'],
  applications: ['Applications', 'Candidate applications across roles'],
  logs: ['Activity Logs', 'Full audit trail of platform events'],
};

function sectionFromPath(): Section {
  const seg = location.pathname.split('/').filter(Boolean);
  const s = seg[1] as Section;
  return SECTIONS.some((x) => x.id === s) ? s : 'dashboard';
}

export function AdminApp({ exit }: { exit: () => void }) {
  const { user } = useAuth();
  const [section, setSection] = useState<Section>(() => sectionFromPath());
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onPop = () => setSection(sectionFromPath());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const go = useCallback((s: Section) => {
    const path = s === 'dashboard' ? '/admin' : `/admin/${s}`;
    if (location.pathname !== path) history.pushState(null, '', path);
    setSection(s);
    setMenuOpen(false);
    window.scrollTo(0, 0);
  }, []);

  const Page = useMemo(() => ({
    dashboard: DashboardPage, users: UsersPage, connections: ConnectionsPage, posts: PostsPage,
    comments: CommentsPage, jobs: JobsPage, applications: ApplicationsPage, logs: LogsPage,
  }[section]), [section]);

  const grouped = useMemo(() => {
    const out: { group: string; items: typeof SECTIONS }[] = [];
    for (const s of SECTIONS) {
      let g = out.find((x) => x.group === s.group);
      if (!g) { g = { group: s.group, items: [] }; out.push(g); }
      g.items.push(s);
    }
    return out;
  }, []);

  return (
    <div className="admin-app">
      <div className="aa-shell">
        <aside className={`aa-side${menuOpen ? ' is-open' : ''}`} aria-label="Admin sections">
          <div className="aa-brand">
            <span className="aa-brand__mark"><Ic d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM12 8v8M8 12h8" size={20} /></span>
            <div><div className="aa-brand__name">Huddle Admin</div><div className="aa-brand__sub">Control Center</div></div>
          </div>
          <nav className="aa-nav">
            {grouped.map((g) => (
              <div key={g.group}>
                <div className="aa-nav__label">{g.group}</div>
                {g.items.map((s) => (
                  <button key={s.id} className={`aa-nav__item${section === s.id ? ' is-on' : ''}`} onClick={() => go(s.id)} aria-current={section === s.id ? 'true' : undefined}>
                    <Ic d={s.icon} size={18} /><span>{s.label}</span>
                  </button>
                ))}
              </div>
            ))}
          </nav>
          <button className="aa-exit" onClick={exit}><Ic d={ICON.back} size={16} /> Back to Huddle</button>
          <div className="aa-side__foot">
            <span className="aa-avatar">{initials(user?.name || 'A')}</span>
            <div className="aa-side__who"><strong>{user?.name}</strong><span>Super Admin</span></div>
          </div>
        </aside>
        <div className={`aa-scrim${menuOpen ? ' is-show' : ''}`} onClick={() => setMenuOpen(false)} />

        <div className="aa-main">
          <header className="aa-topbar">
            <button className="aa-hamburger" aria-label="Open menu" onClick={() => setMenuOpen(true)}><Ic d={ICON.menu} size={20} /></button>
            <div><div className="aa-topbar__title">{TITLES[section][0]}</div><div className="aa-topbar__sub">{TITLES[section][1]}</div></div>
            <span className="aa-spacer" />
            {section === 'dashboard' && <DashboardExport />}
          </header>
          <div className="aa-content"><Page /></div>
        </div>
      </div>
    </div>
  );
}

function DashboardExport() {
  const { api } = useAuth();
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const s = await api.adminStats();
      downloadJson(`huddle-platform-report-${new Date().toISOString().slice(0, 10)}.json`, {
        generatedAt: new Date().toISOString(), totalUsers: s.totalUsers, byRole: s.byRole,
        jobs: { total: s.jobsTotal, active: s.jobsActive, byCategory: s.jobsByCategory },
        applications: { total: s.applicationsTotal, byStatus: s.applicationsByStatus }, userGrowth: s.userGrowth,
      });
    } finally { setBusy(false); }
  };
  return <button className="aa-btn aa-btn--primary" onClick={run} disabled={busy}><Ic d={ICON.download} size={15} /> Export report</button>;
}
