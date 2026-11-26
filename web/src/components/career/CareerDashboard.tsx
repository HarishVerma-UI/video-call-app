// Resume studio screens built on masterCV: the status bar, the Career Dashboard
// (CV upload + optical laser scan, Live Skill & ATS Analyzer, toolkit) and
// My Profile & Sync.
import { useEffect, useRef, useState, type DragEvent, type FormEvent, type ReactNode } from 'react';
import { cvErrorText } from '../../profile/ProfileContext';
import { ROLES, atsTone } from './ats';
import { PERSONAS, READY_GATE, SCAN_STAGES, useMasterCv } from './MasterCv';

export type StudioSection = 'dashboard' | 'cv' | 'role' | 'expert' | 'experts' | 'mock' | 'sync';

const P = {
  upload: 'M12 16V4|M7 9l5-5 5 5|M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3',
  file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z|M14 2v6h6',
  check: 'M20 6 9 17l-5-5',
  spark: 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z',
  x: 'M18 6 6 18M6 6l12 12',
  plus: 'M12 5v14M5 12h14',
  cv: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z|M14 2v6h6M9 13h6M9 17h4',
  wand: 'M15 4V2M15 10V8M12.5 6.5h-2M19.5 6.5h-2|M5 19l9-9|M17 13l4 4-2 2-4-4z',
  expert: 'M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2|M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8|M20 8v6M23 11h-6',
  mic: 'M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z|M5 11a7 7 0 0 0 14 0M12 18v4',
  sync: 'M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5|M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5',
};
const I = ({ d, size = 16 }: { d: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d.split('|').map((p, i) => <path key={i} d={p} />)}</svg>
);
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'never');

/* ================= status bar (top) ================= */
export function StudioStatus({ go }: { go: (s: StudioSection) => void }) {
  const { meta, ats, readiness, ready } = useMasterCv();
  return (
    <div className="st-status" data-testid="studio-status">
      <button className={`st-chip${meta.hasUploadedCV ? ' is-ok' : ''}`} onClick={() => go('sync')} title="Active CV">
        <I d={P.file} size={14} />
        <span className="st-chip__text">{meta.fileName || 'No CV file'}</span>
        {meta.dirty && <em className="st-dot" title="Unsaved changes">Unsaved</em>}
      </button>
      <span className={`st-badge st-badge--${atsTone(ats.score)}`} data-testid="status-ats" title="Live ATS score">ATS <b>{ats.score}</b></span>
      <span className={`st-badge st-badge--${ready ? 'good' : readiness >= 50 ? 'warn' : 'crit'}`} data-testid="status-ready" title={`Job readiness: apply needs ${READY_GATE}% and a CV file`}>
        Ready <b>{readiness}%</b><small>/ {READY_GATE}%</small>
      </span>
    </div>
  );
}

/* ================= upload + optical laser scan ================= */
type ScanState = { kind: 'file' | 'sample'; label: string; stage: number; pct: number; done: boolean; error: string; note: string };
const STAGE_MS = 650;

function useScanRunner() {
  const { uploadCv, loadSample } = useMasterCv();
  const [scan, setScan] = useState<ScanState | null>(null);
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  /** Animate the 4 stages; the last stage only completes when `work` finishes. */
  const run = (kind: ScanState['kind'], label: string, work: () => Promise<string>) => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setScan({ kind, label, stage: 0, pct: 3, done: false, error: '', note: '' });
    for (let i = 1; i < SCAN_STAGES.length; i++) {
      timers.current.push(window.setTimeout(() => setScan((s) => (s && !s.done && !s.error ? { ...s, stage: Math.max(s.stage, i), pct: Math.max(s.pct, i * 25) } : s)), i * STAGE_MS));
    }
    const minTime = new Promise((r) => { timers.current.push(window.setTimeout(r, SCAN_STAGES.length * STAGE_MS)); });
    Promise.all([work(), minTime])
      .then(([note]) => setScan((s) => (s ? { ...s, stage: SCAN_STAGES.length, pct: 100, done: true, note } : s)))
      .catch((e) => setScan((s) => (s ? { ...s, error: cvErrorText(e) } : s)));
  };
  const scanFile = (file: File) => run('file', file.name, async () => {
    const filled = await uploadCv(file);
    return filled.length ? `Saved to your profile, filled ${filled.join(', ')} from your CV.` : 'Saved to your profile. Jobs and applications now use this CV.';
  });
  const scanSample = (id: string) => {
    const p = PERSONAS.find((x) => x.id === id);
    // A sample has nothing to upload: it lands in masterCV as the "Syncing" stage runs.
    if (p) run('sample', `Sample · ${p.label}`, async () => {
      await new Promise((r) => { timers.current.push(window.setTimeout(r, (SCAN_STAGES.length - 1) * STAGE_MS + 250)); });
      loadSample(id);
      return 'Sample loaded into the studio, not saved to your profile.';
    });
  };
  return { scan, setScan, scanFile, scanSample };
}

function ScanPanel({ scan, onClose }: { scan: ScanState; onClose: () => void }) {
  return (
    <div className={`st-scan${scan.done ? ' is-done' : ''}${scan.error ? ' is-error' : ''}`} data-testid="cv-scan" role="status" aria-live="polite">
      <div className="st-scan__doc" aria-hidden="true">
        <i /><i /><i /><i /><i /><i /><i />
        {!scan.done && !scan.error && <span className="st-scan__laser" />}
      </div>
      <div className="st-scan__body">
        <div className="st-scan__head">
          <strong>{scan.error ? 'Scan failed' : scan.done ? 'Scan complete' : 'Optical CV scan'}</strong>
          <span className="st-scan__pct" data-testid="scan-pct">{scan.error ? '-' : `${scan.pct}%`}</span>
        </div>
        <span className="st-scan__file">{scan.label}</span>
        <div className="st-scan__bar"><span style={{ width: `${scan.error ? 100 : scan.pct}%` }} /></div>
        <ol className="st-scan__steps">
          {SCAN_STAGES.map((label, i) => {
            const state = scan.error && i === scan.stage ? 'err' : i < scan.stage || scan.done ? 'done' : i === scan.stage ? 'on' : '';
            return <li key={label} className={state ? `is-${state}` : ''}><span className="st-step__ic">{state === 'done' ? <I d={P.check} size={12} /> : state === 'err' ? '!' : i + 1}</span>{label}</li>;
          })}
        </ol>
        {(scan.done || scan.error) && (
          <div className="st-scan__foot">
            <p className={scan.error ? 'st-err' : ''}>{scan.error || scan.note}</p>
            <button className="aa-btn aa-btn--sm" onClick={onClose}>{scan.error ? 'Try again' : 'Done'}</button>
          </div>
        )}
      </div>
    </div>
  );
}

function UploadCard() {
  const { meta } = useMasterCv();
  const { scan, setScan, scanFile, scanSample } = useScanRunner();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const busy = !!scan && !scan.done && !scan.error;
  const onDrop = (e: DragEvent) => {
    e.preventDefault(); setOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f && !busy) scanFile(f);
  };
  return (
    <section className="aa-card st-card st-upload" data-testid="cv-upload-card">
      <div className="st-card__head">
        <div><h3>Your CV</h3><p>Upload once, we read it, score it and sync your profile, jobs and every tool here.</p></div>
        {meta.hasUploadedCV && <span className="st-pill st-pill--ok"><I d={P.check} size={12} /> {meta.fileName}</span>}
      </div>
      {scan ? <ScanPanel scan={scan} onClose={() => setScan(null)} /> : (
        <div
          className={`st-drop${over ? ' is-over' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={onDrop}
          onClick={() => input.current?.click()} role="button" tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.current?.click(); } }}
          data-testid="cv-drop"
        >
          <span className="st-drop__ic"><I d={P.upload} size={22} /></span>
          <strong>{meta.hasUploadedCV ? 'Drop a new CV to replace it' : 'Drag & drop your CV here'}</strong>
          <span>or <u>browse files</u> · PDF, DOC, DOCX or TXT · up to 5 MB</span>
        </div>
      )}
      <input ref={input} type="file" accept=".pdf,.doc,.docx,.txt" hidden data-testid="cv-file-input"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) scanFile(f); e.target.value = ''; }} />
      <div className="st-demo">
        <span>Or try a demo persona:</span>
        {PERSONAS.map((p) => (
          <button key={p.id} className="st-demo__btn" onClick={() => scanSample(p.id)} disabled={busy} data-testid={`demo-${p.id}`}>
            <I d={P.spark} size={13} /> {p.label}
          </button>
        ))}
      </div>
    </section>
  );
}

/* ================= Live Skill & ATS Analyzer ================= */
function ScoreRing({ score, size = 112 }: { score: number; size?: number }) {
  const r = size / 2 - 9;
  const c = 2 * Math.PI * r;
  return (
    <div className={`st-ring st-ring--${atsTone(score)}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} className="st-ring__track" />
        <circle cx={size / 2} cy={size / 2} r={r} className="st-ring__val" strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} />
      </svg>
      <div className="st-ring__label"><b data-testid="ats-score">{score}</b><span>ATS score</span></div>
    </div>
  );
}

export function SkillEditor({ compact = false }: { compact?: boolean }) {
  const { cv, setCv } = useMasterCv();
  const [draft, setDraft] = useState('');
  const add = (raw: string) => {
    const names = raw.split(',').map((s) => s.trim()).filter(Boolean);
    if (!names.length) return;
    setCv((c) => {
      const have = new Set(c.skills.map((s) => s.toLowerCase()));
      return { ...c, skills: [...c.skills, ...names.filter((n) => !have.has(n.toLowerCase()))] };
    });
    setDraft('');
  };
  const remove = (s: string) => setCv((c) => ({ ...c, skills: c.skills.filter((x) => x !== s) }));
  const submit = (e: FormEvent) => { e.preventDefault(); add(draft); };
  return (
    <div className={`st-skills${compact ? ' st-skills--compact' : ''}`}>
      <div className="st-chips" data-testid="skill-chips">
        {cv.skills.length === 0 && <span className="st-muted">No skills yet, add a few below.</span>}
        {cv.skills.map((s) => (
          <span key={s} className="st-chip-skill">{s}<button onClick={() => remove(s)} aria-label={`Remove ${s}`}><I d={P.x} size={11} /></button></span>
        ))}
      </div>
      <form className="st-skill-add" onSubmit={submit}>
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add a skill (comma-separate several)" aria-label="Add a skill" data-testid="skill-input" />
        <button className="aa-btn aa-btn--sm aa-btn--primary" type="submit" disabled={!draft.trim()}><I d={P.plus} size={13} /> Add</button>
      </form>
    </div>
  );
}

function AtsAnalyzer() {
  const { cv, ats, meta, setRole, setCv } = useMasterCv();
  const addKeyword = (k: string) => setCv((c) => (c.skills.some((s) => s.toLowerCase() === k.toLowerCase()) ? c : { ...c, skills: [...c.skills, k] }));
  return (
    <section className="aa-card st-card st-analyzer" data-testid="ats-analyzer">
      <div className="st-card__head">
        <div><h3>Live Skill &amp; ATS Analyzer</h3><p>Every skill you add or remove re-scores your CV instantly.</p></div>
        <label className="st-role">
          <span>Target role</span>
          <select value={meta.roleId ?? ''} onChange={(e) => setRole(e.target.value || null)} data-testid="ats-role">
            <option value="">Auto · {ats.role.label}</option>
            {ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </label>
      </div>
      <div className="st-analyzer__grid">
        <div className="st-analyzer__score">
          <ScoreRing score={ats.score} />
          <ul className="st-parts">
            {ats.parts.map((p) => (
              <li key={p.id}>
                <div className="st-parts__row"><span>{p.label}</span><b>{p.got}/{p.max}</b></div>
                <div className="st-parts__bar"><span style={{ width: `${(p.got / p.max) * 100}%` }} /></div>
                <small>{p.tip}</small>
              </li>
            ))}
          </ul>
        </div>
        <div className="st-analyzer__kw">
          <div className="st-kw">
            <h4>Matched keywords <span>{ats.matched.length}/{ats.role.keywords.length}</span></h4>
            <div className="st-chips">
              {ats.matched.length ? ats.matched.map((k) => <span key={k} className="st-kw-chip is-hit"><I d={P.check} size={11} /> {k}</span>) : <span className="st-muted">None yet</span>}
            </div>
          </div>
          <div className="st-kw">
            <h4>Missing (tap to add) <span>{ats.missing.length}</span></h4>
            <div className="st-chips" data-testid="ats-missing">
              {ats.missing.length ? ats.missing.map((k) => <button key={k} className="st-kw-chip is-miss" onClick={() => addKeyword(k)}><I d={P.plus} size={11} /> {k}</button>) : <span className="st-muted">All covered, nice.</span>}
            </div>
            <p className="st-muted st-kw__note">Only add skills you really have, recruiters will ask about them.</p>
          </div>
          <div className="st-kw">
            <h4>Your skills <span>{cv.skills.length}</span></h4>
            <SkillEditor compact />
          </div>
        </div>
      </div>
    </section>
  );
}

/* ================= readiness + sync summary ================= */
function ReadinessCard({ go }: { go: (s: StudioSection) => void }) {
  const { cv, meta, readiness, ready, saveToProfile } = useMasterCv();
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const save = async () => { setSaving(true); setErr(''); try { await saveToProfile(); } catch (e) { setErr(cvErrorText(e)); } finally { setSaving(false); } };
  const tone = ready ? 'good' : readiness >= 50 ? 'warn' : 'crit';
  return (
    <section className="aa-card st-card st-ready" data-testid="readiness-card">
      <div className="st-card__head"><div><h3>Job readiness</h3><p>Applying needs {READY_GATE}% and a CV file.</p></div><span className={`st-badge st-badge--${tone}`}><b>{readiness}%</b></span></div>
      <div className="st-gate">
        <div className={`st-gate__bar st-gate__bar--${tone}`}><span style={{ width: `${readiness}%` }} /><i style={{ left: `${READY_GATE}%` }} title={`${READY_GATE}% gate`} /></div>
        <div className="st-gate__legend"><span>0%</span><span style={{ left: `${READY_GATE}%` }}>{READY_GATE}% gate</span><span>100%</span></div>
      </div>
      <ul className="st-facts">
        <li><span>Name</span><b>{cv.name || '-'}</b></li>
        <li><span>Headline</span><b>{cv.title || '-'}</b></li>
        <li><span>CV file</span><b>{meta.hasUploadedCV ? meta.fileName : 'Not uploaded'}</b></li>
        <li><span>Last synced</span><b>{when(meta.lastSyncedAt)}</b></li>
      </ul>
      {meta.dirty ? (
        <div className="st-unsaved">
          <span>{meta.source === 'sample' ? 'Sample CV in use, your profile is unchanged.' : 'You have changes that Jobs and recruiters don’t see yet.'}</span>
          <button className="aa-btn aa-btn--sm aa-btn--primary" onClick={() => void save()} disabled={saving} data-testid="dash-save">{saving ? 'Saving…' : 'Save & sync'}</button>
        </div>
      ) : <p className="st-synced"><I d={P.check} size={13} /> In sync with your profile and Jobs</p>}
      {err && <p className="aa-msg">{err}</p>}
      <button className="aa-btn aa-btn--sm st-ready__link" onClick={() => go('sync')}>Open My Profile &amp; Sync</button>
    </section>
  );
}

/* ================= DASHBOARD ================= */
export function StudioDashboard({ go }: { go: (s: StudioSection) => void }) {
  const tools: { id: StudioSection; icon: string; title: string; desc: string }[] = [
    { id: 'cv', icon: P.cv, title: 'CV Generator', desc: '10 templates, live edit, PDF / CSV / public link' },
    { id: 'role', icon: P.wand, title: 'AI CV Builder', desc: 'Answer 3 questions, AI writes your CV' },
    { id: 'expert', icon: P.expert, title: 'Expert CV Review', desc: '30-minute session with a specialist' },
    { id: 'mock', icon: P.mic, title: 'Mock Interview', desc: '1:1 practice with instant feedback' },
    { id: 'sync', icon: P.sync, title: 'My Profile & Sync', desc: 'Edit details and sync everywhere' },
  ];
  return (
    <div className="st-dash">
      <div className="st-dash__top">
        <UploadCard />
        <ReadinessCard go={go} />
      </div>
      <AtsAnalyzer />
      <section className="aa-card st-card">
        <div className="st-card__head"><div><h3>Career toolkit</h3><p>Everything uses the same CV, changes show up everywhere instantly.</p></div></div>
        <div className="st-tools">
          {tools.map((t) => (
            <button key={t.id} className="st-tool" onClick={() => go(t.id)}>
              <span className="st-tool__ic"><I d={t.icon} size={18} /></span>
              <strong>{t.title}</strong><span>{t.desc}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

/* ================= MY PROFILE & SYNC ================= */
function Row({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return <label className={`aa-field${wide ? ' aa-field--wide' : ''}`}><span>{label}</span>{children}</label>;
}
export function ProfileSyncPage({ go }: { go: (s: StudioSection) => void }) {
  const { cv, meta, setCv, saveToProfile, pullFromProfile, readiness, ats } = useMasterCv();
  const { scan, setScan, scanFile } = useScanRunner();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<'' | 'save' | 'pull'>('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (k: 'name' | 'title' | 'email' | 'phone' | 'location' | 'summary', v: string) => setCv((c) => ({ ...c, [k]: v }));

  const save = async () => {
    setBusy('save'); setMsg(null);
    try { await saveToProfile(); setMsg({ ok: true, text: 'Saved. Your profile, Jobs, applications and every Resume tool now use this CV.' }); }
    catch (e) { setMsg({ ok: false, text: cvErrorText(e) }); }
    finally { setBusy(''); }
  };
  const pull = async () => {
    if (meta.dirty && !confirm('Discard your unsaved changes and reload your saved profile?')) return;
    setBusy('pull'); setMsg(null);
    try { await pullFromProfile(); setMsg({ ok: true, text: 'Reloaded from your saved profile.' }); }
    catch (e) { setMsg({ ok: false, text: cvErrorText(e) }); }
    finally { setBusy(''); }
  };

  return (
    <div className="st-sync">
      <div className="st-sync__main">
        <section className="aa-card aa-form st-card">
          <div className="st-card__head"><div><h3>Profile details</h3><p>These fields are your CV everywhere in Huddle.</p></div></div>
          <div className="aa-form__grid">
            <Row label="Name on CV"><input value={cv.name} onChange={(e) => set('name', e.target.value)} data-testid="sync-name" /></Row>
            <Row label="Headline / target role"><input value={cv.title} onChange={(e) => set('title', e.target.value)} data-testid="sync-title" /></Row>
            <Row label="Email on CV"><input type="email" value={cv.email} onChange={(e) => set('email', e.target.value)} /></Row>
            <Row label="Mobile"><input value={cv.phone} onChange={(e) => set('phone', e.target.value)} /></Row>
            <Row label="Location"><input value={cv.location} onChange={(e) => set('location', e.target.value)} /></Row>
          </div>
          <Row label="Professional summary" wide><textarea rows={4} value={cv.summary} onChange={(e) => set('summary', e.target.value)} data-testid="sync-summary" /></Row>
          <p className="st-muted">Name and email on CV are used in downloads and public links but aren’t saved to your profile, after a reload they show your account name and email (change those in Huddle Settings). Everything else here is saved by “Save &amp; sync”.</p>
        </section>
        <section className="aa-card st-card">
          <div className="st-card__head"><div><h3>Skills</h3><p>ATS score {ats.score}, updates as you edit.</p></div></div>
          <SkillEditor />
        </section>
        <section className="aa-card st-card">
          <div className="st-card__head">
            <div><h3>Experience &amp; education</h3><p>{cv.experience.length} role{cv.experience.length === 1 ? '' : 's'} · {cv.education.length} qualification{cv.education.length === 1 ? '' : 's'}</p></div>
            <button className="aa-btn aa-btn--sm" onClick={() => go('cv')}>Edit in CV Generator</button>
          </div>
          <ul className="st-facts">
            {cv.experience.map((e, i) => <li key={`e${i}`}><span>{[e.start, e.end].filter(Boolean).join(' – ') || 'Role'}</span><b>{e.title}{e.company ? ` · ${e.company}` : ''}</b></li>)}
            {cv.education.map((e, i) => <li key={`d${i}`}><span>{e.year || 'Education'}</span><b>{e.degree}{e.school ? ` · ${e.school}` : ''}</b></li>)}
            {!cv.experience.length && !cv.education.length && <li><span>-</span><b>Nothing yet</b></li>}
          </ul>
        </section>
      </div>
      <aside className="st-sync__side">
        <section className="aa-card st-card st-sync__panel" data-testid="sync-panel">
          <h3>Sync status</h3>
          <ul className="st-facts">
            <li><span>Status</span><b className={meta.dirty ? 'st-warn' : 'st-ok'} data-testid="sync-state">{meta.dirty ? 'Unsaved changes' : 'In sync'}</b></li>
            <li><span>Source</span><b>{{ empty: 'Empty', profile: 'Your profile', upload: 'Uploaded CV', sample: 'Demo sample', ai: 'AI CV Builder', edited: 'Your edits' }[meta.source]}</b></li>
            <li><span>Last synced</span><b>{when(meta.lastSyncedAt)}</b></li>
            <li><span>Job readiness</span><b>{readiness}% / {READY_GATE}%</b></li>
            <li><span>ATS score</span><b>{ats.score}</b></li>
          </ul>
          <button className="aa-btn aa-btn--primary st-sync__save" onClick={() => void save()} disabled={!!busy || !meta.dirty} data-testid="sync-save">
            <I d={P.sync} size={14} /> {busy === 'save' ? 'Saving…' : meta.dirty ? 'Save & sync everywhere' : 'Everything is saved'}
          </button>
          <button className="aa-btn aa-btn--sm" onClick={() => void pull()} disabled={!!busy}>{busy === 'pull' ? 'Reloading…' : 'Reload from saved profile'}</button>
          {msg && <p className={`aa-msg${msg.ok ? ' aa-msg--ok' : ''}`} role="status">{msg.text}</p>}
        </section>
        <section className="aa-card st-card">
          <h3>CV file</h3>
          <p className="st-muted">{meta.hasUploadedCV ? meta.fileName : 'No CV file attached yet.'}</p>
          {scan ? <ScanPanel scan={scan} onClose={() => setScan(null)} /> : (
            <button className="aa-btn aa-btn--sm" onClick={() => input.current?.click()}><I d={P.upload} size={13} /> {meta.hasUploadedCV ? 'Replace CV file' : 'Upload CV file'}</button>
          )}
          <input ref={input} type="file" accept=".pdf,.doc,.docx,.txt" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) scanFile(f); e.target.value = ''; }} />
        </section>
      </aside>
    </div>
  );
}
