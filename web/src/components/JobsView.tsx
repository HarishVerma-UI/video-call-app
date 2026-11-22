import {
  ApiError,
  analyzeJobFit,
  canonicalSkill,
  profileCompletion,
  type JobFit,
  type Job,
  type JobApplication,
  type JobCategory,
  type JobExperience,
  type JobFilters,
  type JobType,
} from '@vca/shared';
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { activeLocale, convert, useMoney, type CurrencyCode } from '../i18n';
import { useAuth } from '../auth/AuthContext';
import { useProfile } from '../profile/ProfileContext';
import { ago } from '../format';
import { Avatar } from './RoomBadge';
import { BriefcaseIcon, CloseIcon, SearchIcon } from './Icons';
import {
  JobDrawer, ReadinessBlocker, ReadinessPanel, ReadinessStatus,
  cardScanState, laserTop, readinessOf, useCvUpload, useScan,
  type CardScan, type Readiness,
} from './jobs/Readiness';

const catLabel = (t: TFunction, c: JobCategory) => (c === 'tech' ? t('jobs.cat.tech') : t('jobs.cat.nonTech'));
const JOB_TYPES: JobType[] = ['full-time', 'part-time', 'contract', 'internship'];
const typeLabel = (t: TFunction, v: JobType) => ({ 'full-time': t('jobs.type.fullTime'), 'part-time': t('jobs.type.partTime'), contract: t('jobs.type.contract'), internship: t('jobs.type.internship') })[v];
const EXPERIENCES: JobExperience[] = ['entry', 'mid', 'senior', 'lead'];
const expLabel = (t: TFunction, v: JobExperience) => t(`jobs.exp.${v}`);
const STATUS_LABEL: Record<string, string> = { applied: 'Applied', shortlisted: 'Shortlisted', rejected: 'Not selected' };

type Money = (amount: number, from: string) => string;
/** Salary range in the viewer's chosen currency (converted from the job's own currency). */
function salaryText(j: Pick<Job, 'salaryMin' | 'salaryMax' | 'salaryCurrency'>, money: Money): string | null {
  const { salaryMin: lo, salaryMax: hi, salaryCurrency: cur } = j;
  if (lo && hi) return `${money(lo, cur)} – ${money(hi, cur)}`;
  if (lo) return `${money(lo, cur)}+`;
  if (hi) return `≤ ${money(hi, cur)}`;
  return null;
}
const matchBand = (s: number) => (s >= 75 ? 'high' : s >= 50 ? 'mid' : 'low');
const initial = (s: string) => (s || '?').charAt(0).toUpperCase();

/** Delay before the automatic readiness scan after a reload on a Jobs page. */
const SCAN_DELAY_MS = 3000;
const SCANNED_KEY = 'huddle.jobsScanned';
let jobsMountedThisLoad = false;
let lastDecision: { at: number; mode: 'now' | 'delayed' | 'none' } | null = null;
/** Decide (once per Jobs visit) whether this visit scans now, after a delay, or not at all. */
function autoScanMode(): 'now' | 'delayed' | 'none' {
  // React StrictMode (dev) calls state initialisers twice back-to-back: reuse the answer.
  if (lastDecision && performance.now() - lastDecision.at < 250) return lastDecision.mode;
  const mode = decideAutoScan();
  lastDecision = { at: performance.now(), mode };
  return mode;
}
function decideAutoScan(): 'now' | 'delayed' | 'none' {
  const firstMountThisLoad = !jobsMountedThisLoad;
  jobsMountedThisLoad = true;
  // Reloaded while on a Jobs page (and this is that reload's Jobs view).
  const nav = performance.getEntriesByType?.('navigation')[0] as PerformanceNavigationTiming | undefined;
  const reloadedOnJobs = !!nav && nav.type === 'reload' && new URL(nav.name).pathname.startsWith('/jobs');
  if (firstMountThisLoad && reloadedOnJobs) return 'delayed';
  try {
    if (sessionStorage.getItem(SCANNED_KEY)) return 'none';
    sessionStorage.setItem(SCANNED_KEY, '1');
  } catch { /* storage blocked: treat as a first visit */ }
  return 'now';
}

const EMPTY: JobFilters = { q: '', category: '', country: '', type: '', experience: '', remote: false };

/** Client-side filter so results update instantly as you type or click (no round trip). */
function matchesFilters(j: Job, f: JobFilters, skip?: keyof JobFilters): boolean {
  if (skip !== 'category' && f.category && j.category !== f.category) return false;
  if (skip !== 'type' && f.type && j.type !== f.type) return false;
  if (skip !== 'experience' && f.experience && j.experience !== f.experience) return false;
  if (skip !== 'remote' && f.remote && !j.remote) return false;
  const country = (f.country ?? '').trim().toLowerCase();
  const q = (f.q ?? '').trim().toLowerCase();
  if (skip !== 'country' && country && !(j.country ?? '').toLowerCase().includes(country)) return false;
  if (skip !== 'q' && q) {
    const hay = [j.title, j.company, j.country, j.source, j.description, ...j.skills, ...(j.requirements ?? [])].join(' ').toLowerCase();
    if (!q.split(/\s+/).every((w) => hay.includes(w))) return false;
  }
  return true;
}

type JobSort = 'match' | 'recent' | 'salary';
const SORTS: JobSort[] = ['match', 'recent', 'salary'];
const salaryKey = (j: Job) => j.salaryMax ?? j.salaryMin ?? 0;
/** Salary in USD so jobs posted in different currencies sort fairly. */
const salaryUsd = (j: Job) => convert(salaryKey(j), j.salaryCurrency, 'USD').value;
function sortJobs(jobs: Job[], sort: JobSort): Job[] {
  const xs = [...jobs];
  if (sort === 'recent') xs.sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime());
  else if (sort === 'salary') xs.sort((a, b) => salaryUsd(b) - salaryUsd(a));
  else xs.sort((a, b) => (b.matchScore ?? -1) - (a.matchScore ?? -1));
  return xs;
}

/* ─── job card ─────────────────────────────────────────── */
function JobCard({ job, onOpen, onView, onApply, scan = 'done', readiness }: {
  job: Job; onOpen: () => void; onView: () => void; onApply: () => void; scan?: CardScan; readiness?: Readiness;
}) {
  const { t } = useTranslation();
  const { money } = useMoney();
  const sal = salaryText(job, money);
  return (
    <div className={`jcard${scan !== 'done' ? ` is-${scan}` : ''}`} onClick={onOpen} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(); }} role="button" tabIndex={0} data-testid="job-card" data-scan={scan}>
      <div className="jcard__head">
        <div className="jcard__logo" aria-hidden="true">{initial(job.company)}</div>
        <div className="jcard__id">
          <div className="jcard__company">
            <span>{job.company}</span>
            {job.remote && <span className="jtag jtag--remote">{t('jobs.remote')}</span>}
            {job.applyUrl && <span className="jtag jtag--ext">↗ {job.source || t('jobs.external')}</span>}
          </div>
          <h3 className="jcard__title">{job.title}</h3>
        </div>
        {scan === 'queued' ? <span className="jscanbadge jscanbadge--queued">{t('scan.queued')}</span>
          : scan === 'scanning' ? <span className="jscanbadge">{t('scan.scanningFit')}</span>
          : typeof job.matchScore === 'number' && (
            <span className={`jmatch jmatch--${matchBand(job.matchScore)}`} data-testid="job-match">{job.matchScore}%<small>{t('jobs.match')}</small></span>
          )}
      </div>

      <div className="jcard__facts">
        {sal && <span className="jsalary">💲 {sal}</span>}
        <span className="jcard__loc">📍 {job.remote ? t('jobs.remote') : job.country || t('jobs.anywhere')}</span>
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
        {job.appliedByMe && <span className="jcard__applied">{t('jobs.applied')}</span>}
        {!job.appliedByMe && readiness && !readiness.ready && (
          <span className="jcard__lock" data-testid="apply-lock">🔒 {!readiness.hasCv ? t('scan.lockCv') : t('scan.lockProfile', { pct: readiness.completion })}</span>
        )}
        <button
          className="btn btn--secondary btn--small jcard__view"
          onClick={(e) => { e.stopPropagation(); onView(); }}
          data-testid="view-job"
        >
          {t('jobs.view')}
        </button>
        <button
          className="btn btn--primary btn--small jcard__apply"
          onClick={(e) => { e.stopPropagation(); onApply(); }}
          disabled={job.appliedByMe && !job.applyUrl}
          data-testid="apply-job"
        >
          {job.applyUrl ? `${t('jobs.apply')} ↗` : job.appliedByMe ? t('jobs.applied') : t('jobs.apply')}
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

/* ─── share a job by link ──────────────────────────────── */
function ShareJobButton({ job }: { job: Job }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<'idle' | 'ok' | 'failed'>('idle');
  const ref = useRef<HTMLDivElement>(null);
  const url = `${location.origin}/jobs/${encodeURIComponent(job.id)}`;
  const title = `${job.title} — ${job.company}`;
  const text = `${title} on Huddle`;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied('ok');
      setTimeout(() => setCopied('idle'), 2500);
    } catch {
      setCopied('failed'); // clipboard blocked: show the link so it can be copied by hand
    }
  };
  const nativeShare = async () => {
    try { await navigator.share({ title, text, url }); setOpen(false); } catch { /* cancelled */ }
  };
  const links = [
    { label: 'LinkedIn', href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}` },
    { label: 'WhatsApp', href: `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}` },
    { label: 'X / Twitter', href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}` },
    { label: t('jobs.email'), href: `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(`${text}\n${url}`)}` },
  ];

  return (
    <div className="jshare" ref={ref}>
      <button type="button" className="btn btn--secondary" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} data-testid="share-job">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" /></svg>
        {t('jobs.share')}
      </button>
      {open && (
        <div className="jshare__menu" role="menu" aria-label={t('jobs.share')}>
          <div className="jshare__link">
            <input readOnly value={url} aria-label={t('jobs.jobLink')} onFocus={(e) => e.currentTarget.select()} data-testid="share-url" />
            <button type="button" className="btn btn--primary btn--small" onClick={() => void copy()} data-testid="copy-job-link">
              {copied === 'ok' ? t('jobs.linkCopied') : t('jobs.copyLink')}
            </button>
          </div>
          {copied === 'failed' && <p className="jshare__note">{t('jobs.copyManually')}</p>}
          <div className="jshare__targets">
            {links.map((l) => (
              <a key={l.label} role="menuitem" href={l.href} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}>{l.label}</a>
            ))}
            {typeof navigator.share === 'function' && (
              <button type="button" role="menuitem" onClick={() => void nativeShare()}>{t('jobs.moreOptions')}</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── low-match nudge: suggest an expert CV review ─────── */
const NUDGE_MIN_MATCH = 70;
const nudgeKey = (id: string) => `huddle.cvNudge.${id}`;
/** Show once per job per browser session, never after applying, and only on a real (computed) score. */
function shouldNudge(job: Job, fit: JobFit | null): boolean {
  if (!fit || fit.score === null || fit.score >= NUDGE_MIN_MATCH || job.appliedByMe) return false;
  try { return !sessionStorage.getItem(nudgeKey(job.id)); } catch { return true; }
}
const listOf = (items: string[], max = 3) => {
  const shown = items.slice(0, max);
  try { return new Intl.ListFormat(activeLocale(), { style: 'long', type: 'conjunction' }).format(shown); } catch { return shown.join(', '); }
};

/**
 * Every line here comes from analyzeJobFit(): this job's tags + description compared with
 * the viewer's profile right now. Lines only appear when they apply to this person.
 */
function CvNudgeModal({ job, fit, onClose, onBook }: { job: Job; fit: JobFit; onClose: () => void; onBook: () => void }) {
  const { t } = useTranslation();
  const primary = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    primary.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const score = fit.score ?? 0;
  const total = fit.required.length;
  const vars = { company: job.company, title: job.title, total, matched: fit.matched.length };
  const fromJd = new Set(fit.fromDescription);
  const bullets: string[] = [];
  if (fit.missing.length) bullets.push(t('jobs.nudge.bGaps', { skills: listOf(fit.missing) }));
  if (fit.partial.length) bullets.push(t('jobs.nudge.bPartial', { skills: listOf(fit.partial) }));
  if (fit.levelGap && fit.years !== null) bullets.push(t('jobs.nudge.bLevel', { years: fit.years }));
  else bullets.push(t('jobs.nudge.bAchieve'));
  bullets.push(t('jobs.nudge.bExpert'));

  return (
    <div className="modal cv-nudge" role="dialog" aria-modal="true" aria-labelledby="cv-nudge-title" aria-describedby="cv-nudge-body" onClick={onClose} data-testid="cv-nudge">
      <div className="modal__card card cv-nudge__card" onClick={(e: MouseEvent) => e.stopPropagation()}>
        <button type="button" className="icon-btn cv-nudge__close" onClick={onClose} aria-label={t('jobs.nudge.later')}><CloseIcon width={18} height={18} /></button>
        <div className="cv-nudge__top">
          <div className="cv-nudge__ring" style={{ ['--pct' as string]: `${score}%` }} aria-hidden="true"><span>{score}%</span></div>
          <div>
            <span className="cv-nudge__eyebrow">{t('jobs.nudge.eyebrow')}</span>
            <h2 id="cv-nudge-title">{score < 40 ? t('jobs.nudge.titleLow') : t('jobs.nudge.titleMid')}</h2>
          </div>
        </div>
        <div id="cv-nudge-body" className="cv-nudge__body" data-testid="cv-nudge-body">
          <p>{fit.matched.length || fit.partial.length ? t('jobs.nudge.bodyMatch', vars) : t('jobs.nudge.bodyNone', vars)}</p>
          {fit.partial.length > 0 && <p>{t('jobs.nudge.bodyPartial', { skills: listOf(fit.partial) })}</p>}
          {fit.levelGap && fit.years !== null && <p>{t('jobs.nudge.bodyLevel', { min: fit.minYears, years: fit.years })}</p>}
        </div>
        {fit.matched.length > 0 && (
          <div className="cv-nudge__gaps cv-nudge__gaps--have">
            <strong>{t('jobs.nudge.youHave')}</strong>
            <div className="cv-nudge__chips">{fit.matched.slice(0, 8).map((s) => <span key={s}>✓ {s}</span>)}</div>
          </div>
        )}
        {fit.missing.length > 0 && (
          <div className="cv-nudge__gaps">
            <strong>{t('jobs.nudge.gaps')}</strong>
            <div className="cv-nudge__chips" data-testid="cv-nudge-missing">
              {fit.missing.slice(0, 6).map((s) => (
                <span key={s} title={fromJd.has(s) ? t('jobs.nudge.fromJd') : undefined}>{s}{fromJd.has(s) && <sup aria-hidden="true">JD</sup>}</span>
              ))}
              {fit.missing.length > 6 && <span>+{fit.missing.length - 6}</span>}
            </div>
          </div>
        )}
        <ul className="cv-nudge__list">{bullets.map((b) => <li key={b}>{b}</li>)}</ul>
        <div className="cv-nudge__actions">
          <button type="button" className="btn btn--secondary" onClick={onClose} data-testid="cv-nudge-later">{t('jobs.nudge.later')}</button>
          <button ref={primary} type="button" className="btn btn--primary" onClick={onBook} data-testid="cv-nudge-book">{t('jobs.nudge.cta')}</button>
        </div>
        <p className="cv-nudge__note">{t('jobs.nudge.basis')} {t('jobs.nudge.note')}</p>
      </div>
    </div>
  );
}

/* ─── full job-detail page ─────────────────────────────── */
type DetailTab = 'overview' | 'responsibilities' | 'skills' | 'salary';
const DETAIL_TABS: DetailTab[] = ['overview', 'responsibilities', 'skills', 'salary'];

function JobDetailPage({ job, fit, allJobs, saved, onToggleSave, onBack, onApply, onOpenUser, onOpenJob, onApplyJob, onOpenCareer }: {
  job: Job; fit: JobFit | null; allJobs: Job[] | null; saved: boolean; onToggleSave: () => void;
  onBack: () => void; onApply: () => void; onOpenUser: (id: string) => void;
  onOpenJob: (job: Job) => void; onApplyJob: (job: Job) => void; onOpenCareer: () => void;
}) {
  const { t } = useTranslation();
  const { money } = useMoney();
  const [tab, setTab] = useState<DetailTab>('overview');
  const [nudge, setNudge] = useState(false);
  // A new job opened from "Similar roles" starts on its overview, scrolled to the top,
  // and (if the match is low) gets a short pause before the CV-review suggestion.
  useEffect(() => {
    setTab('overview');
    window.scrollTo({ top: 0 });
    setNudge(false);
  }, [job.id]);
  // Wait for the fit (it needs the viewer's profile) so the popup never uses a stale score.
  const fitReady = fit !== null;
  useEffect(() => {
    if (!shouldNudge(job, fit)) return;
    const timer = setTimeout(() => setNudge(true), 700);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per opened job, once the fit is known
  }, [job.id, fitReady]);
  const closeNudge = useCallback(() => {
    setNudge(false);
    try { sessionStorage.setItem(nudgeKey(job.id), '1'); } catch { /* ignore */ }
  }, [job.id]);
  const sal = salaryText(job, money);
  // Fit from the shared analysis (job tags + description vs. the viewer's profile).
  const required = fit?.required ?? job.skills;
  const matched = fit?.matched ?? job.matchedSkills ?? [];
  const partial = fit?.partial ?? [];
  const missing = fit?.missing ?? job.skills.filter((s) => !matched.includes(s));
  const matchedKeys = new Set(matched.map(canonicalSkill));

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
  if (required.length > 0) whyFit.push(t('jobs.skillsMatched', { matched: matched.length, total: required.length }));
  whyFit.push(expLabel(t, job.experience));
  if (sal) whyFit.push(t('jobs.salaryDisclosed'));

  return (
    <section className="page jobd" aria-label={job.title} data-testid="job-detail">
      <div className="jobd__crumb">
        <button className="link-btn jobd__back" onClick={onBack}>{t('jobs.backToJobs')}</button>
        <span className="jobd__crumb-sep">/</span>
        <span>{catLabel(t, job.category)}</span>
        <span className="jobd__crumb-sep">/</span>
        <span className="jobd__crumb-cur">{job.company} — {job.title}</span>
        <span className="jobd__crumb-id">{t('jobs.jobId')}: {job.id.slice(0, 8).toUpperCase()}</span>
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
                  {job.remote && <span className="jtag jtag--remote">{t('jobs.remote')}</span>}
                  {job.applyUrl && <span className="jtag jtag--ext">↗ {job.source || t('jobs.external')}</span>}
                </div>
                <h1>{job.title}</h1>
              </div>
              {typeof job.matchScore === 'number' && (
                <span className={`jmatch jmatch--${matchBand(job.matchScore)} jobd__match`}>{job.matchScore}%<small>{t('jobs.match')}</small></span>
              )}
            </div>

            <div className="jobd__facts">
              <span>📍 {job.remote ? t('jobs.remote') : job.country || t('jobs.anywhere')}</span>
              {sal && <span>💲 {sal}</span>}
              <span>🗂 {typeLabel(t, job.type)} · {expLabel(t, job.experience)}</span>
              {job.createdAt && <span>🕑 {t('jobs.posted', { when: ago(job.createdAt) })}</span>}
            </div>

            {matched.length > 0 && (
              <div className="jobd__why">
                <strong>{t('jobs.whyStrong')}</strong>
                <div className="jobd__why-chips">
                  {whyFit.map((w) => <span key={w} className="jobd__why-chip">✓ {w}</span>)}
                </div>
              </div>
            )}

            <div className="jobd__actions">
              <button className="btn btn--primary" onClick={onApply} data-testid="open-apply">
                {job.applyUrl ? t('jobs.applyOn', { site: job.source || t('jobs.companySite') }) : job.appliedByMe ? t('jobs.applied') : t('jobs.applyNow')}
              </button>
              <button className={`btn btn--secondary${saved ? ' is-on' : ''}`} onClick={onToggleSave} aria-pressed={saved}>
                {saved ? t('jobs.savedJob') : t('jobs.saveJob')}
              </button>
              <ShareJobButton job={job} />
              <button className="btn btn--secondary jobd__cvhelp" onClick={onOpenCareer} data-testid="job-cv-help">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
                {t('top.cvHelp')}
              </button>
            </div>
          </div>

          {/* tabs */}
          <div className="jobd__tabs" role="tablist">
            {DETAIL_TABS.map((id) => (
              <button key={id} role="tab" aria-selected={tab === id} className={`jobd__tab${tab === id ? ' is-on' : ''}`} onClick={() => setTab(id)}>{t(`jobs.tabs.${id}`)}</button>
            ))}
          </div>

          <div className="card jobd__panel">
            {tab === 'overview' && (
              <>
                <h2>{t('jobs.aboutRole')}</h2>
                {job.description ? <p className="jobd__desc">{job.description}</p> : <p className="card__empty">{t('jobs.noDescription')}</p>}
              </>
            )}
            {tab === 'responsibilities' && (
              <>
                <h2>{t('jobs.keyResponsibilities')}</h2>
                {job.requirements.length > 0 ? (
                  <ul className="jobd__reqs">{job.requirements.map((r, i) => <li key={i}>{r}</li>)}</ul>
                ) : <p className="card__empty">{t('jobs.noResponsibilities')}</p>}
              </>
            )}
            {tab === 'skills' && (
              <>
                <h2>{t('jobs.requiredSkills')} {matched.length > 0 && <small>{t('jobs.skillsMatchNote', { matched: matched.length, total: required.length })}</small>}</h2>
                {job.skills.length > 0 ? (
                  <div className="jcard__skills jobd__skills">
                    {job.skills.map((s) => { const on = matchedKeys.has(canonicalSkill(s)); return <span key={s} className={`jskill${on ? ' jskill--match' : ''}`}>{s}{on && ' ✓'}</span>; })}
                  </div>
                ) : <p className="card__empty">{t('jobs.noSkills')}</p>}
              </>
            )}
            {tab === 'salary' && (
              <>
                <h2>{t('jobs.salaryBenefits')}</h2>
                {sal ? <p className="jobd__salary-big">{sal}<small>{t('jobs.perYear')}</small></p> : <p className="card__empty">{t('jobs.salaryHidden')}</p>}
                <p className="jobd__note">Benefits are set by the employer and aren’t listed on Huddle for this role. Ask during the application if they aren’t in the description.</p>
              </>
            )}
          </div>
        </div>

        {/* side rail */}
        <aside className="jobd__side" aria-label="Role insights">
          {typeof job.matchScore === 'number' && (
            <div className="card jobd__fit">
              <div className="jobd__fit-head"><h3>{t('jobs.fitTitle')}</h3><span className={`jmatch jmatch--${matchBand(job.matchScore)}`}>{job.matchScore}%</span></div>
              <p className="jobd__fit-sub">{t('jobs.fitSummary', { matched: matched.length, total: required.length })}</p>
              {matched.map((s) => <div key={s} className="jobd__fit-row jobd__fit-row--on"><span>{s}</span><span>✓</span></div>)}
              {partial.map((s) => <div key={s} className="jobd__fit-row jobd__fit-row--partial"><span>{s}</span><span className="jobd__fit-add">{t('jobs.inExperience')}</span></div>)}
              {missing.map((s) => <div key={s} className="jobd__fit-row"><span>{s}</span><span className="jobd__fit-add">{t('jobs.addToProfile')}</span></div>)}
            </div>
          )}

          <div className="card jobd__hire">
            <h3>{t('jobs.hiringTeam')}</h3>
            {job.postedBy && job.postedByName ? (
              <button className="jobd__recruiter" onClick={() => onOpenUser(job.postedBy!)}>
                <Avatar id={job.postedBy} name={job.postedByName} size={42} />
                <span className="jobd__recruiter-info"><strong>{job.postedByName}</strong><em>{t('jobs.postedThisRole')}</em></span>
              </button>
            ) : (
              <p className="jobd__hire-src">{t('jobs.listedVia')} <strong>{job.source || 'Huddle'}</strong>.</p>
            )}
          </div>

          {similar.length > 0 && (
            <div className="card jobd__similar">
              <h3>{t('jobs.similarRoles')}</h3>
              <ul>
                {similar.map((j) => {
                  const simSal = salaryText(j, money);
                  return (
                    <li key={j.id} className="jobd__sim" data-testid="similar-job">
                      <div className="jobd__sim-top">
                        <span className="jobd__sim-logo">{initial(j.company)}</span>
                        <span className="jobd__sim-info"><strong>{j.title}</strong><em>{j.company}{j.country ? ` · ${j.country}` : ''}</em></span>
                        {typeof j.matchScore === 'number' && <span className={`jmatch jmatch--${matchBand(j.matchScore)} jobd__sim-m`}>{j.matchScore}%</span>}
                      </div>
                      {simSal && <span className="jobd__sim-sal">💲 {simSal}</span>}
                      <div className="jobd__sim-actions">
                        <button type="button" className="btn btn--secondary btn--small" onClick={() => onOpenJob(j)} data-testid="similar-view">{t('jobs.view')}</button>
                        <button type="button" className="btn btn--primary btn--small" onClick={() => onApplyJob(j)} disabled={j.appliedByMe && !j.applyUrl} data-testid="similar-apply">
                          {j.applyUrl ? `${t('jobs.apply')} ↗` : j.appliedByMe ? t('jobs.applied') : t('jobs.apply')}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </aside>
      </div>
      {nudge && fit && <CvNudgeModal job={job} fit={fit} onClose={closeNudge} onBook={() => { closeNudge(); onOpenCareer(); }} />}
    </section>
  );
}

/* ─── right rail: applications hub + top employers ─────── */
function ApplicationsHub({ apps, onOpenAll }: { apps: JobApplication[] | null; onOpenAll: () => void }) {
  const { t } = useTranslation();
  const a = apps ?? [];
  const tiles = [
    { n: a.length, label: t('jobs.submitted') },
    { n: a.filter((x) => x.status === 'applied').length, label: t('jobs.active') },
    { n: a.filter((x) => x.status === 'shortlisted').length, label: t('jobs.shortlisted') },
    { n: a.filter((x) => x.status === 'rejected').length, label: t('jobs.closed') },
  ];
  return (
    <div className="hub-card hub-card--accent">
      <div className="hub-card__head"><h3>{t('jobs.hub')}</h3><button className="link-btn" onClick={onOpenAll}>{t('jobs.viewAll')}</button></div>
      <div className="hub-tiles">
        {tiles.map((t) => (
          <div key={t.label} className="hub-tile"><span className="hub-tile__n">{apps === null ? '–' : t.n}</span><span className="hub-tile__l">{t.label}</span></div>
        ))}
      </div>
    </div>
  );
}

function TopEmployers({ jobs, onPick }: { jobs: Job[] | null; onPick: (company: string) => void }) {
  const { t } = useTranslation();
  const top = useMemo(() => {
    const counts = new Map<string, number>();
    for (const j of jobs ?? []) counts.set(j.company, (counts.get(j.company) ?? 0) + 1);
    return [...counts.entries()].map(([company, count]) => ({ company, count })).sort((x, y) => y.count - x.count).slice(0, 5);
  }, [jobs]);
  if (top.length === 0) return null;
  return (
    <div className="hub-card">
      <div className="hub-card__head"><h3>{t('jobs.topEmployers')}</h3></div>
      <ul className="employers">
        {top.map((e) => (
          <li key={e.company}>
            <button className="employer" onClick={() => onPick(e.company)}>
              <span className="employer__logo">{initial(e.company)}</span>
              <span className="employer__name">{e.company}</span>
              <span className="employer__count">{t('jobs.openCount', { count: e.count })}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ─── salary insights (from the jobs currently shown) ──── */
function SalaryInsights({ jobs }: { jobs: Job[] | null }) {
  const { t } = useTranslation();
  const { currency, money } = useMoney();
  const stat = useMemo(() => {
    // Convert every salary into the viewer's currency first, so mixed-currency
    // listings compare correctly. Free-text currencies we can't convert are skipped.
    const vals = (jobs ?? [])
      .filter((j) => salaryKey(j) > 0)
      .map((j) => convert(salaryKey(j), j.salaryCurrency, currency as CurrencyCode))
      .filter((c) => c.currency === currency)
      .map((c) => c.value)
      .sort((a, b) => a - b);
    if (vals.length === 0) return null;
    const median = vals[Math.floor(vals.length / 2)];
    return { lo: vals[0], hi: vals[vals.length - 1], median, n: vals.length };
  }, [jobs, currency]);
  if (!stat) return null;
  const fmt = (n: number) => money(n, currency);
  const pct = stat.hi > stat.lo ? ((stat.median - stat.lo) / (stat.hi - stat.lo)) * 100 : 50;
  return (
    <div className="hub-card">
      <div className="hub-card__head"><h3>{t('jobs.salaryInsights')}</h3></div>
      <div className="sal-insight">
        <div className="sal-insight__median">{fmt(stat.median)}<small>{t('jobs.median')}</small></div>
        <div className="sal-insight__track"><span className="sal-insight__dot" style={{ left: `${pct}%` }} /></div>
        <div className="sal-insight__ends"><span>{fmt(stat.lo)}</span><span>{fmt(stat.hi)}</span></div>
        <p className="sal-insight__note">{t('jobs.salariesCounted', { count: stat.n })}</p>
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
export function JobsView({ openUser, jobId, onJobChange, openCvExperts, openProfile }: {
  openUser: (id: string) => void;
  /** Job open in the URL (/jobs/:id), so a job can be shared by link. */
  jobId?: string;
  onJobChange: (id: string | null) => void;
  /** Opens the Resume page's expert CV review. */
  openCvExperts: () => void;
  /** Opens Profile & Settings → Basics. */
  openProfile: () => void;
}) {
  const { api } = useAuth();
  const { t } = useTranslation();
  const { money } = useMoney();
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
  const [jobMissing, setJobMissing] = useState(false);
  const [applying, setApplying] = useState<Job | null>(null);
  const [apps, setApps] = useState<JobApplication[] | null>(null);

  // The shared profile (refreshed app-wide on tab focus, updated by every save or
  // CV upload anywhere), so fit scores and readiness are always current.
  const { profile, uploadCv } = useProfile();
  const completion = useMemo(() => profileCompletion(profile), [profile]);
  const readiness = useMemo(() => readinessOf(profile), [profile]);
  const fitOf = useCallback((job: Job): JobFit | null => (profile ? analyzeJobFit(job, profile) : null), [profile]);

  // Readiness scan (Re-scan always runs it on demand). Automatic runs:
  //   • first time Jobs opens in this browser session → straight away
  //   • browser reload while on a Jobs page          → after SCAN_DELAY_MS
  //   • coming back to Jobs from elsewhere in the app → no automatic scan
  const [autoScan] = useState(autoScanMode);
  const [scanRun, setScanRun] = useState(0);
  const scan = useScan(scanRun, autoScan === 'now'); // 'now' holds at 0% until data arrives
  const rescan = useCallback(() => setScanRun((n) => n + 1), []);
  const dataReady = !!profile && jobs !== null;
  useEffect(() => {
    if (!dataReady || autoScan === 'none') return;
    const timer = setTimeout(rescan, autoScan === 'delayed' ? SCAN_DELAY_MS : 0);
    return () => clearTimeout(timer); // leaving the page first cancels it
  }, [dataReady, autoScan, rescan]);

  const [drawerJob, setDrawerJob] = useState<Job | null>(null);
  const [blocking, setBlocking] = useState<Job | null>(null);
  const cv = useCvUpload(uploadCv, rescan);
  /** Jobs with match score + matched skills from the live fit (server values until the profile loads). */
  const scoredJobs = useMemo(() => jobs?.map((j) => {
    const fit = fitOf(j);
    return fit ? { ...j, matchScore: fit.score ?? undefined, matchedSkills: fit.matched } : j;
  }) ?? null, [jobs, fitOf]);

  const loadApps = useCallback(() => {
    api.myApplications().then(({ applications }) => setApps(applications)).catch(() => setApps([]));
  }, [api]);
  useEffect(() => loadApps(), [loadApps]);

  // Load every open job once; filtering happens instantly on the client. Refresh
  // quietly when the tab regains focus so new postings show up.
  const loadJobs = useCallback(() => {
    api.jobs(EMPTY).then(({ jobs }) => setJobs(jobs)).catch(() => setJobs((cur) => cur ?? []));
  }, [api]);
  useEffect(() => {
    loadJobs();
    window.addEventListener('focus', loadJobs);
    return () => window.removeEventListener('focus', loadJobs);
  }, [loadJobs]);

  const set = <K extends keyof JobFilters>(k: K, v: JobFilters[K]) => setFilters((f) => ({ ...f, [k]: v }));
  const clearFilters = () => setFilters(EMPTY);
  const activeFilters = !!(filters.category || filters.type || filters.experience || filters.country || filters.remote || filters.q);
  const visibleJobs = useMemo(() => scoredJobs?.filter((j) => matchesFilters(j, filters)) ?? null, [scoredJobs, filters]);
  const sortedJobs = useMemo(() => (visibleJobs ? sortJobs(visibleJobs, sort) : visibleJobs), [visibleJobs, sort]);
  /** How many jobs each filter option would show, given the other active filters. */
  const countFor = <K extends keyof JobFilters>(k: K, v: JobFilters[K]) =>
    (scoredJobs ?? []).filter((j) => matchesFilters(j, { ...filters, [k]: v }, undefined)).length;
  const strongCount = useMemo(() => (scoredJobs ?? []).filter((j) => (j.matchScore ?? 0) >= 60).length, [scoredJobs]);

  // Quick-filter chips: one-tap toggles over the main filters.
  const chips: { label: string; on: boolean; count: number; toggle: () => void }[] = [
    { label: t('jobs.remote'), on: !!filters.remote, count: countFor('remote', true), toggle: () => set('remote', !filters.remote) },
    { label: t('jobs.cat.tech'), on: filters.category === 'tech', count: countFor('category', 'tech'), toggle: () => set('category', filters.category === 'tech' ? '' : 'tech') },
    { label: t('jobs.cat.nonTech'), on: filters.category === 'non-tech', count: countFor('category', 'non-tech'), toggle: () => set('category', filters.category === 'non-tech' ? '' : 'non-tech') },
    { label: t('jobs.type.fullTime'), on: filters.type === 'full-time', count: countFor('type', 'full-time'), toggle: () => set('type', filters.type === 'full-time' ? '' : 'full-time') },
    { label: t('jobs.exp.senior'), on: filters.experience === 'senior', count: countFor('experience', 'senior'), toggle: () => set('experience', filters.experience === 'senior' ? '' : 'senior') },
    { label: t('jobs.exp.entry'), on: filters.experience === 'entry', count: countFor('experience', 'entry'), toggle: () => set('experience', filters.experience === 'entry' ? '' : 'entry') },
  ];

  // Opening a job updates the URL; the effect below turns the URL back into the
  // selected job (also for shared links, Back/Forward, and reloads).
  const openJob = (job: Job | null) => {
    setSelected(job);
    onJobChange(job?.id ?? null);
  };
  useEffect(() => {
    if (!jobId) { setSelected(null); setJobMissing(false); return; }
    if (selected?.id === jobId) return;
    const known = jobs?.find((j) => j.id === jobId);
    if (known) { setSelected(known); return; }
    let live = true;
    api.job(jobId)
      .then(({ job }) => { if (live) { setSelected(job); setJobMissing(false); } })
      .catch(() => { if (live) setJobMissing(true); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `selected` is the output of this effect
  }, [jobId, jobs, api]);

  const markApplied = (id: string) => {
    setJobs((cur) => cur?.map((j) => (j.id === id ? { ...j, appliedByMe: true } : j)) ?? cur);
    setSelected((s) => (s && s.id === id ? { ...s, appliedByMe: true } : s));
    loadApps();
  };
  /** Apply, unless the profile isn't ready yet — then explain what's missing first. */
  const guardedApply = (job: Job) => {
    if (!readiness.ready && !job.appliedByMe) { setDrawerJob(null); setBlocking(job); return; }
    setDrawerJob(null);
    startApply(job);
  };
  const startApply = (job: Job) => {
    if (job.applyUrl) {
      window.open(job.applyUrl, '_blank', 'noopener,noreferrer');
      void api.applyToJob(job.id).catch(() => {});
      markApplied(job.id);
    } else {
      setApplying(job);
      openJob(null);
    }
  };

  if (jobId && jobMissing) {
    return (
      <section className="page jobs" aria-label={t('jobs.title')}>
        <div className="card__empty jobs__missing" data-testid="job-missing">
          <p>{t('jobs.notFound')}</p>
          <button className="btn btn--secondary btn--small" onClick={() => openJob(null)}>{t('jobs.backToJobs')}</button>
        </div>
      </section>
    );
  }

  const selectedFit = selected ? fitOf(selected) : null;
  if (selected) {
    return (
      <>
        <JobDetailPage
          job={selectedFit ? { ...selected, matchScore: selectedFit.score ?? undefined, matchedSkills: selectedFit.matched } : selected}
          fit={selectedFit}
          allJobs={scoredJobs}
          saved={savedIds.includes(selected.id)}
          onToggleSave={() => toggleSave(selected.id)}
          onBack={() => openJob(null)}
          onApply={() => guardedApply(selected)}
          onOpenUser={openUser}
          onOpenJob={openJob}
          onApplyJob={guardedApply}
          onOpenCareer={openCvExperts}
        />
        {applying && <ApplyModal job={applying} completion={completion} onClose={() => setApplying(null)} onApplied={(a) => { markApplied(a.jobId); setApplying(null); }} />}
        {blocking && (
          <ReadinessBlocker
            job={blocking}
            r={readiness}
            onClose={() => setBlocking(null)}
            uploadCv={cv.pick}
            uploading={cv.busy}
            uploadError={cv.error}
            profileHref="/profile/basics"
            onExpert={() => { setBlocking(null); openCvExperts(); }}
            />
        )}
        {cv.fileInput}
      </>
    );
  }

  return (
    <section className="page jobs" aria-label="Jobs" data-testid="jobs">
      <header className="jobs__top">
        <span className="jobs__icon"><BriefcaseIcon width={22} height={22} /></span>
        <div className="jobs__titles">
          <h1>{t('jobs.title')}</h1>
          <p>{t('jobs.subtitle')} {completion < 70 ? <a href="/profile">{t('jobs.completeProfile')}</a> : <a href="/profile">{t('jobs.updateSkills')}</a>}{completion < 70 ? t('jobs.completeProfileSuffix') : '.'}</p>
        </div>
        {profile && <ReadinessStatus r={readiness} />}
        <button className={`btn btn--small ${tab === 'applied' ? 'btn--primary' : 'btn--secondary'}`} onClick={() => setTab((t) => (t === 'applied' ? 'browse' : 'applied'))} data-testid="my-applications">
          {t('jobs.myApplications')}
        </button>
      </header>

      {profile && jobs !== null && (
        <ReadinessPanel
          scan={scan}
          r={readiness}
          jobsCount={jobs.length}
          strongCount={strongCount}
          onRescan={rescan}
          actions={<>
            {!readiness.hasCv && (
              <button type="button" className="rbtn rbtn--primary" onClick={cv.pick} disabled={cv.busy} data-testid="banner-upload">
                {cv.busy ? t('scan.uploading') : `${t('scan.uploadCv')} (+10%)`}
              </button>
            )}
            {readiness.completion < 70 && (
              <button type="button" className="rbtn rbtn--ghost" onClick={openProfile} data-testid="banner-profile">{t('scan.completeProfile')}</button>
            )}
            <button type="button" className="rbtn rbtn--tint" onClick={openCvExperts} data-testid="banner-expert">{t('scan.expertReview')}</button>
          </>}
        />
      )}
      {cv.error && !blocking && <p className="form-msg" role="alert">{cv.error}</p>}
      {cv.done && !cv.error && (
        <p className="form-msg form-msg--ok" role="status" data-testid="cv-done">
          {cv.done.filled.length
            ? t('scan.cvDone', { fields: cv.done.filled.map((f) => t(`scan.fields.${f}`)).join(', ') })
            : t('scan.cvDoneNone')}
        </p>
      )}

      <div className="jobs__grid">
        {/* left: filters + alerts */}
        <aside className="jobs__side" aria-label={t('jobs.filters')}>
          <div className="jobs__search">
            <SearchIcon width={16} height={16} />
            <input value={filters.q} onChange={(e) => set('q', e.target.value)} placeholder={t('jobs.searchPlaceholder')} aria-label={t('jobs.searchLabel')} data-testid="jobs-search" />
          </div>
          <label className="jobs__filter"><span>{t('jobs.category')}</span>
            <select value={filters.category} onChange={(e) => set('category', e.target.value as JobCategory | '')}>
              <option value="">{t('jobs.all')}</option><option value="tech">{t('jobs.cat.tech')} ({countFor('category', 'tech')})</option><option value="non-tech">{t('jobs.cat.nonTech')} ({countFor('category', 'non-tech')})</option>
            </select>
          </label>
          <label className="jobs__filter"><span>{t('jobs.jobType')}</span>
            <select value={filters.type} onChange={(e) => set('type', e.target.value as JobType | '')}>
              <option value="">{t('jobs.all')}</option>{JOB_TYPES.map((v) => <option key={v} value={v}>{typeLabel(t, v)} ({countFor('type', v)})</option>)}
            </select>
          </label>
          <label className="jobs__filter"><span>{t('jobs.experience')}</span>
            <select value={filters.experience} onChange={(e) => set('experience', e.target.value as JobExperience | '')}>
              <option value="">{t('jobs.all')}</option>{EXPERIENCES.map((v) => <option key={v} value={v}>{expLabel(t, v)} ({countFor('experience', v)})</option>)}
            </select>
          </label>
          <label className="jobs__filter"><span>{t('jobs.country')}</span>
            <input value={filters.country} onChange={(e) => set('country', e.target.value)} placeholder={t('jobs.any')} />
          </label>
          <label className="jobs__remote"><input type="checkbox" checked={!!filters.remote} onChange={(e) => set('remote', e.target.checked)} /> {t('jobs.remoteOnly')} ({countFor('remote', true)})</label>
          {activeFilters && <button className="link-btn" onClick={clearFilters} data-testid="clear-filters">{t('jobs.clearFilters')}</button>}
 
        </aside>

        {/* center: list or my applications */}
        <div className="jobs__main">
          {tab === 'applied' ? (
            <>
              <p className="jobs__count">{t('jobs.yourApplications')}</p>
              <MyApplications apps={apps} openDetail={openJob} />
            </>
          ) : (
            <>
              {jobs !== null && jobs.length > 0 && (
                <div className="jobs__chips" role="group" aria-label={t('jobs.quickFilters')}>
                  {chips.map((c) => (
                    <button key={c.label} type="button" className={`jchip${c.on ? ' is-on' : ''}`} aria-pressed={c.on} onClick={c.toggle} disabled={!c.on && c.count === 0}>{c.label}<small>{c.count}</small></button>
                  ))}
                </div>
              )}
              {jobs === null ? (
                <div className="skeleton-list" aria-hidden="true"><i /><i /><i /></div>
              ) : (visibleJobs ?? []).length === 0 ? (
                <div className="jobs__empty card__empty">
                  <p>{t('jobs.noJobs')}</p>
                  {activeFilters && <button className="btn btn--secondary btn--small" onClick={clearFilters}>{t('jobs.clearFilters')}</button>}
                </div>
              ) : (
                <>
                  <div className="jobs__listhead">
                    <p className="jobs__count" data-testid="jobs-count" aria-live="polite">{t('jobs.openPositions', { count: (visibleJobs ?? []).length })}</p>
                    <label className="jobs__sort">
                      <span>{t('jobs.sort')}</span>
                      <select value={sort} onChange={(e) => setSort(e.target.value as JobSort)} aria-label={t('jobs.sort')}>
                        {SORTS.map((v) => <option key={v} value={v}>{t(`jobs.sortBy.${v}`)}</option>)}
                      </select>
                    </label>
                  </div>
                  <div className="jlist">
                    {scan.running && <span className="jlist__laser" style={{ top: `${laserTop(scan.progress)}%` }} aria-hidden="true" />}
                    {(sortedJobs ?? []).map((j, i, all) => (
                      <JobCard
                        key={j.id}
                        job={j}
                        scan={cardScanState(scan.progress, i, all.length)}
                        readiness={readiness}
                        onOpen={() => setDrawerJob(j)}
                        onView={() => openJob(j)}
                        onApply={() => guardedApply(j)}
                      />
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>

        {/* right: hub + employers */}
        <aside className="jobs__hub" aria-label="Summary">
          <ApplicationsHub apps={apps} onOpenAll={() => setTab('applied')} />
          <Pipeline apps={apps} openDetail={openJob} />
          <SalaryInsights jobs={jobs} />
          <TopEmployers jobs={jobs} onPick={(company) => { setTab('browse'); set('q', company); }} />
        </aside>
      </div>

      {applying && <ApplyModal job={applying} completion={completion} onClose={() => setApplying(null)} onApplied={(a) => { markApplied(a.jobId); setApplying(null); }} />}
      {drawerJob && (
        <JobDrawer
          job={scoredJobs?.find((j) => j.id === drawerJob.id) ?? drawerJob}
          fit={fitOf(drawerJob)}
          r={readiness}
          salary={salaryText(drawerJob, money)}
          onClose={() => setDrawerJob(null)}
          onApply={() => guardedApply(drawerJob)}
          onOpenFull={() => { setDrawerJob(null); openJob(drawerJob); }}
        />
      )}
      {blocking && (
        <ReadinessBlocker
          job={blocking}
          r={readiness}
          onClose={() => setBlocking(null)}
          uploadCv={cv.pick}
          uploading={cv.busy}
          uploadError={cv.error}
          profileHref="/profile/basics"
          onExpert={() => { setBlocking(null); openCvExperts(); }}
        />
      )}
      {cv.fileInput}
    </section>
  );
}
