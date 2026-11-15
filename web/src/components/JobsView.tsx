import {
  ApiError,
  profileCompletion,
  type Job,
  type JobApplication,
  type JobCategory,
  type JobExperience,
  type JobFilters,
  type JobType,
  type Profile,
} from '@vca/shared';
import { useCallback, useEffect, useMemo, useState, type MouseEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { ago } from '../format';
import { Avatar } from './RoomBadge';
import { BriefcaseIcon, CloseIcon, SearchIcon } from './Icons';

const CAT_LABEL: Record<JobCategory, string> = { tech: 'Tech', 'non-tech': 'Non-Tech' };
const TYPE_LABEL: Record<JobType, string> = { 'full-time': 'Full-time', 'part-time': 'Part-time', contract: 'Contract', internship: 'Internship' };
const EXP_LABEL: Record<JobExperience, string> = { entry: 'Entry level', mid: 'Mid level', senior: 'Senior', lead: 'Lead / Principal' };
const STATUS_LABEL: Record<string, string> = { applied: 'Applied', shortlisted: 'Shortlisted', rejected: 'Not selected' };

function salaryText(j: Pick<Job, 'salaryMin' | 'salaryMax' | 'salaryCurrency'>): string | null {
  const { salaryMin: lo, salaryMax: hi, salaryCurrency: cur } = j;
  const fmt = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));
  if (lo && hi) return `${cur} ${fmt(lo)} - ${fmt(hi)}`;
  if (lo) return `${cur} ${fmt(lo)}+`;
  if (hi) return `Up to ${cur} ${fmt(hi)}`;
  return null;
}
const matchBand = (s: number) => (s >= 75 ? 'high' : s >= 50 ? 'mid' : 'low');
const initial = (s: string) => (s || '?').charAt(0).toUpperCase();

interface SavedAlert { id: string; label: string; filters: JobFilters }
const EMPTY: JobFilters = { q: '', category: '', country: '', type: '', experience: '', remote: false };

type JobSort = 'match' | 'recent' | 'salary';
const SORT_LABEL: Record<JobSort, string> = { match: 'Best match', recent: 'Newest', salary: 'Top salary' };
const salaryKey = (j: Job) => j.salaryMax ?? j.salaryMin ?? 0;
function sortJobs(jobs: Job[], sort: JobSort): Job[] {
  const xs = [...jobs];
  if (sort === 'recent') xs.sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime());
  else if (sort === 'salary') xs.sort((a, b) => salaryKey(b) - salaryKey(a));
  else xs.sort((a, b) => (b.matchScore ?? -1) - (a.matchScore ?? -1));
  return xs;
}

/* ─── job card ─────────────────────────────────────────── */
function JobCard({ job, onOpen, onApply }: { job: Job; onOpen: () => void; onApply: () => void }) {
  const sal = salaryText(job);
  return (
    <div className="jcard" onClick={onOpen} role="button" tabIndex={0} data-testid="job-card">
      <div className="jcard__head">
        <div className="jcard__logo" aria-hidden="true">{initial(job.company)}</div>
        <div className="jcard__id">
          <div className="jcard__company">
            <span>{job.company}</span>
            {job.remote && <span className="jtag jtag--remote">Remote</span>}
            {job.applyUrl && <span className="jtag jtag--ext">↗ {job.source || 'External'}</span>}
          </div>
          <h3 className="jcard__title">{job.title}</h3>
        </div>
        {typeof job.matchScore === 'number' && (
          <span className={`jmatch jmatch--${matchBand(job.matchScore)}`}>{job.matchScore}%<small>match</small></span>
        )}
      </div>

      <div className="jcard__facts">
        {sal && <span className="jsalary">💲 {sal}</span>}
        <span className="jcard__loc">📍 {job.remote ? 'Remote' : job.country || 'Anywhere'}</span>
      </div>

      {job.skills.length > 0 && (
        <div className="jcard__skills">
          {job.skills.slice(0, 5).map((s) => (
            <span key={s} className={`jskill${job.matchedSkills?.includes(s) ? ' jskill--match' : ''}`}>{s}</span>
          ))}
          {job.skills.length > 5 && <span className="jskill jskill--more">+{job.skills.length - 5}</span>}
        </div>
      )}

      <div className="jcard__foot">
        {job.appliedByMe && <span className="jcard__applied">✓ Applied</span>}
        <button
          className="btn btn--primary btn--small jcard__apply"
          onClick={(e) => { e.stopPropagation(); onApply(); }}
          data-testid="apply-job"
        >
          {job.applyUrl ? 'Apply ↗' : 'Apply'}
        </button>
      </div>
    </div>
  );
}

/* ─── apply modal (internal jobs; 70% gate) ────────────── */
function ApplyModal({ job, completion, onClose, onApplied }: { job: Job; completion: number; onClose: () => void; onApplied: (a: JobApplication) => void }) {
  const { api } = useAuth();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const gated = completion < 70;

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const { application } = await api.applyToJob(job.id, { note: note.trim() });
      onApplied(application);
    } catch (ex) {
      setErr(ex instanceof ApiError ? ex.message : 'Could not submit your application.');
      setBusy(false);
    }
  };

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label={`Apply to ${job.title}`} onClick={onClose}>
      <div className="modal__card card" onClick={(e: MouseEvent) => e.stopPropagation()}>
        <header className="card__head">
          <div>
            <h2>{gated ? 'Complete your profile first' : `Apply — ${job.title}`}</h2>
            <p>{gated ? 'Employers need a complete profile to consider you.' : job.company}</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><CloseIcon width={20} height={20} /></button>
        </header>
        {gated ? (
          <div className="job-gate">
            <div className="job-gate__meter" role="img" aria-label={`Profile ${completion}% complete`}><span style={{ width: `${completion}%` }} /></div>
            <p>Your profile is <strong>{completion}%</strong> complete. Reach <strong>70%</strong> — add a headline, bio, a few skills, and your experience — to apply with one click.</p>
            <div className="modal__actions">
              <button className="btn btn--secondary" onClick={onClose}>Not now</button>
              <a className="btn btn--primary" href="/profile">Complete profile</a>
            </div>
          </div>
        ) : (
          <>
            <p className="job-apply__cv">We’ll share your Huddle profile with {job.company}. Add a short note if you like.</p>
            <div className="line">
              <label htmlFor="apply-note">Cover note (optional)</label>
              <div className="line__row"><textarea id="apply-note" className="pp-textarea" rows={4} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why you’re a great fit…" /></div>
              <span className="line__rule" />
            </div>
            {err && <p className="form-msg" role="alert">{err}</p>}
            <div className="modal__actions">
              <button className="btn btn--secondary" onClick={onClose}>Cancel</button>
              <button className="btn btn--primary" onClick={() => void submit()} disabled={busy} data-testid="submit-application">{busy ? 'Submitting…' : 'Submit application'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ─── full job-detail page ─────────────────────────────── */
type DetailTab = 'overview' | 'responsibilities' | 'skills' | 'salary';
const DETAIL_TABS: { id: DetailTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'responsibilities', label: 'Responsibilities' },
  { id: 'skills', label: 'Skills & Tech' },
  { id: 'salary', label: 'Salary & Benefits' },
];

function JobDetailPage({ job, allJobs, saved, onToggleSave, onBack, onApply, onOpenUser }: {
  job: Job; allJobs: Job[] | null; saved: boolean; onToggleSave: () => void;
  onBack: () => void; onApply: () => void; onOpenUser: (id: string) => void;
}) {
  const [tab, setTab] = useState<DetailTab>('overview');
  const sal = salaryText(job);
  const matched = job.matchedSkills ?? [];
  const missing = job.skills.filter((s) => !matched.includes(s));

  const similar = useMemo(() => {
    const skillSet = new Set(job.skills.map((s) => s.toLowerCase()));
    return (allJobs ?? [])
      .filter((j) => j.id !== job.id)
      .map((j) => ({ j, overlap: j.skills.filter((s) => skillSet.has(s.toLowerCase())).length + (j.category === job.category ? 0.5 : 0) }))
      .filter((x) => x.overlap > 0)
      .sort((a, b) => b.overlap - a.overlap)
      .slice(0, 3)
      .map((x) => x.j);
  }, [allJobs, job]);

  const whyFit: string[] = [];
  if (job.skills.length > 0) whyFit.push(`${matched.length}/${job.skills.length} required skills matched`);
  whyFit.push(`${EXP_LABEL[job.experience]} role`);
  if (sal) whyFit.push('Salary disclosed');

  return (
    <section className="page jobd" aria-label={job.title} data-testid="job-detail">
      <div className="jobd__crumb">
        <button className="link-btn jobd__back" onClick={onBack}>← Back to Jobs</button>
        <span className="jobd__crumb-sep">/</span>
        <span>{CAT_LABEL[job.category]}</span>
        <span className="jobd__crumb-sep">/</span>
        <span className="jobd__crumb-cur">{job.company} — {job.title}</span>
        <span className="jobd__crumb-id">Job ID: {job.id.slice(0, 8).toUpperCase()}</span>
      </div>

      <div className="jobd__grid">
        <div className="jobd__main">
          {/* header card */}
          <div className="card jobd__head">
            <div className="jobd__head-top">
              <div className="jcard__logo jcard__logo--lg" aria-hidden="true">{initial(job.company)}</div>
              <div className="jobd__id">
                <div className="jobd__company">
                  <span>{job.company}</span>
                  {job.remote && <span className="jtag jtag--remote">Remote</span>}
                  {job.applyUrl && <span className="jtag jtag--ext">↗ {job.source || 'External'}</span>}
                </div>
                <h1>{job.title}</h1>
              </div>
              {typeof job.matchScore === 'number' && (
                <span className={`jmatch jmatch--${matchBand(job.matchScore)} jobd__match`}>{job.matchScore}%<small>match</small></span>
              )}
            </div>

            <div className="jobd__facts">
              <span>📍 {job.remote ? 'Remote' : job.country || 'Anywhere'}</span>
              {sal && <span>💲 {sal}</span>}
              <span>🗂 {TYPE_LABEL[job.type]} · {EXP_LABEL[job.experience]}</span>
              {job.createdAt && <span>🕑 Posted {ago(job.createdAt)}</span>}
            </div>

            {matched.length > 0 && (
              <div className="jobd__why">
                <strong>Why you’re a strong candidate</strong>
                <div className="jobd__why-chips">
                  {whyFit.map((w) => <span key={w} className="jobd__why-chip">✓ {w}</span>)}
                </div>
              </div>
            )}

            <div className="jobd__actions">
              <button className="btn btn--primary" onClick={onApply} data-testid="open-apply">
                {job.applyUrl ? `Apply on ${job.source || 'company site'} ↗` : 'Apply Now →'}
              </button>
              <button className={`btn btn--secondary${saved ? ' is-on' : ''}`} onClick={onToggleSave} aria-pressed={saved}>
                {saved ? '✓ Saved' : '🔖 Save Job'}
              </button>
            </div>
          </div>

          {/* tabs */}
          <div className="jobd__tabs" role="tablist">
            {DETAIL_TABS.map((t) => (
              <button key={t.id} role="tab" aria-selected={tab === t.id} className={`jobd__tab${tab === t.id ? ' is-on' : ''}`} onClick={() => setTab(t.id)}>{t.label}</button>
            ))}
          </div>

          <div className="card jobd__panel">
            {tab === 'overview' && (
              <>
                <h2>About the role</h2>
                {job.description ? <p className="jobd__desc">{job.description}</p> : <p className="card__empty">No description provided for this role.</p>}
              </>
            )}
            {tab === 'responsibilities' && (
              <>
                <h2>Key responsibilities</h2>
                {job.requirements.length > 0 ? (
                  <ul className="jobd__reqs">{job.requirements.map((r, i) => <li key={i}>{r}</li>)}</ul>
                ) : <p className="card__empty">Responsibilities aren’t listed for this role.</p>}
              </>
            )}
            {tab === 'skills' && (
              <>
                <h2>Required skills &amp; tech {matched.length > 0 && <small>({matched.length} of {job.skills.length} match your profile)</small>}</h2>
                {job.skills.length > 0 ? (
                  <div className="jcard__skills jobd__skills">
                    {job.skills.map((s) => <span key={s} className={`jskill${matched.includes(s) ? ' jskill--match' : ''}`}>{s}{matched.includes(s) && ' ✓'}</span>)}
                  </div>
                ) : <p className="card__empty">No skills listed.</p>}
              </>
            )}
            {tab === 'salary' && (
              <>
                <h2>Salary &amp; benefits</h2>
                {sal ? <p className="jobd__salary-big">{sal}<small>per year</small></p> : <p className="card__empty">Salary isn’t disclosed for this role.</p>}
                <p className="jobd__note">Benefits are set by the employer and aren’t listed on Huddle for this role. Ask during the application if they aren’t in the description.</p>
              </>
            )}
          </div>
        </div>

        {/* side rail */}
        <aside className="jobd__side" aria-label="Role insights">
          {typeof job.matchScore === 'number' && (
            <div className="card jobd__fit">
              <div className="jobd__fit-head"><h3>Role Fit Analysis</h3><span className={`jmatch jmatch--${matchBand(job.matchScore)}`}>{job.matchScore}%</span></div>
              <p className="jobd__fit-sub">{matched.length} of {job.skills.length || '—'} required skills matched from your profile.</p>
              {matched.map((s) => <div key={s} className="jobd__fit-row jobd__fit-row--on"><span>{s}</span><span>✓</span></div>)}
              {missing.map((s) => <div key={s} className="jobd__fit-row"><span>{s}</span><span className="jobd__fit-add">add to profile</span></div>)}
            </div>
          )}

          <div className="card jobd__hire">
            <h3>Hiring team</h3>
            {job.postedBy && job.postedByName ? (
              <button className="jobd__recruiter" onClick={() => onOpenUser(job.postedBy!)}>
                <Avatar id={job.postedBy} name={job.postedByName} size={42} />
                <span className="jobd__recruiter-info"><strong>{job.postedByName}</strong><em>Posted this role</em></span>
              </button>
            ) : (
              <p className="jobd__hire-src">Listed via <strong>{job.source || 'Huddle'}</strong>.</p>
            )}
          </div>

          {similar.length > 0 && (
            <div className="card jobd__similar">
              <h3>Similar open roles</h3>
              <ul>
                {similar.map((j) => (
                  <li key={j.id} className="jobd__sim"><span className="jobd__sim-logo">{initial(j.company)}</span>
                    <span className="jobd__sim-info"><strong>{j.title}</strong><em>{j.company}{j.country ? ` · ${j.country}` : ''}</em></span>
                    {typeof j.matchScore === 'number' && <span className={`jmatch jmatch--${matchBand(j.matchScore)} jobd__sim-m`}>{j.matchScore}%</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}

/* ─── right rail: applications hub + top employers ─────── */
function ApplicationsHub({ apps, onOpenAll }: { apps: JobApplication[] | null; onOpenAll: () => void }) {
  const a = apps ?? [];
  const tiles = [
    { n: a.length, label: 'Submitted' },
    { n: a.filter((x) => x.status === 'applied').length, label: 'Active' },
    { n: a.filter((x) => x.status === 'shortlisted').length, label: 'Shortlisted' },
    { n: a.filter((x) => x.status === 'rejected').length, label: 'Closed' },
  ];
  return (
    <div className="hub-card hub-card--accent">
      <div className="hub-card__head"><h3>My Applications Hub</h3><button className="link-btn" onClick={onOpenAll}>View all</button></div>
      <div className="hub-tiles">
        {tiles.map((t) => (
          <div key={t.label} className="hub-tile"><span className="hub-tile__n">{apps === null ? '–' : t.n}</span><span className="hub-tile__l">{t.label}</span></div>
        ))}
      </div>
    </div>
  );
}

function TopEmployers({ jobs, onPick }: { jobs: Job[] | null; onPick: (company: string) => void }) {
  const top = useMemo(() => {
    const counts = new Map<string, number>();
    for (const j of jobs ?? []) counts.set(j.company, (counts.get(j.company) ?? 0) + 1);
    return [...counts.entries()].map(([company, count]) => ({ company, count })).sort((x, y) => y.count - x.count).slice(0, 5);
  }, [jobs]);
  if (top.length === 0) return null;
  return (
    <div className="hub-card">
      <div className="hub-card__head"><h3>Top employers hiring now</h3></div>
      <ul className="employers">
        {top.map((e) => (
          <li key={e.company}>
            <button className="employer" onClick={() => onPick(e.company)}>
              <span className="employer__logo">{initial(e.company)}</span>
              <span className="employer__name">{e.company}</span>
              <span className="employer__count">{e.count} open</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ─── salary insights (from the jobs currently shown) ──── */
function SalaryInsights({ jobs }: { jobs: Job[] | null }) {
  const stat = useMemo(() => {
    const vals = (jobs ?? []).map(salaryKey).filter((n) => n > 0).sort((a, b) => a - b);
    if (vals.length === 0) return null;
    const cur = jobs?.find((j) => salaryKey(j) > 0)?.salaryCurrency ?? '';
    const median = vals[Math.floor(vals.length / 2)];
    return { lo: vals[0], hi: vals[vals.length - 1], median, cur, n: vals.length };
  }, [jobs]);
  if (!stat) return null;
  const fmt = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));
  const pct = stat.hi > stat.lo ? ((stat.median - stat.lo) / (stat.hi - stat.lo)) * 100 : 50;
  return (
    <div className="hub-card">
      <div className="hub-card__head"><h3>Salary insights</h3></div>
      <div className="sal-insight">
        <div className="sal-insight__median">{stat.cur} {fmt(stat.median)}<small>median</small></div>
        <div className="sal-insight__track"><span className="sal-insight__dot" style={{ left: `${pct}%` }} /></div>
        <div className="sal-insight__ends"><span>{stat.cur} {fmt(stat.lo)}</span><span>{stat.cur} {fmt(stat.hi)}</span></div>
        <p className="sal-insight__note">Across {stat.n} listed salar{stat.n !== 1 ? 'ies' : 'y'} here.</p>
      </div>
    </div>
  );
}

/* ─── pipeline: real next-step applications ────────────── */
function Pipeline({ apps, openDetail }: { apps: JobApplication[] | null; openDetail: (job: Job) => void }) {
  const shortlisted = (apps ?? []).filter((a) => a.status === 'shortlisted');
  if (shortlisted.length === 0) return null;
  return (
    <div className="hub-card hub-card--pipe">
      <div className="hub-card__head"><h3>You’re shortlisted</h3></div>
      <ul className="pipe-list">
        {shortlisted.slice(0, 4).map((a) => (
          <li key={a.id} className="pipe-item" onClick={() => a.job && openDetail(a.job)} role={a.job ? 'button' : undefined}>
            <span className="pipe-item__dot" aria-hidden="true" />
            <div className="pipe-item__info">
              <strong>{a.job?.title ?? 'Role no longer listed'}</strong>
              <span>{a.job?.company}</span>
            </div>
            <span className="pipe-item__tag">Next: employer review</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ─── my applications list ─────────────────────────────── */
function MyApplications({ apps, openDetail }: { apps: JobApplication[] | null; openDetail: (job: Job) => void }) {
  if (apps === null) return <div className="skeleton-list" aria-hidden="true"><i /></div>;
  if (apps.length === 0) return <p className="card__empty">You haven’t applied to any jobs yet. Browse openings to get started.</p>;
  return (
    <div className="job-apps">
      {apps.map((a) => (
        <div key={a.id} className="job-app" onClick={() => a.job && openDetail(a.job)} role={a.job ? 'button' : undefined}>
          <div className="jcard__logo" aria-hidden="true">{initial(a.job?.company || '?')}</div>
          <div className="job-app__info">
            <strong>{a.job?.title ?? 'This job is no longer listed'}</strong>
            <span>{a.job?.company}{a.job?.country ? ` · ${a.job.country}` : ''}</span>
          </div>
          <span className={`job-status job-status--${a.status}`}>{STATUS_LABEL[a.status] ?? a.status}</span>
        </div>
      ))}
    </div>
  );
}

/* ─── main view ────────────────────────────────────────── */
export function JobsView({ openUser }: { openUser: (id: string) => void }) {
  const { api } = useAuth();
  const [tab, setTab] = useState<'browse' | 'applied'>('browse');
  const [savedIds, setSavedIds] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('huddle.savedJobs') || '[]'); } catch { return []; }
  });
  const toggleSave = (id: string) => setSavedIds((cur) => {
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    try { localStorage.setItem('huddle.savedJobs', JSON.stringify(next)); } catch { /* ignore */ }
    return next;
  });
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [sort, setSort] = useState<JobSort>('match');
  const [filters, setFilters] = useState<JobFilters>(EMPTY);
  const [selected, setSelected] = useState<Job | null>(null);
  const [applying, setApplying] = useState<Job | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [apps, setApps] = useState<JobApplication[] | null>(null);
  const [alerts, setAlerts] = useState<SavedAlert[]>(() => {
    try { return JSON.parse(localStorage.getItem('huddle.jobAlerts') || '[]'); } catch { return []; }
  });

  const completion = useMemo(() => profileCompletion(profile), [profile]);

  useEffect(() => { api.myProfile().then(({ profile }) => setProfile(profile)).catch(() => {}); }, [api]);

  const loadApps = useCallback(() => {
    api.myApplications().then(({ applications }) => setApps(applications)).catch(() => setApps([]));
  }, [api]);
  useEffect(() => loadApps(), [loadApps]);

  const load = useCallback(() => {
    setJobs(null);
    api.jobs(filters).then(({ jobs }) => setJobs(jobs)).catch(() => setJobs([]));
  }, [api, filters]);
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const set = <K extends keyof JobFilters>(k: K, v: JobFilters[K]) => setFilters((f) => ({ ...f, [k]: v }));
  const clearFilters = () => setFilters(EMPTY);
  const activeFilters = !!(filters.category || filters.type || filters.experience || filters.country || filters.remote || filters.q);
  const sortedJobs = useMemo(() => (jobs ? sortJobs(jobs, sort) : jobs), [jobs, sort]);

  // Quick-filter chips: one-tap toggles over the main filters.
  const chips: { label: string; on: boolean; toggle: () => void }[] = [
    { label: 'Remote', on: !!filters.remote, toggle: () => set('remote', !filters.remote) },
    { label: 'Tech', on: filters.category === 'tech', toggle: () => set('category', filters.category === 'tech' ? '' : 'tech') },
    { label: 'Non-Tech', on: filters.category === 'non-tech', toggle: () => set('category', filters.category === 'non-tech' ? '' : 'non-tech') },
    { label: 'Full-time', on: filters.type === 'full-time', toggle: () => set('type', filters.type === 'full-time' ? '' : 'full-time') },
    { label: 'Senior', on: filters.experience === 'senior', toggle: () => set('experience', filters.experience === 'senior' ? '' : 'senior') },
    { label: 'Entry level', on: filters.experience === 'entry', toggle: () => set('experience', filters.experience === 'entry' ? '' : 'entry') },
  ];

  const markApplied = (jobId: string) => {
    setJobs((cur) => cur?.map((j) => (j.id === jobId ? { ...j, appliedByMe: true } : j)) ?? cur);
    setSelected((s) => (s && s.id === jobId ? { ...s, appliedByMe: true } : s));
    loadApps();
  };
  const startApply = (job: Job) => {
    if (job.applyUrl) {
      window.open(job.applyUrl, '_blank', 'noopener,noreferrer');
      void api.applyToJob(job.id).catch(() => {});
      markApplied(job.id);
    } else {
      setApplying(job);
      setSelected(null);
    }
  };

  const persistAlerts = (next: SavedAlert[]) => {
    setAlerts(next);
    try { localStorage.setItem('huddle.jobAlerts', JSON.stringify(next)); } catch { /* ignore */ }
  };
  const saveAlert = () => {
    const parts = [
      filters.q,
      filters.category && CAT_LABEL[filters.category as JobCategory],
      filters.type && TYPE_LABEL[filters.type as JobType],
      filters.experience && EXP_LABEL[filters.experience as JobExperience],
      filters.country,
      filters.remote && 'Remote',
    ].filter(Boolean);
    persistAlerts([{ id: String(Date.now()), label: parts.join(' · ') || 'All openings', filters }, ...alerts.filter((a) => a.label)].slice(0, 6));
  };

  if (selected) {
    return (
      <>
        <JobDetailPage
          job={selected}
          allJobs={jobs}
          saved={savedIds.includes(selected.id)}
          onToggleSave={() => toggleSave(selected.id)}
          onBack={() => setSelected(null)}
          onApply={() => startApply(selected)}
          onOpenUser={openUser}
        />
        {applying && <ApplyModal job={applying} completion={completion} onClose={() => setApplying(null)} onApplied={(a) => { markApplied(a.jobId); setApplying(null); }} />}
      </>
    );
  }

  return (
    <section className="page jobs" aria-label="Jobs" data-testid="jobs">
      <header className="jobs__top">
        <span className="jobs__icon"><BriefcaseIcon width={22} height={22} /></span>
        <div className="jobs__titles">
          <h1>Jobs &amp; Careers</h1>
          <p>Openings matched to your skills. {completion < 70 ? <a href="/profile">Complete your profile</a> : <a href="/profile">Update your skills</a>}{completion < 70 ? ' to apply.' : '.'}</p>
        </div>
        <button className={`btn btn--small ${tab === 'applied' ? 'btn--primary' : 'btn--secondary'}`} onClick={() => setTab((t) => (t === 'applied' ? 'browse' : 'applied'))} data-testid="my-applications">
          My applications
        </button>
      </header>

      <div className="jobs__grid">
        {/* left: filters + alerts */}
        <aside className="jobs__side" aria-label="Filters">
          <div className="jobs__search">
            <SearchIcon width={16} height={16} />
            <input value={filters.q} onChange={(e) => set('q', e.target.value)} placeholder="Search title, company, skill" aria-label="Search jobs" data-testid="jobs-search" />
          </div>
          <label className="jobs__filter"><span>Category</span>
            <select value={filters.category} onChange={(e) => set('category', e.target.value as JobCategory | '')}>
              <option value="">All</option><option value="tech">Tech</option><option value="non-tech">Non-Tech</option>
            </select>
          </label>
          <label className="jobs__filter"><span>Job type</span>
            <select value={filters.type} onChange={(e) => set('type', e.target.value as JobType | '')}>
              <option value="">All</option>{Object.entries(TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label className="jobs__filter"><span>Experience</span>
            <select value={filters.experience} onChange={(e) => set('experience', e.target.value as JobExperience | '')}>
              <option value="">All</option>{Object.entries(EXP_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label className="jobs__filter"><span>Country</span>
            <input value={filters.country} onChange={(e) => set('country', e.target.value)} placeholder="Any" />
          </label>
          <label className="jobs__remote"><input type="checkbox" checked={!!filters.remote} onChange={(e) => set('remote', e.target.checked)} /> Remote only</label>
          {activeFilters && <button className="link-btn" onClick={clearFilters} data-testid="clear-filters">Clear filters</button>}

          <button className="btn btn--primary jobs__alert-btn" onClick={saveAlert}>🔔 Create job alert</button>
          <div className="jobs__alerts">
            <strong>Job alerts</strong>
            {alerts.length === 0 ? (
              <p>Save a search to get a quick filter here.</p>
            ) : (
              <ul>
                {alerts.map((a) => (
                  <li key={a.id}>
                    <button className="jobs__alert-chip" onClick={() => setFilters(a.filters)} title="Apply this search">{a.label}</button>
                    <button className="jobs__alert-x" onClick={() => persistAlerts(alerts.filter((x) => x.id !== a.id))} aria-label="Remove alert">×</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

        {/* center: list or my applications */}
        <div className="jobs__main">
          {tab === 'applied' ? (
            <>
              <p className="jobs__count">Your applications</p>
              <MyApplications apps={apps} openDetail={setSelected} />
            </>
          ) : (
            <>
              {jobs !== null && jobs.length > 0 && (
                <div className="jobs__chips" role="group" aria-label="Quick filters">
                  {chips.map((c) => (
                    <button key={c.label} type="button" className={`jchip${c.on ? ' is-on' : ''}`} aria-pressed={c.on} onClick={c.toggle}>{c.label}</button>
                  ))}
                </div>
              )}
              {jobs === null ? (
                <div className="skeleton-list" aria-hidden="true"><i /><i /><i /></div>
              ) : jobs.length === 0 ? (
                <div className="jobs__empty card__empty">
                  <p>No jobs match your filters{activeFilters ? '.' : ' yet.'}</p>
                  {activeFilters && <button className="btn btn--secondary btn--small" onClick={clearFilters}>Clear filters</button>}
                </div>
              ) : (
                <>
                  <div className="jobs__listhead">
                    <p className="jobs__count">{jobs.length} open position{jobs.length !== 1 ? 's' : ''}</p>
                    <label className="jobs__sort">
                      <span>Sort</span>
                      <select value={sort} onChange={(e) => setSort(e.target.value as JobSort)} aria-label="Sort jobs">
                        {Object.entries(SORT_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </label>
                  </div>
                  {(sortedJobs ?? []).map((j) => <JobCard key={j.id} job={j} onOpen={() => setSelected(j)} onApply={() => startApply(j)} />)}
                </>
              )}
            </>
          )}
        </div>

        {/* right: hub + employers */}
        <aside className="jobs__hub" aria-label="Summary">
          <ApplicationsHub apps={apps} onOpenAll={() => setTab('applied')} />
          <Pipeline apps={apps} openDetail={setSelected} />
          <SalaryInsights jobs={jobs} />
          <TopEmployers jobs={jobs} onPick={(company) => { setTab('browse'); set('q', company); }} />
        </aside>
      </div>

      {applying && <ApplyModal job={applying} completion={completion} onClose={() => setApplying(null)} onApplied={(a) => { markApplied(a.jobId); setApplying(null); }} />}
    </section>
  );
}
