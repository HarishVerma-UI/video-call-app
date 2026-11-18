// Standalone Recruiter Control Center — a full-screen app (its own shell, the same
// isolated .admin-app / aa- design as the super-admin console) scoped entirely to
// the recruiter's own pipeline: Dashboard, My Jobs, Candidates (every applicant
// across their jobs, searchable + status-filterable), and Post a Job (form + JSON
// import). Every endpoint it calls is caller-scoped on the server, so a recruiter
// only ever sees jobs they posted and the people who applied to them.
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  ROLE_LABEL, normalizeRole,
  type ApiClient, type ApplicationStatus, type DirectoryUser, type Job, type JobApplication,
  type JobCategory, type JobExperience, type JobInput, type JobType, type RecruiterDashboard, type UserRole,
} from '@vca/shared';
import { useAuth } from '../../auth/AuthContext';
import '../../admin.css';
import { Funnel } from './charts';
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
function downloadCsv(name: string, rows: (string | number)[][]) {
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
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
  jobs: 'M3 7h18v13H3zM8 7V5h8v2',
  apps: 'M8 3H6a2 2 0 0 0-2 2v14l4-3h10a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2M9 12l2 2 4-4',
  users: 'M9 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3.5 20a5.5 5.5 0 0 1 11 0M16 6.5a3 3 0 0 1 0 6M18 20a4.8 4.8 0 0 0-3-4.4',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4-4',
  trash: 'M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13',
  download: 'M12 3v12M8 11l4 4 4-4M5 21h14',
  back: 'M15 18l-6-6 6-6',
  menu: 'M4 6h16M4 12h16M4 18h16',
  plus: 'M12 5v14M5 12h14',
  check: 'M20 6 9 17l-5-5',
  x: 'M18 6 6 18M6 6l12 12',
  reset: 'M3 12a9 9 0 1 0 3-6.7M3 4v4h4',
  eye: 'M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7ZM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6',
};
const roleCls = (role?: UserRole | string) => {
  const r = normalizeRole(role || 'member');
  return r === 'super_admin' ? 'admin' : r === 'recruiter' ? 'recruiter' : 'member';
};

const STATUS_PILL: Record<string, string> = { shortlisted: 'recruiter', rejected: 'crit', applied: 'muted' };
const STATUS_LABEL: Record<string, string> = { shortlisted: 'Shortlisted', rejected: 'Not selected', applied: 'Applied' };

/* ================= DASHBOARD ================= */
function DashboardPage({ goCandidates }: { goCandidates: () => void }) {
  const { api } = useAuth();
  const { data } = usePage<RecruiterDashboard>(() => api.recruiterDashboard());
  if (!data) return <div className="aa-skeleton" />;
  const { funnel } = data;
  const kpis = [
    { label: 'Jobs posted', val: data.jobCount, icon: ICON.jobs, c: '--aa-s4' },
    { label: 'Total applicants', val: funnel.total, icon: ICON.apps, c: '--aa-s1' },
    { label: 'Shortlisted', val: funnel.shortlisted, icon: ICON.users, c: '--aa-s7' },
    { label: 'Not selected', val: funnel.rejected, icon: ICON.users, c: '--aa-crit' },
  ];
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

      <div className="aa-grid-2">
        <div className="aa-card">
          <div className="aa-card__head"><h3>Applications funnel</h3><span className="aa-sub">across your roles</span></div>
          <Funnel stages={[
            { name: 'Applied', value: funnel.applied, color: 'var(--aa-s1)' },
            { name: 'Shortlisted', value: funnel.shortlisted, color: 'var(--aa-s7)' },
            { name: 'Not selected', value: funnel.rejected, color: 'var(--aa-crit)' },
          ]} />
        </div>
        <div className="aa-card">
          <div className="aa-card__head"><h3>Recent applicants</h3><button className="aa-btn aa-btn--sm" onClick={goCandidates}>View all →</button></div>
          <div className="aa-feed">
            {data.recentApplicants.length === 0 ? <div className="aa-empty">No applications yet. Post a job to start receiving candidates.</div> :
              data.recentApplicants.map((a) => (
                <div className="aa-feeditem" key={a.id}>
                  <span className="aa-u__av" style={{ background: avColor(a.userName) }}>{initials(a.userName)}</span>
                  <div className="aa-feed-main">
                    <p><b>{a.userName}</b> applied{a.job ? <> to <b>{a.job.title}</b></> : ''}</p>
                    <span className="aa-t">{a.createdAt ? ago(new Date(a.createdAt).getTime()) : ''} · <span className={`aa-pill aa-pill--${STATUS_PILL[a.status] || 'muted'}`}>{STATUS_LABEL[a.status] || a.status}</span></span>
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>
    </>
  );
}

/* ================= MY JOBS ================= */
function JobsPage({ goCreate }: { goCreate: () => void }) {
  const { api } = useAuth();
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search, 200);
  const { data, loading, reload } = usePage(() => api.recruiterJobs());
  const [busy, setBusy] = useState(false);
  const all = data?.jobs ?? [];
  const q = debounced.trim().toLowerCase();
  const jobs = q ? all.filter((j) => (j.title + ' ' + j.company).toLowerCase().includes(q)) : all;
  const del = async (j: Job) => {
    if (busy || !window.confirm(`Delete “${j.title}”? This removes the job and its applications.`)) return;
    setBusy(true);
    try { await api.recruiterDeleteJob(j.id); reload(); } finally { setBusy(false); }
  };
  return (
    <>
      <div className="aa-toolbar">
        <SearchBox value={search} onChange={setSearch} placeholder="Search your jobs by title or company…" />
        <span className="aa-spacer" />
        <button className="aa-btn aa-btn--primary aa-btn--sm" onClick={goCreate}><Ic d={ICON.plus} size={14} /> Post a job</button>
      </div>
      <div className="aa-card">
        <div className="aa-table-wrap">
          <table>
            <thead><tr><th>Role</th><th>Category</th><th>Type</th><th>Applicants</th><th>Status</th><th>Posted</th><th></th></tr></thead>
            <tbody>
              {loading && <tr><td colSpan={7} className="aa-empty">Loading…</td></tr>}
              {!loading && jobs.length === 0 && <tr><td colSpan={7} className="aa-empty">{all.length === 0 ? 'You haven’t posted any jobs yet.' : 'No jobs match your search.'}</td></tr>}
              {jobs.map((j) => (
                <tr key={j.id}>
                  <td><div className="aa-u__name">{j.title}</div><div className="aa-u__mail">{j.company}</div></td>
                  <td><span className={`aa-pill aa-pill--${j.category === 'non-tech' ? 'muted' : 'recruiter'}`}>{j.category === 'non-tech' ? 'Non-tech' : 'Tech'}</span></td>
                  <td style={{ color: 'var(--aa-text-2)' }}>{j.type}</td>
                  <td className="aa-tnum"><b>{j.applicantCount ?? 0}</b></td>
                  <td><span className={`aa-pill aa-pill--${j.active === false ? 'muted' : 'good'}`}><span className="aa-pdot" />{j.active === false ? 'Closed' : 'Live'}</span></td>
                  <td style={{ color: 'var(--aa-muted)' }}>{fmtDate(j.createdAt)}</td>
                  <td><div className="aa-rowact"><button className="aa-iconbtn aa-iconbtn--danger" title="Delete job" disabled={busy} onClick={() => del(j)}><Ic d={ICON.trash} size={15} /></button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

/* ================= CANDIDATES (every applicant across my jobs) ================= */
function CandidatesPage() {
  const { api } = useAuth();
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search, 300);
  const [status, setStatus] = useState<ApplicationStatus | ''>('');
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [debounced, status]);
  const { data, loading, reload } = usePage(() => api.recruiterAllApplicants({ page, limit: 25, search: debounced, status }), [page, debounced, status]);
  const applicants = data?.applicants ?? [];
  const [busyId, setBusyId] = useState<string | null>(null);

  const setStatusOf = async (a: JobApplication, s: ApplicationStatus) => {
    if (busyId) return;
    setBusyId(a.id);
    try { await api.recruiterSetApplicationStatus(a.id, s); reload(); } finally { setBusyId(null); }
  };
  const exportAll = () => {
    const rows: (string | number)[][] = [['Candidate', 'Headline', 'Role', 'Company', 'Status', 'Applied']];
    for (const a of applicants) rows.push([a.userName, a.profile?.headline ?? '', a.job?.title ?? '', a.job?.company ?? '', a.status, a.createdAt ?? '']);
    downloadCsv('huddle-candidates.csv', rows);
  };

  return (
    <>
      <div className="aa-toolbar">
        <SearchBox value={search} onChange={setSearch} placeholder="Search candidates by name…" />
        <FilterSelect value={status} onChange={(v) => setStatus(v as ApplicationStatus | '')} label="Filter by status"
          options={[['', 'All statuses'], ['applied', 'Applied'], ['shortlisted', 'Shortlisted'], ['rejected', 'Not selected']]} />
        <span className="aa-spacer" />
        <button className="aa-btn aa-btn--sm" onClick={exportAll} disabled={applicants.length === 0}><Ic d={ICON.download} size={14} /> Export CSV</button>
      </div>
      <div className="aa-card">
        <div className="aa-table-wrap">
          <table>
            <thead><tr><th>Candidate</th><th>Applied for</th><th>Status</th><th>Applied</th><th>Review</th></tr></thead>
            <tbody>
              {loading && <tr><td colSpan={5} className="aa-empty">Loading…</td></tr>}
              {!loading && applicants.length === 0 && <tr><td colSpan={5} className="aa-empty">No candidates match. Applications to your jobs appear here.</td></tr>}
              {applicants.map((a) => (
                <tr key={a.id}>
                  <td>
                    <div className="aa-u">
                      <span className="aa-u__av" style={{ background: avColor(a.userName) }}>{initials(a.userName)}</span>
                      <div>
                        <div className="aa-u__name">{a.userName}</div>
                        <div className="aa-u__mail">{a.profile?.headline || (a.profile?.skills?.length ? a.profile.skills.slice(0, 3).join(' · ') : '—')}</div>
                      </div>
                    </div>
                  </td>
                  <td>{a.job ? <><div className="aa-u__name">{a.job.title}</div><div className="aa-u__mail">{a.job.company}</div></> : '—'}</td>
                  <td><span className={`aa-pill aa-pill--${STATUS_PILL[a.status] || 'muted'}`}>{STATUS_LABEL[a.status] || a.status}</span></td>
                  <td style={{ color: 'var(--aa-muted)' }}>{fmtDate(a.createdAt)}</td>
                  <td>
                    <div className="aa-rowact">
                      <button className="aa-iconbtn" title="Shortlist" disabled={busyId === a.id || a.status === 'shortlisted'} onClick={() => setStatusOf(a, 'shortlisted')}><Ic d={ICON.check} size={15} /></button>
                      <button className="aa-iconbtn aa-iconbtn--danger" title="Not selected" disabled={busyId === a.id || a.status === 'rejected'} onClick={() => setStatusOf(a, 'rejected')}><Ic d={ICON.x} size={15} /></button>
                      {a.status !== 'applied' && <button className="aa-iconbtn" title="Reset to applied" disabled={busyId === a.id} onClick={() => setStatusOf(a, 'applied')}><Ic d={ICON.reset} size={15} /></button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager page={page} limit={data?.limit ?? 25} total={data?.total ?? applicants.length} onPage={setPage} />
      </div>
    </>
  );
}

/* ================= PEOPLE (read-only directory of all members) ================= */
function PeoplePage() {
  const { api } = useAuth();
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search, 300);
  const [role, setRole] = useState<UserRole | ''>('');
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [debounced, role]);
  const { data, loading } = usePage(() => api.recruiterListUsers({ page, limit: 25, search: debounced, role }), [page, debounced, role]);
  const users = data?.users ?? [];
  const [detail, setDetail] = useState<DirectoryUser | null>(null);

  return (
    <>
      <div className="aa-toolbar">
        <SearchBox value={search} onChange={setSearch} placeholder="Search people by name, email…" />
        <FilterSelect value={role} onChange={(v) => setRole(v as UserRole | '')} label="Filter by role"
          options={[['', 'All roles'], ['member', 'Members'], ['recruiter', 'Recruiters'], ['super_admin', 'Admins']]} />
        <span className="aa-spacer" />
        <span className="aa-note">View only</span>
      </div>
      <div className="aa-card">
        <div className="aa-table-wrap">
          <table>
            <thead><tr><th>Person</th><th>Role</th><th>Headline</th><th>Location</th><th>Expected salary</th><th>CV</th><th></th></tr></thead>
            <tbody>
              {loading && <tr><td colSpan={7} className="aa-empty">Loading…</td></tr>}
              {!loading && users.length === 0 && <tr><td colSpan={7} className="aa-empty">No people match.</td></tr>}
              {users.map((u) => (
                <tr key={u.id} onClick={() => setDetail(u)} style={{ cursor: 'pointer' }}>
                  <td><div className="aa-u"><span className="aa-u__av" style={{ background: avColor(u.name) }}>{initials(u.name)}</span><div><div className="aa-u__name">{u.name}</div><div className="aa-u__mail">{u.email}</div></div></div></td>
                  <td><span className={`aa-pill aa-pill--${roleCls(u.role)}`}>{ROLE_LABEL[normalizeRole(u.role || 'member')]}</span></td>
                  <td style={{ color: 'var(--aa-text-2)' }}><div className="aa-trunc" style={{ maxWidth: 220 }}>{u.profile?.headline || '—'}</div></td>
                  <td style={{ color: 'var(--aa-text-2)' }}>{u.profile?.location || '—'}</td>
                  <td style={{ color: 'var(--aa-text-2)' }}>{u.profile?.expectedSalary || '—'}</td>
                  <td>{u.profile?.cvUrl ? <a href={u.profile.cvUrl} target="_blank" rel="noreferrer" className="aa-pill aa-pill--good" onClick={(e) => e.stopPropagation()}><Ic d={ICON.download} size={12} /> CV</a> : <span style={{ color: 'var(--aa-muted)' }}>—</span>}</td>
                  <td onClick={(e) => e.stopPropagation()}><div className="aa-rowact"><button className="aa-iconbtn" title="View details" onClick={() => setDetail(u)}><Ic d={ICON.eye} size={15} /></button></div></td>
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

/* ================= POST A JOB (form + JSON import) ================= */
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
  const [mode, setMode] = useState<'form' | 'import'>('form');
  const { api } = useAuth();
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
      const { job } = await api.recruiterCreateJob(buildJobInput(f));
      setMsg({ ok: true, text: `Posted “${job.title}” at ${job.company}.` });
      setF({ ...EMPTY_JOB });
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : 'Could not post the job.' });
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
        {msg?.ok && <button type="button" className="aa-btn" onClick={onCreated}>View my jobs →</button>}
        <button type="submit" className="aa-btn aa-btn--primary" disabled={busy}>{busy ? 'Posting…' : 'Post job'}</button>
      </div>
    </form>
  );
}

function JobImport({ api }: { api: ApiClient }) {
  const [raw, setRaw] = useState('');
  const [parsed, setParsed] = useState<{ valid: JobInput[]; invalid: { i: number; why: string }[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ created: number; failed: number } | null>(null);
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
  // Recruiter jobs are created one at a time (each scoped to this recruiter as owner).
  const doImport = async () => {
    if (!parsed?.valid.length || busy) return;
    setBusy(true); setErr('');
    let created = 0, failed = 0;
    for (const input of parsed.valid) {
      try { await api.recruiterCreateJob(input); created++; } catch { failed++; }
    }
    setResult({ created, failed }); setParsed(null); setRaw(''); setBusy(false);
  };
  return (
    <div className="aa-card aa-form">
      <p className="aa-form__hint">Paste a JSON array of jobs (each needs at least <code>title</code> and <code>company</code>). Verify first, then import — each is posted under your account.</p>
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
      {result && <p className="aa-msg aa-msg--ok">Posted {result.created} job{result.created !== 1 ? 's' : ''}{result.failed ? `, ${result.failed} failed` : ''}.</p>}
      <div className="aa-form__actions">
        <button className="aa-btn" onClick={verify} disabled={!raw.trim()}>Verify JSON</button>
        <button className="aa-btn aa-btn--primary" onClick={doImport} disabled={!parsed?.valid.length || busy}>{busy ? 'Posting…' : `Post ${parsed?.valid.length ?? ''} jobs`}</button>
      </div>
    </div>
  );
}

/* ================= SHELL ================= */
type Section = 'dashboard' | 'jobs' | 'create-job' | 'candidates' | 'people';
const SECTIONS: { id: Section; label: string; icon: string; group: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: ICON.dash, group: 'Overview' },
  { id: 'jobs', label: 'My Jobs', icon: ICON.jobs, group: 'Hiring' },
  { id: 'create-job', label: 'Post a Job', icon: ICON.plus, group: 'Hiring' },
  { id: 'candidates', label: 'Candidates', icon: ICON.apps, group: 'Hiring' },
  { id: 'people', label: 'People', icon: ICON.users, group: 'Talent' },
];
const TITLES: Record<Section, [string, string]> = {
  dashboard: ['Dashboard', 'Your hiring pipeline at a glance'],
  jobs: ['My Jobs', 'Every role you’ve posted'],
  'create-job': ['Post a Job', 'Create a job or import several from JSON'],
  candidates: ['Candidates', 'Everyone who applied to your roles'],
  people: ['People', 'Browse every member — view only'],
};

function sectionFromPath(): Section {
  const seg = location.pathname.split('/').filter(Boolean);
  const s = seg[1] as Section;
  return SECTIONS.some((x) => x.id === s) ? s : 'dashboard';
}

export function RecruiterApp({ exit }: { exit: () => void }) {
  const { user } = useAuth();
  const [section, setSection] = useState<Section>(() => sectionFromPath());
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onPop = () => setSection(sectionFromPath());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const go = useCallback((s: Section) => {
    const path = s === 'dashboard' ? '/recruiter' : `/recruiter/${s}`;
    if (location.pathname !== path) history.pushState(null, '', path);
    setSection(s);
    setMenuOpen(false);
    window.scrollTo(0, 0);
  }, []);

  const body = (() => {
    switch (section) {
      case 'jobs': return <JobsPage goCreate={() => go('create-job')} />;
      case 'create-job': return <CreateJobPage goJobs={() => go('jobs')} />;
      case 'candidates': return <CandidatesPage />;
      case 'people': return <PeoplePage />;
      default: return <DashboardPage goCandidates={() => go('candidates')} />;
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
        <aside className={`aa-side${menuOpen ? ' is-open' : ''}`} aria-label="Recruiter sections">
          <div className="aa-brand">
            <span className="aa-brand__mark"><Ic d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM12 8v8M8 12h8" size={20} /></span>
            <div><div className="aa-brand__name">Huddle Recruiter</div><div className="aa-brand__sub">Talent Center</div></div>
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
            <span className="aa-avatar">{initials(user?.name || 'R')}</span>
            <div className="aa-side__who"><strong>{user?.name}</strong><span>Recruiter</span></div>
          </div>
        </aside>
        <div className={`aa-scrim${menuOpen ? ' is-show' : ''}`} onClick={() => setMenuOpen(false)} />

        <div className="aa-main">
          <header className="aa-topbar">
            <button className="aa-hamburger" aria-label="Open menu" onClick={() => setMenuOpen(true)}><Ic d={ICON.menu} size={20} /></button>
            <div><div className="aa-topbar__title">{TITLES[section][0]}</div><div className="aa-topbar__sub">{TITLES[section][1]}</div></div>
            <span className="aa-spacer" />
            {section !== 'create-job' && <button className="aa-btn aa-btn--primary" onClick={() => go('create-job')}><Ic d={ICON.plus} size={15} /> Post a job</button>}
          </header>
          <div className="aa-content">{body}</div>
        </div>
      </div>
    </div>
  );
}
