// Jobs page readiness scanner: the scan animation, the live profile audit, the
// post-scan action banner, the apply blocker and the job drawer. Every number
// shown comes from real data — profileCompletion() for readiness (the same rule
// the server enforces at 70%) and analyzeJobFit() for job matches.
import { profileCompletion, type Job, type JobFit, type Profile } from '@vca/shared';
import { useCallback, useEffect, useRef, useState, type ChangeEvent, type MouseEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cvErrorText, type CvResult } from '../../profile/ProfileContext';
import { CloseIcon } from '../Icons';
import './readiness.css';

/* ─── readiness ────────────────────────────────────────── */
export type FixId = 'cv' | 'headline' | 'bio' | 'location' | 'skills' | 'experience' | 'education';
export interface Readiness {
  completion: number;
  hasCv: boolean;
  /** Can apply: profile at the 70% gate AND a CV attached. */
  ready: boolean;
  /** What's left, with the completion % each adds (same weights as profileCompletion). */
  fixes: { id: FixId; gain: number }[];
  checks: { roleLocation: boolean; cv: boolean; bioSkills: boolean };
}
export const READY_GATE = 70;

export function readinessOf(p: Profile | null): Readiness {
  const completion = profileCompletion(p);
  const hasCv = !!p?.hasCv;
  const skills = new Set((p?.skills ?? []).map((s) => s.trim().toLowerCase()).filter(Boolean)).size;
  const has = (v?: string) => !!(v ?? '').trim();
  const fixes: { id: FixId; gain: number }[] = [];
  if (!hasCv) fixes.push({ id: 'cv', gain: 10 });
  const rest: { id: FixId; gain: number }[] = [];
  if (!has(p?.headline)) rest.push({ id: 'headline', gain: 15 });
  if (!has(p?.bio)) rest.push({ id: 'bio', gain: 15 });
  if (!has(p?.location)) rest.push({ id: 'location', gain: 10 });
  if (skills < 3) rest.push({ id: 'skills', gain: 20 - Math.min(20, skills * 7) });
  if (!p?.experience?.some((x) => x.title.trim() || x.company.trim())) rest.push({ id: 'experience', gain: 20 });
  if (!p?.education?.some((x) => x.school.trim() || x.degree.trim())) rest.push({ id: 'education', gain: 10 });
  fixes.push(...rest.sort((a, b) => b.gain - a.gain));
  return {
    completion,
    hasCv,
    ready: completion >= READY_GATE && hasCv,
    fixes,
    checks: { roleLocation: has(p?.headline) && has(p?.location), cv: hasCv, bioSkills: has(p?.bio) && skills >= 3 },
  };
}

/** Readiness status badge: Ready / Missing CV / Incomplete profile. */
export function ReadinessBadge({ r }: { r: Readiness }) {
  const { t } = useTranslation();
  if (r.ready) return <span className="rbadge rbadge--ok">{t('scan.badgeReady')}</span>;
  if (!r.hasCv) return <span className="rbadge rbadge--bad">{t('scan.badgeNoCv')}</span>;
  return <span className="rbadge rbadge--warn">{t('scan.badgeIncomplete', { pct: r.completion })}</span>;
}

/* ─── scan timeline ────────────────────────────────────── */
const SCAN_MS = 3400;
/**
 * Progress 0→100 over SCAN_MS each time `runId` changes (instant with reduced motion).
 * `startPending` holds it at 0% from the first frame while waiting for the first run.
 */
export function useScan(runId: number, startPending = false) {
  const [progress, setProgress] = useState(startPending ? 0 : 100);
  useEffect(() => {
    if (runId === 0) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setProgress(100); return; }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const x = Math.min(1, (now - start) / SCAN_MS);
      setProgress(Math.round((1 - (1 - x) ** 2) * 100)); // ease-out
      if (x < 1) raf = requestAnimationFrame(tick);
    };
    setProgress(0);
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [runId]);
  const running = progress < 100;
  /** 0–3 = checklist step in progress, 4 = done. */
  const step = running ? Math.min(3, Math.floor(progress / 25)) : 4;
  return { progress, running, step };
}

/** Each card's state as the laser passes over the list (the "ranking" step, 45–100%). */
export type CardScan = 'queued' | 'scanning' | 'done';
export function cardScanState(progress: number, index: number, total: number): CardScan {
  if (progress >= 100) return 'done';
  const n = Math.max(1, Math.min(total, 10));
  if (index >= n) return progress >= 96 ? 'done' : 'queued';
  const span = 50 / n;
  const start = 45 + index * span;
  if (progress < start) return 'queued';
  return progress < start + Math.max(span, 6) ? 'scanning' : 'done';
}
/** Laser position (0–100% of the job list) for the ranking step. */
export const laserTop = (progress: number) => Math.max(0, Math.min(100, ((progress - 45) / 55) * 100));

/* ─── CV upload (via the shared profile: read → upload → fill → save) ── */
export function useCvUpload(upload: (file: File) => Promise<CvResult>, onDone?: (r: CvResult) => void) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<CvResult | null>(null);
  const pick = useCallback(() => { setError(null); input.current?.click(); }, []);
  const onChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const result = await upload(file);
      setDone(result);
      onDone?.(result);
    } catch (err) {
      setError(cvErrorText(err));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };
  const fileInput = <input ref={input} type="file" accept=".pdf,.doc,.docx,.txt" hidden onChange={(e) => void onChange(e)} data-testid="cv-file" />;
  return { pick, busy, error, done, fileInput };
}

/* ─── scanner banner + live audit ──────────────────────── */
const STEP_KEYS = ['skills', 'cv', 'gate', 'rank'] as const;

export function ReadinessPanel({ scan, r, jobsCount, strongCount, onRescan, actions }: {
  scan: { progress: number; running: boolean; step: number };
  r: Readiness;
  jobsCount: number;
  strongCount: number;
  onRescan: () => void;
  actions: ReactNode;
}) {
  const { t } = useTranslation();
  const auditRow = (label: string, stepNeeded: number, ok: boolean, okText: string, badText: string, pendingText: string, testId: string) => {
    const pending = scan.step < stepNeeded;
    return (
      <li className={`raudit__row ${pending ? 'is-pending' : ok ? 'is-ok' : 'is-bad'}`} data-testid={testId}>
        <span>{label}</span>
        <strong>{pending ? pendingText : ok ? `✓ ${okText}` : badText}</strong>
      </li>
    );
  };

  return (
    <section className="rpanel" aria-label={t('scan.title')} data-testid="readiness-panel">
      <div className={`rscan${scan.running ? ' is-running' : r.ready ? ' is-ready' : ' is-todo'}`} aria-live="polite">
        {scan.running ? (
          <>
            <div className="rscan__sweep" aria-hidden="true" />
            <div className="rscan__head">
              <span className="rscan__radar" aria-hidden="true"><i /></span>
              <div>
                <strong>{t('scan.title')}</strong>
                <span>{t('scan.scanning', { count: jobsCount })}</span>
              </div>
              <b className="rscan__pct" data-testid="scan-pct">{scan.progress}%</b>
            </div>
            <div className="rscan__bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={scan.progress}><span style={{ width: `${scan.progress}%` }} /></div>
            <ol className="rscan__steps">
              {STEP_KEYS.map((k, i) => (
                <li key={k} className={scan.step > i ? 'is-done' : scan.step === i ? 'is-active' : ''}>
                  <span aria-hidden="true">{scan.step > i ? '✓' : i + 1}</span>{t(`scan.steps.${k}`)}
                </li>
              ))}
            </ol>
          </>
        ) : r.ready ? (
          <div className="rsummary" data-testid="scan-summary">
            <strong>{t('scan.readyTitle', { count: strongCount })}</strong>
            <p>{t('scan.readyBody', { pct: r.completion })}</p>
            <div className="rsummary__actions">
              <button type="button" className="rbtn rbtn--ghost" onClick={onRescan} data-testid="rescan">{t('scan.rescan')}</button>
            </div>
          </div>
        ) : (
          <div className="rsummary" data-testid="scan-summary">
            <strong>{strongCount > 0 ? t('scan.todoTitle', { count: strongCount }) : t('scan.todoTitleNone')}</strong>
            <ol className="rsummary__pills">
              {r.fixes.slice(0, 3).map((f, i) => (
                <li key={f.id}><b>{i + 1}</b>{f.id === 'cv' ? t('scan.fixCv', { gain: f.gain }) : t('scan.fixItem', { item: t(`scan.items.${f.id}`), gain: f.gain })}</li>
              ))}
            </ol>
            <div className="rsummary__actions">
              {actions}
              <button type="button" className="rbtn rbtn--link" onClick={onRescan} data-testid="rescan">{t('scan.rescan')}</button>
            </div>
          </div>
        )}
      </div>

      <aside className="raudit" aria-label={t('scan.audit')}>
        <header>
          <strong>{t('scan.audit')}</strong>
          {scan.running ? <span className="rbadge">{t('scan.checking')}</span> : <ReadinessBadge r={r} />}
        </header>
        <div className="raudit__meter" title={t('scan.readiness')}>
          <div className={`raudit__track is-${readinessTone(r.completion)}`} aria-label={t('scan.readiness')}><span style={{ width: `${scan.step < 3 ? 0 : r.completion}%` }} /><i style={{ left: `${READY_GATE}%` }} /></div>
          <b>{scan.step < 3 ? '-' : `${r.completion}%`}</b>
        </div>
        <ul>
          {auditRow(t('scan.roleLocation'), 1, r.checks.roleLocation, t('scan.verified'), t('scan.needsUpdate'), t('scan.checking'), 'audit-role')}
          {auditRow(t('scan.cvResume'), 2, r.checks.cv, t('scan.attached'), t('scan.missing'), t('scan.scanningShort'), 'audit-cv')}
          {auditRow(t('scan.bioSkills'), 3, r.checks.bioSkills, t('scan.complete'), t('scan.needsUpdate'), t('scan.checking'), 'audit-bio')}
        </ul>
      </aside>
    </section>
  );
}

/* ─── apply blocker (profile < 70% or no CV) ───────────── */
export function ReadinessBlocker({ job, r, onClose, uploadCv, uploading, uploadError, profileHref, onExpert }: {
  job: Job; r: Readiness; onClose: () => void;
  uploadCv: () => void; uploading: boolean; uploadError: string | null;
  profileHref: string; onExpert: () => void;
}) {
  const { t } = useTranslation();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  const profileFixes = r.fixes.filter((f) => f.id !== 'cv');
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="rblock-h" onClick={onClose} data-testid="readiness-blocker">
      <div className="modal__card card rblock" onClick={(e: MouseEvent) => e.stopPropagation()}>
        <button type="button" className="icon-btn rblock__close" onClick={onClose} aria-label={t('scan.close')}><CloseIcon width={18} height={18} /></button>
        <ReadinessBadge r={r} />
        <h2 id="rblock-h">{t('scan.blockerTitle')}</h2>
        <p>{t('scan.blockerBody', { title: job.title, company: job.company })}</p>
        <ul className="rblock__list">
          <li className={r.hasCv ? 'is-ok' : ''}>
            <div><strong>{t('scan.cvResume')}</strong><span>{r.hasCv ? t('scan.attached') : t('scan.fixCv', { gain: 10 })}</span></div>
            {!r.hasCv && (
              <button type="button" className="rbtn rbtn--primary" onClick={uploadCv} disabled={uploading} data-testid="blocker-upload">
                {uploading ? t('scan.uploading') : t('scan.uploadCv')}
              </button>
            )}
          </li>
          <li className={r.completion >= READY_GATE ? 'is-ok' : ''}>
            <div>
              <strong>{t('scan.profileGate', { pct: r.completion })}</strong>
              <span>{r.completion >= READY_GATE ? t('scan.complete') : profileFixes.slice(0, 3).map((f) => t(`scan.items.${f.id}`)).join(' · ')}</span>
            </div>
            {r.completion < READY_GATE && (
              <a className="rbtn rbtn--ghost" href={profileHref} target="_blank" rel="noopener" data-testid="blocker-profile">{t('scan.completeProfile')} ↗</a>
            )}
          </li>
        </ul>
        {uploadError && <p className="form-msg" role="alert">{uploadError}</p>}
        <p className="rblock__note">{t('scan.blockerNote')}</p>
        <div className="rblock__foot">
          <button type="button" className="rbtn rbtn--link" onClick={onExpert}>{t('scan.expertReview')}</button>
          <button type="button" className="rbtn rbtn--ghost" onClick={onClose}>{t('scan.close')}</button>
        </div>
      </div>
    </div>
  );
}

/* ─── job drawer: skill-by-skill match + readiness ─────── */
export function JobDrawer({ job, fit, r, onClose, onApply, onOpenFull, salary }: {
  job: Job; fit: JobFit | null; r: Readiness; onClose: () => void; onApply: () => void; onOpenFull: () => void; salary: string | null;
}) {
  const { t } = useTranslation();
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  const score = fit?.score;
  return (
    <div className="rdrawer" role="dialog" aria-modal="true" aria-labelledby="rdrawer-h" onClick={onClose} data-testid="job-drawer">
      <div className="rdrawer__panel" onClick={(e: MouseEvent) => e.stopPropagation()}>
        <header className="rdrawer__head">
          <div>
            <span>{job.company}</span>
            <h2 id="rdrawer-h">{job.title}</h2>
            {salary && <em>{salary}</em>}
          </div>
          <button ref={closeRef} type="button" className="icon-btn" onClick={onClose} aria-label={t('scan.close')}><CloseIcon width={20} height={20} /></button>
        </header>

        <section className="rdrawer__sec">
          <div className="rdrawer__score">
            <div className="rring" style={{ ['--pct' as string]: `${score ?? 0}%` }} aria-hidden="true"><span>{score ?? '-'}{score != null && '%'}</span></div>
            <div>
              <strong>{t('scan.drawerSkills')}</strong>
              <p>{fit ? t('jobs.fitSummary', { matched: fit.matched.length, total: fit.required.length }) : t('scan.checking')}</p>
            </div>
          </div>
          {fit && (
            <ul className="rskills" data-testid="drawer-skills">
              {fit.matched.map((s) => <li key={s} className="is-ok">✓ {s}</li>)}
              {fit.partial.map((s) => <li key={s} className="is-partial" title={t('jobs.inExperience')}>~ {s}</li>)}
              {fit.missing.map((s) => <li key={s}>{s}</li>)}
            </ul>
          )}
        </section>

        <section className="rdrawer__sec">
          <div className="rdrawer__row"><strong>{t('scan.readiness')}</strong><ReadinessBadge r={r} /></div>
          <ul className="raudit__list">
            <li className={r.checks.roleLocation ? 'is-ok' : 'is-bad'}><span>{t('scan.roleLocation')}</span><strong>{r.checks.roleLocation ? `✓ ${t('scan.verified')}` : t('scan.needsUpdate')}</strong></li>
            <li className={r.checks.cv ? 'is-ok' : 'is-bad'}><span>{t('scan.cvResume')}</span><strong>{r.checks.cv ? `✓ ${t('scan.attached')}` : t('scan.missing')}</strong></li>
            <li className={r.checks.bioSkills ? 'is-ok' : 'is-bad'}><span>{t('scan.bioSkills')}</span><strong>{r.checks.bioSkills ? `✓ ${t('scan.complete')}` : t('scan.needsUpdate')}</strong></li>
          </ul>
        </section>

        <footer className="rdrawer__foot">
          <button type="button" className="rbtn rbtn--ghost" onClick={onOpenFull} data-testid="drawer-full">{t('scan.openFull')}</button>
          <button type="button" className="rbtn rbtn--primary" onClick={onApply} disabled={job.appliedByMe && !job.applyUrl} data-testid="drawer-apply">
            {!r.ready && '🔒 '}{job.applyUrl ? `${t('jobs.apply')} ↗` : job.appliedByMe ? t('jobs.applied') : t('jobs.apply')}
          </button>
        </footer>
      </div>
    </div>
  );
}

/* ─── profile status: read-only, coloured by completion ─── */
/** <50% red, 50–69% yellow, 70%+ green (the apply gate). */
export const readinessTone = (pct: number): 'bad' | 'warn' | 'ok' => (pct >= READY_GATE ? 'ok' : pct >= 50 ? 'warn' : 'bad');

export function ReadinessStatus({ r }: { r: Readiness }) {
  const { t } = useTranslation();
  const tone = readinessTone(r.completion);
  const bands = [
    { tone: 'bad' as const, label: t('scan.status.low') },
    { tone: 'warn' as const, label: t('scan.status.mid') },
    { tone: 'ok' as const, label: t('scan.status.high') },
  ];
  return (
    <div className={`rstatus rstatus--${tone}`} role="status" aria-label={t('scan.status.aria', { pct: r.completion })} data-testid="profile-status" data-tone={tone}>
      <span className="rstatus__label">{t('scan.status.label')} <b>{r.completion}%</b></span>
      {bands.map((b) => (
        <span key={b.tone} className={`rstatus__band${b.tone === tone ? ` is-on is-${b.tone}` : ''}`} aria-hidden={b.tone !== tone}>{b.label}</span>
      ))}
    </div>
  );
}
