// Standalone Admin Control Center — a full-screen app (its own shell, separate
// from the member chrome) for super-admins. Dashboard of real platform metrics
// plus Users / Connections / Posts / Comments / Jobs / Applications / Logs,
// every management table with checkbox selection and CRUD / bulk actions.
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  ROLE_LABEL, normalizeRole,
  type AdminApplication, type AdminComment, type AdminConnection, type AdminPost,
  type AdminStats, type AdminUser, type ApiClient, type AuditEvent, type AuditCategory,
  type Job, type JobCategory, type JobExperience, type JobInput, type JobType, type UserRole,
} from '@vca/shared';
import { useAuth } from '../../auth/AuthContext';
import '../../admin.css';
import { AreaChart, BarChart, Donut, Funnel } from './charts';
import { UserDetailDrawer } from './UserDetail';

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

function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

/* ---------- list-controls hook: search + filters + paging, resets page on change ---------- */
function useListControls(initial: Record<string, string> = {}) {
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search, 300);
  const [filters, setFiltersState] = useState<Record<string, string>>(initial);
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [debounced, filters]);
  const setFilter = (k: string, v: string) => setFiltersState((f) => ({ ...f, [k]: v }));
  return { search, setSearch, debounced, filters, setFilter, page, setPage };
}

/* ---------- toolbar + pager ---------- */
function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="aa-search">
      <Ic d={ICON.search} size={15} />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} spellCheck={false} />
      {value && <button className="aa-iconbtn" style={{ width: 24, height: 24, border: 0, background: 'none' }} onClick={() => onChange('')} aria-label="Clear search"><Ic d="M18 6 6 18M6 6l12 12" size={14} /></button>}
    </div>
  );
}
function FilterSelect({ value, onChange, options, label }: { value: string; onChange: (v: string) => void; options: [string, string][]; label: string }) {
  return (
    <label className="aa-filter" aria-label={label}>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}
function Pager({ page, limit, total, onPage }: { page: number; limit: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / limit));
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(total, page * limit);
  return (
    <div className="aa-tfoot">
      <span>{total === 0 ? 'No results' : `${from}–${to} of ${total}`}</span>
      <div className="aa-pager">
        <button disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page"><Ic d="M15 18l-6-6 6-6" size={15} /></button>
        <span className="aa-pager__n">Page {page} / {pages}</span>
        <button disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page"><Ic d="M9 18l6-6-6-6" size={15} /></button>
      </div>
    </div>
  );
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
  plus: 'M12 5v14M5 12h14',
  eye: 'M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7ZM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6',
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
  const { search, setSearch, debounced, filters, setFilter, page, setPage } = useListControls({ role: '' });
  const role = filters.role as UserRole | '';
  const { data, loading, reload } = usePage(() => api.adminListUsers({ page, limit: 25, search: debounced, role }), [page, debounced, role]);
  const users = data?.users ?? [];
  const { sel, toggle, toggleAll, allOn, clear } = useSelection(users);
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<AdminUser | null>(null);

  const del = async (ids: string[]) => {
    if (!ids.length || busy) return;
    if (!window.confirm(`Delete ${ids.length} user${ids.length > 1 ? 's' : ''}? This also removes their posts, connections and messages.`)) return;
    setBusy(true);
    try { await api.adminBulkDeleteUsers(ids); clear(); reload(); } finally { setBusy(false); }
  };

  return (
    <>
      <div className="aa-toolbar">
        <SearchBox value={search} onChange={setSearch} placeholder="Search candidates by name, email…" />
        <FilterSelect value={role} onChange={(v) => setFilter('role', v)} label="Filter by role"
          options={[['', 'All roles'], ['member', 'Members'], ['recruiter', 'Recruiters'], ['super_admin', 'Super Admins']]} />
      </div>
      <div className="aa-card">
        <BulkBar n={sel.size} onClear={clear}>
          <button className="aa-btn aa-btn--sm aa-btn--danger" disabled={busy} onClick={() => del([...sel])}><Ic d={ICON.trash} size={14} /> Delete</button>
        </BulkBar>
        <div className="aa-table-wrap">
          <table>
            <thead><tr>
              <HeadCheck on={allOn} onToggle={toggleAll} />
              <th>User</th><th>Role</th><th>Headline</th><th>Expected salary</th><th>CV</th><th>Joined</th><th>Last active</th><th></th>
            </tr></thead>
            <tbody>
              {loading && <tr><td colSpan={9} className="aa-empty">Loading…</td></tr>}
              {!loading && users.length === 0 && <tr><td colSpan={9} className="aa-empty">No users match.</td></tr>}
              {(users as AdminUser[]).map((u) => (
                <tr key={u.id} className={sel.has(u.id) ? 'is-sel' : ''} onClick={() => setDetail(u)} style={{ cursor: 'pointer' }}>
                  <td onClick={(e) => e.stopPropagation()}><input type="checkbox" className="aa-check" checked={sel.has(u.id)} onChange={() => toggle(u.id)} aria-label={`Select ${u.name}`} /></td>
                  <td><div className="aa-u"><span className="aa-u__av" style={{ background: avColor(u.name) }}>{initials(u.name)}</span><div><div className="aa-u__name">{u.name}</div><div className="aa-u__mail">{u.email}</div></div></div></td>
                  <td><span className={`aa-pill aa-pill--${roleCls(u.role)}`}>{ROLE_LABEL[normalizeRole(u.role || 'member')]}</span></td>
                  <td style={{ color: 'var(--aa-text-2)' }}><div className="aa-trunc" style={{ maxWidth: 200 }}>{u.profile?.headline || '—'}</div></td>
                  <td style={{ color: 'var(--aa-text-2)' }}>{u.profile?.expectedSalary || '—'}</td>
                  <td>{u.profile?.cvUrl ? <a href={u.profile.cvUrl} target="_blank" rel="noreferrer" className="aa-pill aa-pill--good" onClick={(e) => e.stopPropagation()}><Ic d={ICON.download} size={12} /> CV</a> : <span style={{ color: 'var(--aa-muted)' }}>—</span>}</td>
                  <td>{fmtDate(u.createdAt)}</td>
                  <td style={{ color: 'var(--aa-muted)' }}>{u.lastLoginAt ? ago(new Date(u.lastLoginAt).getTime()) : '—'}</td>
                  <td onClick={(e) => e.stopPropagation()}><div className="aa-rowact">
                    <button className="aa-iconbtn" title="View details" onClick={() => setDetail(u)}><Ic d={ICON.eye} size={15} /></button>
                    <button className="aa-iconbtn aa-iconbtn--danger" title="Delete user" disabled={u.id === user?.id} onClick={() => del([u.id])}><Ic d={ICON.trash} size={15} /></button>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager page={page} limit={data?.limit ?? 25} total={data?.total ?? users.length} onPage={setPage} />
      </div>
      {detail && <UserDetailDrawer user={detail} onClose={() => setDetail(null)} />}
    </>
  );
}

/* ================= CONNECTIONS ================= */
function ConnectionsPage() {
  const { api } = useAuth();
  const { filters, setFilter, page, setPage } = useListControls({ status: '' });
  const status = filters.status as 'pending' | 'accepted' | '';
  const { data, loading } = usePage(() => api.adminListConnections({ page, limit: 25, status }), [page, status]);
  const conns = (data?.connections ?? []).map((c) => ({ ...c, id: c.pair }));
  const { sel, toggle, toggleAll, allOn, clear } = useSelection(conns);
  const exportSel = () => {
    const rows: (string | number)[][] = [['From', 'To', 'Status', 'Requested', 'Responded']];
    for (const c of conns) if (sel.has(c.pair)) rows.push([c.from.name, c.to.name, c.status, c.createdAt, c.updatedAt]);
    downloadCsv('huddle-connections.csv', rows);
  };
  return (
    <>
      <div className="aa-toolbar">
        <FilterSelect value={status} onChange={(v) => setFilter('status', v)} label="Filter by status"
          options={[['', 'All connections'], ['accepted', 'Accepted'], ['pending', 'Pending']]} />
      </div>
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
        <Pager page={page} limit={data?.limit ?? 25} total={data?.total ?? conns.length} onPage={setPage} />
      </div>
    </>
  );
}

/* ================= POSTS ================= */
function PostsPage() {
  const { api } = useAuth();
  const { search, setSearch, debounced, page, setPage } = useListControls();
  const { data, loading, reload } = usePage(() => api.adminListPosts({ page, limit: 25, search: debounced }), [page, debounced]);
  const posts = data?.posts ?? [];
  const { sel, toggle, toggleAll, allOn, clear } = useSelection(posts);
  const [busy, setBusy] = useState(false);
  const del = async (ids: string[]) => {
    if (!ids.length || busy || !window.confirm(`Delete ${ids.length} post${ids.length > 1 ? 's' : ''}?`)) return;
    setBusy(true);
    try { await api.adminBulkDeletePosts(ids); clear(); reload(); } finally { setBusy(false); }
  };
  return (
    <>
      <div className="aa-toolbar"><SearchBox value={search} onChange={setSearch} placeholder="Search posts by author or text…" /></div>
      <div className="aa-card">
        <BulkBar n={sel.size} onClear={clear}>
          <button className="aa-btn aa-btn--sm aa-btn--danger" disabled={busy} onClick={() => del([...sel])}><Ic d={ICON.trash} size={14} /> Delete</button>
        </BulkBar>
        <div className="aa-table-wrap">
          <table>
            <thead><tr><HeadCheck on={allOn} onToggle={toggleAll} /><th>Author</th><th>Content</th><th>Likes</th><th>Comments</th><th>Posted</th><th></th></tr></thead>
            <tbody>
              {loading && <tr><td colSpan={7} className="aa-empty">Loading…</td></tr>}
              {!loading && posts.length === 0 && <tr><td colSpan={7} className="aa-empty">No posts match.</td></tr>}
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
        <Pager page={page} limit={data?.limit ?? 25} total={data?.total ?? posts.length} onPage={setPage} />
      </div>
    </>
  );
}

/* ================= COMMENTS ================= */
function CommentsPage() {
  const { api } = useAuth();
  const { search, setSearch, debounced, page, setPage } = useListControls();
  const { data, loading, reload } = usePage(() => api.adminListComments({ page, limit: 25, search: debounced }), [page, debounced]);
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
    <>
      <div className="aa-toolbar"><SearchBox value={search} onChange={setSearch} placeholder="Search comments by author or text…" /></div>
      <div className="aa-card">
        <BulkBar n={sel.size} onClear={clear}>
          <button className="aa-btn aa-btn--sm aa-btn--danger" disabled={busy} onClick={() => del([...sel])}><Ic d={ICON.trash} size={14} /> Delete</button>
        </BulkBar>
        <div className="aa-table-wrap">
          <table>
            <thead><tr><HeadCheck on={allOn} onToggle={toggleAll} /><th>Author</th><th>Comment</th><th>On post</th><th>When</th><th></th></tr></thead>
            <tbody>
              {loading && <tr><td colSpan={6} className="aa-empty">Loading…</td></tr>}
              {!loading && comments.length === 0 && <tr><td colSpan={6} className="aa-empty">No comments match.</td></tr>}
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
        <Pager page={page} limit={data?.limit ?? 25} total={data?.total ?? comments.length} onPage={setPage} />
      </div>
    </>
  );
}

/* ================= JOBS ================= */
function JobsPage() {
  const { api } = useAuth();
  const { search, setSearch, debounced, filters, setFilter, page, setPage } = useListControls({ status: '', category: '' });
  const { data, loading, reload } = usePage(() => api.adminListJobs({ page, limit: 25, search: debounced, status: filters.status, category: filters.category }), [page, debounced, filters.status, filters.category]);
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
    <>
      <div className="aa-toolbar">
        <SearchBox value={search} onChange={setSearch} placeholder="Search jobs by title or company…" />
        <FilterSelect value={filters.status} onChange={(v) => setFilter('status', v)} label="Filter by status"
          options={[['', 'All jobs'], ['live', 'Live'], ['closed', 'Closed']]} />
        <FilterSelect value={filters.category} onChange={(v) => setFilter('category', v)} label="Filter by category"
          options={[['', 'All domains'], ['tech', 'Tech'], ['non-tech', 'Non-tech']]} />
      </div>
      <div className="aa-card">
        <BulkBar n={sel.size} onClear={clear}>
          <button className="aa-btn aa-btn--sm aa-btn--danger" disabled={busy} onClick={() => del([...sel])}><Ic d={ICON.trash} size={14} /> Delete</button>
        </BulkBar>
        <div className="aa-table-wrap">
          <table>
            <thead><tr><HeadCheck on={allOn} onToggle={toggleAll} /><th>Role</th><th>Category</th><th>Type</th><th>Recruiter</th><th>Applicants</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {loading && <tr><td colSpan={8} className="aa-empty">Loading…</td></tr>}
              {!loading && jobs.length === 0 && <tr><td colSpan={8} className="aa-empty">No jobs match.</td></tr>}
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
        <Pager page={page} limit={data?.limit ?? 25} total={data?.total ?? jobs.length} onPage={setPage} />
      </div>
    </>
  );
}

/* ================= APPLICATIONS ================= */
function ApplicationsPage() {
  const { api } = useAuth();
  const { search, setSearch, debounced, filters, setFilter, page, setPage } = useListControls({ status: '' });
  const { data, loading } = usePage(() => api.adminListApplications({ page, limit: 25, search: debounced, status: filters.status }), [page, debounced, filters.status]);
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
    <>
      <div className="aa-toolbar">
        <SearchBox value={search} onChange={setSearch} placeholder="Search applications by candidate…" />
        <FilterSelect value={filters.status} onChange={(v) => setFilter('status', v)} label="Filter by status"
          options={[['', 'All statuses'], ['applied', 'Applied'], ['shortlisted', 'Shortlisted'], ['rejected', 'Not selected']]} />
      </div>
      <div className="aa-card">
        <BulkBar n={sel.size} onClear={clear}>
          <button className="aa-btn aa-btn--sm" onClick={exportSel}><Ic d={ICON.download} size={14} /> Export CSV</button>
        </BulkBar>
        <div className="aa-table-wrap">
          <table>
            <thead><tr><HeadCheck on={allOn} onToggle={toggleAll} /><th>Candidate</th><th>Role</th><th>Company</th><th>Status</th><th>Applied</th></tr></thead>
            <tbody>
              {loading && <tr><td colSpan={6} className="aa-empty">Loading…</td></tr>}
              {!loading && apps.length === 0 && <tr><td colSpan={6} className="aa-empty">No applications match.</td></tr>}
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
        <Pager page={page} limit={data?.limit ?? 25} total={data?.total ?? apps.length} onPage={setPage} />
      </div>
    </>
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
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [cat]);
  const { data, loading } = usePage(() => api.adminAudit({ page, limit: 30, category: cat === 'all' ? undefined : cat }), [cat, page]);
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
        <Pager page={page} limit={data?.limit ?? 30} total={data?.total ?? events.length} onPage={setPage} />
      </div>
    </>
  );
}

/* ================= CREATE JOB (form + JSON import) ================= */
const CATS: [string, string][] = [['tech', 'Tech'], ['non-tech', 'Non-tech']];
const JTYPES: [string, string][] = [['full-time', 'Full-time'], ['part-time', 'Part-time'], ['contract', 'Contract'], ['internship', 'Internship']];
const EXPS: [string, string][] = [['entry', 'Entry'], ['mid', 'Mid'], ['senior', 'Senior'], ['lead', 'Lead']];

const EMPTY_JOB = {
  title: '', company: '', category: 'tech', type: 'full-time', experience: 'mid',
  country: '', remote: false, salaryMin: '', salaryMax: '', salaryCurrency: '₹',
  description: '', requirements: '', skills: '', applyUrl: '', source: '', active: true,
};

function buildJobInput(f: typeof EMPTY_JOB): JobInput {
  return {
    title: f.title.trim(),
    company: f.company.trim(),
    category: f.category as JobCategory,
    type: f.type as JobType,
    experience: f.experience as JobExperience,
    country: f.country.trim() || undefined,
    remote: f.remote,
    salaryMin: f.salaryMin ? Number(f.salaryMin) : null,
    salaryMax: f.salaryMax ? Number(f.salaryMax) : null,
    salaryCurrency: f.salaryCurrency.trim() || undefined,
    description: f.description.trim() || undefined,
    requirements: f.requirements.split('\n').map((s) => s.trim()).filter(Boolean),
    skills: f.skills.split(',').map((s) => s.trim()).filter(Boolean),
    applyUrl: f.applyUrl.trim() || undefined,
    source: f.source.trim() || undefined,
    active: f.active,
  };
}

function Field({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return <label className={`aa-field${wide ? ' aa-field--wide' : ''}`}><span>{label}</span>{children}</label>;
}

function CreateJobPage({ goJobs }: { goJobs: () => void }) {
  const { api } = useAuth();
  const [mode, setMode] = useState<'form' | 'import'>('form');
  return (
    <>
      <div className="aa-toolbar">
        <div className="aa-seg">
          <button className={mode === 'form' ? 'is-on' : ''} onClick={() => setMode('form')}>Single job</button>
          <button className={mode === 'import' ? 'is-on' : ''} onClick={() => setMode('import')}>Import JSON</button>
        </div>
      </div>
      {mode === 'form' ? <JobForm onCreated={goJobs} api={api} /> : <JobImport api={api} />}
    </>
  );
}

function JobForm({ onCreated, api }: { onCreated: () => void; api: ApiClient }) {
  const [f, setF] = useState({ ...EMPTY_JOB });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (k: keyof typeof EMPTY_JOB, v: string | boolean) => setF((cur) => ({ ...cur, [k]: v }));
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!f.title.trim() || !f.company.trim()) { setMsg({ ok: false, text: 'Title and company are required.' }); return; }
    setBusy(true); setMsg(null);
    try {
      const { job } = await api.adminCreateJob(buildJobInput(f));
      setMsg({ ok: true, text: `Created “${job.title}” at ${job.company}.` });
      setF({ ...EMPTY_JOB });
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : 'Could not create the job.' });
    } finally { setBusy(false); }
  };
  return (
    <form className="aa-card aa-form" onSubmit={submit}>
      <div className="aa-form__grid">
        <Field label="Job title *"><input value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="Senior Angular Developer" required /></Field>
        <Field label="Company *"><input value={f.company} onChange={(e) => set('company', e.target.value)} placeholder="Infosys" required /></Field>
        <Field label="Category"><select value={f.category} onChange={(e) => set('category', e.target.value)}>{CATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
        <Field label="Type"><select value={f.type} onChange={(e) => set('type', e.target.value)}>{JTYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
        <Field label="Experience"><select value={f.experience} onChange={(e) => set('experience', e.target.value)}>{EXPS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
        <Field label="Location"><input value={f.country} onChange={(e) => set('country', e.target.value)} placeholder="Bengaluru, IN" /></Field>
        <Field label="Salary min"><input type="number" value={f.salaryMin} onChange={(e) => set('salaryMin', e.target.value)} placeholder="3000000" /></Field>
        <Field label="Salary max"><input type="number" value={f.salaryMax} onChange={(e) => set('salaryMax', e.target.value)} placeholder="5000000" /></Field>
        <Field label="Currency"><input value={f.salaryCurrency} onChange={(e) => set('salaryCurrency', e.target.value)} placeholder="₹" /></Field>
      </div>
      <Field label="Description" wide><textarea rows={4} value={f.description} onChange={(e) => set('description', e.target.value)} placeholder="About the role…" /></Field>
      <Field label="Requirements (one per line)" wide><textarea rows={3} value={f.requirements} onChange={(e) => set('requirements', e.target.value)} placeholder={'5+ years with Angular\nStrong TypeScript'} /></Field>
      <Field label="Skills (comma separated)" wide><input value={f.skills} onChange={(e) => set('skills', e.target.value)} placeholder="Angular, TypeScript, RxJS" /></Field>
      <div className="aa-form__grid">
        <Field label="External apply URL"><input value={f.applyUrl} onChange={(e) => set('applyUrl', e.target.value)} placeholder="https://company.com/careers/123" /></Field>
        <Field label="Source"><input value={f.source} onChange={(e) => set('source', e.target.value)} placeholder="Company site" /></Field>
      </div>
      <label className="aa-checkline"><input type="checkbox" className="aa-check" checked={f.remote} onChange={(e) => set('remote', e.target.checked)} /> Remote-friendly</label>
      <label className="aa-checkline"><input type="checkbox" className="aa-check" checked={f.active} onChange={(e) => set('active', e.target.checked)} /> Publish immediately (live)</label>
      {msg && <p className={`aa-msg${msg.ok ? ' aa-msg--ok' : ''}`}>{msg.text}</p>}
      <div className="aa-form__actions">
        {msg?.ok && <button type="button" className="aa-btn" onClick={onCreated}>View all jobs →</button>}
        <button type="submit" className="aa-btn aa-btn--primary" disabled={busy}>{busy ? 'Creating…' : 'Create job'}</button>
      </div>
    </form>
  );
}

function JobImport({ api }: { api: ApiClient }) {
  const [raw, setRaw] = useState('');
  const [parsed, setParsed] = useState<{ valid: JobInput[]; invalid: { i: number; why: string }[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ created: number; skipped: number } | null>(null);
  const [err, setErr] = useState('');

  const verify = () => {
    setErr(''); setResult(null); setParsed(null);
    let data: unknown;
    try { data = JSON.parse(raw); } catch { setErr('That isn’t valid JSON. Paste an array of job objects.'); return; }
    const arr = Array.isArray(data) ? data : [data];
    const valid: JobInput[] = [];
    const invalid: { i: number; why: string }[] = [];
    arr.forEach((item, i) => {
      if (!item || typeof item !== 'object') { invalid.push({ i, why: 'not an object' }); return; }
      const o = item as Record<string, unknown>;
      if (!o.title || typeof o.title !== 'string') { invalid.push({ i, why: 'missing "title"' }); return; }
      if (!o.company || typeof o.company !== 'string') { invalid.push({ i, why: 'missing "company"' }); return; }
      valid.push(o as unknown as JobInput);
    });
    setParsed({ valid, invalid });
  };
  const doImport = async () => {
    if (!parsed?.valid.length || busy) return;
    setBusy(true); setErr('');
    try {
      const r = await api.adminImportJobs(parsed.valid, { dedupe: true });
      setResult(r); setParsed(null); setRaw('');
    } catch (e) { setErr(e instanceof Error ? e.message : 'Import failed.'); } finally { setBusy(false); }
  };
  return (
    <div className="aa-card aa-form">
      <p className="aa-form__hint">Paste a JSON array of jobs (each needs at least <code>title</code> and <code>company</code>). Verify first, then import — duplicates are skipped.</p>
      <textarea className="aa-json" rows={12} value={raw} onChange={(e) => { setRaw(e.target.value); setParsed(null); setResult(null); }} spellCheck={false}
        placeholder={'[\n  {\n    "title": "Senior Angular Developer",\n    "company": "Infosys",\n    "category": "tech",\n    "country": "Bengaluru, IN",\n    "skills": ["Angular", "TypeScript"],\n    "applyUrl": "https://..."\n  }\n]'} />
      {err && <p className="aa-msg">{err}</p>}
      {parsed && (
        <div className="aa-import-preview">
          <p><b className="aa-up">{parsed.valid.length}</b> valid{parsed.invalid.length > 0 ? <> · <b className="aa-down">{parsed.invalid.length} invalid</b></> : ' · all good'}</p>
          {parsed.invalid.length > 0 && <ul className="aa-import-errs">{parsed.invalid.slice(0, 8).map((x) => <li key={x.i}>Item #{x.i + 1}: {x.why}</li>)}</ul>}
          <ul className="aa-import-list">{parsed.valid.slice(0, 6).map((j, i) => <li key={i}><b>{j.title}</b> · {j.company}</li>)}{parsed.valid.length > 6 && <li>…and {parsed.valid.length - 6} more</li>}</ul>
        </div>
      )}
      {result && <p className="aa-msg aa-msg--ok">Imported {result.created} job{result.created !== 1 ? 's' : ''}{result.skipped ? `, skipped ${result.skipped} duplicate${result.skipped !== 1 ? 's' : ''}` : ''}.</p>}
      <div className="aa-form__actions">
        <button className="aa-btn" onClick={verify} disabled={!raw.trim()}>Verify JSON</button>
        <button className="aa-btn aa-btn--primary" onClick={doImport} disabled={!parsed?.valid.length || busy}>{busy ? 'Importing…' : `Import ${parsed?.valid.length ?? ''} jobs`}</button>
      </div>
    </div>
  );
}

/* ================= SHELL ================= */
type Section = 'dashboard' | 'users' | 'connections' | 'posts' | 'comments' | 'jobs' | 'create-job' | 'applications' | 'logs';
const SECTIONS: { id: Section; label: string; icon: string; group: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: ICON.dash, group: 'Overview' },
  { id: 'users', label: 'Users', icon: ICON.users, group: 'People & social' },
  { id: 'connections', label: 'Connections', icon: ICON.conn, group: 'People & social' },
  { id: 'posts', label: 'Posts', icon: ICON.posts, group: 'People & social' },
  { id: 'comments', label: 'Comments', icon: ICON.comments, group: 'People & social' },
  { id: 'jobs', label: 'Jobs', icon: ICON.jobs, group: 'Jobs & hiring' },
  { id: 'create-job', label: 'Post a Job', icon: ICON.plus, group: 'Jobs & hiring' },
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
  'create-job': ['Post a Job', 'Create a job or import several from JSON'],
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

  const body = (() => {
    switch (section) {
      case 'users': return <UsersPage />;
      case 'connections': return <ConnectionsPage />;
      case 'posts': return <PostsPage />;
      case 'comments': return <CommentsPage />;
      case 'jobs': return <JobsPage />;
      case 'create-job': return <CreateJobPage goJobs={() => go('jobs')} />;
      case 'applications': return <ApplicationsPage />;
      case 'logs': return <LogsPage />;
      default: return <DashboardPage />;
    }
  })();

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
          <div className="aa-content">{body}</div>
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
