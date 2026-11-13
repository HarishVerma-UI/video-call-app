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

/* ─── job detail modal ─────────────────────────────────── */
function JobDetail({ job, onClose, onApply }: { job: Job; onClose: () => void; onApply: () => void }) {
  const sal = salaryText(job);
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label={job.title} onClick={onClose}>
      <div className="modal__card card job-detail" onClick={(e: MouseEvent) => e.stopPropagation()}>
        <header className="card__head">
          <div className="job-detail__title">
            <div className="jcard__logo jcard__logo--lg" aria-hidden="true">{initial(job.company)}</div>
            <div>
              <h2>{job.title}</h2>
              <p>{job.company}{job.country ? ` · ${job.country}` : ''}{job.remote ? ' · Remote' : ''}</p>
            </div>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><CloseIcon width={20} height={20} /></button>
        </header>
        <div className="job-detail__facts">
          <span>{CAT_LABEL[job.category]}</span>
          <span>{TYPE_LABEL[job.type]}</span>
          <span>{EXP_LABEL[job.experience]}</span>
          {sal && <span>{sal}</span>}
          {typeof job.matchScore === 'number' && <span className={`jmatch jmatch--${matchBand(job.matchScore)}`}>{job.matchScore}% match</span>}
        </div>
        {job.description && <p className="job-detail__desc">{job.description}</p>}
        {job.requirements.length > 0 && (
          <div className="job-detail__section"><h3>Requirements</h3><ul>{job.requirements.map((r, i) => <li key={i}>{r}</li>)}</ul></div>
        )}
        {job.skills.length > 0 && (
          <div className="job-detail__section">
            <h3>Skills {job.matchedSkills && job.matchedSkills.length > 0 && <small>({job.matchedSkills.length} match yours)</small>}</h3>
            <div className="jcard__skills">{job.skills.map((s) => <span key={s} className={`jskill${job.matchedSkills?.includes(s) ? ' jskill--match' : ''}`}>{s}</span>)}</div>
          </div>
        )}
        <div className="modal__actions">
          <button className="btn btn--secondary" onClick={onClose}>Close</button>
          <button className="btn btn--primary" onClick={onApply} data-testid="open-apply">{job.applyUrl ? `Apply on ${job.source || 'company site'} ↗` : 'Apply now'}</button>
        </div>
      </div>
    </div>
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
export function JobsView(_props: { openUser: (id: string) => void }) {
  const { api } = useAuth();
  const [tab, setTab] = useState<'browse' | 'applied'>('browse');
  const [jobs, setJobs] = useState<Job[] | null>(null);
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
          ) : jobs === null ? (
            <div className="skeleton-list" aria-hidden="true"><i /><i /><i /></div>
          ) : jobs.length === 0 ? (
            <div className="jobs__empty card__empty">
              <p>No jobs match your filters{activeFilters ? '.' : ' yet.'}</p>
              {activeFilters && <button className="btn btn--secondary btn--small" onClick={clearFilters}>Clear filters</button>}
            </div>
          ) : (
            <>
              <p className="jobs__count">{jobs.length} open position{jobs.length !== 1 ? 's' : ''}</p>
              {jobs.map((j) => <JobCard key={j.id} job={j} onOpen={() => setSelected(j)} onApply={() => startApply(j)} />)}
            </>
          )}
        </div>

        {/* right: hub + employers */}
        <aside className="jobs__hub" aria-label="Summary">
          <ApplicationsHub apps={apps} onOpenAll={() => setTab('applied')} />
          <TopEmployers jobs={jobs} onPick={(company) => { setTab('browse'); set('q', company); }} />
        </aside>
      </div>

      {selected && <JobDetail job={selected} onClose={() => setSelected(null)} onApply={() => startApply(selected)} />}
      {applying && <ApplyModal job={applying} completion={completion} onClose={() => setApplying(null)} onApplied={(a) => { markApplied(a.jobId); setApplying(null); }} />}
    </section>
  );
}
