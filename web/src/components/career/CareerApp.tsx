// Resume (route /career) — a full-screen member app built the same way as the admin and
// recruiter consoles (the isolated .admin-app / aa- shell), bundling every career
// tool: a multi-template CV generator with live preview, the AI CV builder chat,
// and expert CV session requests. Real profile data comes from Huddle.
import {
  useCallback, useEffect, useMemo, useRef, useState,
  type FormEvent, type ReactNode,
} from 'react';
import type { CvChatMessage, Education, Experience } from '@vca/shared';
import { useAuth } from '../../auth/AuthContext';
import { cvErrorText, useProfile } from '../../profile/ProfileContext';
import { useMoney } from '../../i18n';
import { CvExportBar } from './CvExport';
import { ProfileSyncPage, StudioDashboard, StudioStatus, type StudioSection } from './CareerDashboard';
import { EMPTY_CV, MasterCvProvider, PERSONAS, useMasterCv } from './MasterCv';
import { CV_LABELS, CvPaper, initials, type CvData, type TemplateId } from './CvPaper';
import '../../admin.css';
import './career.css';

/* ================= model ================= */
/** The CV file on the member's profile — the same one recruiters and the Jobs page see. */
function MyCvCard() {
  const { meta, uploadCv } = useMasterCv();
  const { profile } = useProfile();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const onFile = async (file?: File) => {
    if (!file) return;
    setBusy(true); setMsg(null);
    try {
      const filled = await uploadCv(file);
      setMsg({ ok: true, text: filled.length ? `CV uploaded — filled ${filled.join(', ')} from it.` : 'CV uploaded and attached to your profile.' });
    } catch (e) { setMsg({ ok: false, text: cvErrorText(e) }); }
    finally { setBusy(false); if (input.current) input.current.value = ''; }
  };
  return (
    <div className="aa-card cp-card cp-mycv cp-noprint" data-testid="my-cv">
      <span className={`cp-mycv__icon${meta.hasUploadedCV ? ' is-on' : ''}`}><Ic d={ICON.cv} size={18} /></span>
      <div className="cp-mycv__info">
        <strong>{meta.hasUploadedCV ? 'Your uploaded CV' : 'No CV uploaded yet'}</strong>
        <span>
          {meta.hasUploadedCV
            ? (profile?.cvUrl ? <a href={profile.cvUrl} target="_blank" rel="noopener noreferrer" data-testid="my-cv-link">{meta.fileName || 'Download CV'}</a> : meta.fileName || 'CV attached')
            : 'Upload it once — we fill your profile and this builder from it, and use it for job applications.'}
        </span>
        {msg && <span className={msg.ok ? 'cp-mycv__ok' : 'cp-mycv__err'} role="status">{msg.text}</span>}
      </div>
      <input ref={input} type="file" accept=".pdf,.doc,.docx,.txt" hidden onChange={(e) => void onFile(e.target.files?.[0])} data-testid="my-cv-file" />
      <button className="aa-btn aa-btn--primary" onClick={() => input.current?.click()} disabled={busy}>
        <Ic d={ICON.cv} size={15} /> {busy ? 'Reading CV…' : meta.hasUploadedCV ? 'Replace & auto-fill' : 'Upload CV & auto-fill'}
      </button>
    </div>
  );
}

const TEMPLATES: { id: TemplateId; name: string; desc: string; colors: string[] }[] = [
  { id: 'modern-tech', name: 'Modern Tech Clean', desc: 'Two columns, dark rail, pill skills', colors: ['#0b132b', '#4f46e5', '#fff'] },
  { id: 'executive-classic', name: 'Executive Classic', desc: 'Serif, centered header, formal', colors: ['#f8fafc', '#1e293b', '#cbd5e1'] },
  { id: 'minimalist-creative', name: 'Minimalist Creative', desc: 'Whitespace, oversized name', colors: ['#fff', '#6366f1', '#e2e8f0'] },
  { id: 'startup-compact', name: 'Startup & Compact', desc: 'Dense one-page, two columns', colors: ['#eff6ff', '#2563eb', '#fff'] },
  { id: 'ats-pro', name: 'ATS & Ivy League', desc: 'ATS-safe, clean hierarchy', colors: ['#fff', '#111827', '#d1d5db'] },
  { id: 'split-banner', name: 'Split Banner Pro', desc: 'Full-width header, two-column body', colors: ['#1e1b4b', '#4f46e5', '#fff'] },
  { id: 'timeline-eng', name: 'Timeline Engineer', desc: 'Career timeline, monospace accents', colors: ['#fff', '#0f766e', '#ccfbf1'] },
  { id: 'nordic-right', name: 'Nordic Right Rail', desc: 'Soft sidebar, crisp grid', colors: ['#fff', '#0284c7', '#f1f5f9'] },
  { id: 'bold-editorial', name: 'Bold Editorial', desc: 'Left accent bar, split header', colors: ['#fff', '#e11d48', '#ffe4e6'] },
  { id: 'modern-geometric', name: 'Modern Geometric', desc: 'Tinted header and initials badge', colors: ['#eef2ff', '#4f46e5', '#fff'] },
];

/* ================= helpers ================= */
function Ic({ d, size = 18 }: { d: string; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">{d.split('|').map((p, i) => <path key={i} d={p} />)}</svg>;
}
const ICON = {
  dash: 'M4 4h6v8H4z|M14 4h6v5h-6z|M14 13h6v7h-6z|M4 16h6v4H4z',
  cv: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z|M14 2v6h6M9 13h6M9 17h4',
  wand: 'M15 4V2M15 10V8M12.5 6.5h-2M19.5 6.5h-2|M5 19l9-9|M17 13l4 4-2 2-4-4z',
  target: 'M12 12m-9 0a9 9 0 1 0 18 0 9 9 0 1 0-18 0|M12 12m-5 0a5 5 0 1 0 10 0 5 5 0 1 0-10 0|M12 12m-1 0a1 1 0 1 0 2 0 1 1 0 1 0-2 0',
  expert: 'M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2|M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8|M20 8v6M23 11h-6',
  clock: 'M12 8v4l3 2|M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  calendar: 'M8 2v4M16 2v4M3 10h18|M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2z',
  shield: 'M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11z|M9 12l2 2 4-4',
  search: 'm21 21-4.3-4.3|M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16z',
  next: 'M5 12h14|M13 6l6 6-6 6',
  copy: 'M9 9h10v10H9z|M5 15V5h10',
  print: 'M6 9V3h12v6|M6 18H4v-6h16v6h-2|M8 14h8v6H8z',
  plus: 'M12 5v14M5 12h14',
  trash: 'M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13',
  back: 'M15 18l-6-6 6-6',
  menu: 'M4 6h16M4 12h16M4 18h16',
  check: 'M20 6 9 17l-5-5',
  sync: 'M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5|M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5',
  spark: 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z',
};
async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; }
  catch { return false; }
}
function cvToText(cv: CvData, t: typeof CV_LABELS): string {
  const lines = [cv.name, cv.title, [cv.email, cv.phone, cv.location].filter(Boolean).join(' · '), '', t.summary.toUpperCase(), cv.summary, ''];
  lines.push(t.experience.toUpperCase());
  cv.experience.forEach((e) => { lines.push(`${e.title} — ${e.company} (${[e.start, e.end].filter(Boolean).join('–')})`); if (e.description) lines.push(e.description); lines.push(''); });
  lines.push(t.education.toUpperCase());
  cv.education.forEach((e) => lines.push(`${e.degree}, ${e.school} ${e.year ?? ''}`.trim()));
  lines.push('', t.skills.toUpperCase(), cv.skills.join(', '));
  return lines.join('\n');
}

/* ================= CV GENERATOR ================= */
function Field({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return <label className={`aa-field${wide ? ' aa-field--wide' : ''}`}><span>{label}</span>{children}</label>;
}
function CvGeneratorPage() {
  const { cv, setCv, meta, ats, pullFromProfile, loadSample } = useMasterCv();
  const [tpl, setTpl] = useState<TemplateId>('modern-tech');
  const [msg, setMsg] = useState('');
  const [syncing, setSyncing] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const [previewScale, setPreviewScale] = useState(1);
  const t = CV_LABELS;
  const set = <K extends keyof CvData>(k: K, v: CvData[K]) => setCv((c) => ({ ...c, [k]: v }));

  useEffect(() => {
    const updateScale = () => {
      const width = previewRef.current?.clientWidth;
      if (width) setPreviewScale(Math.min(1, Math.max(0.42, (width - 36) / 794)));
    };
    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, []);

  const syncFromProfile = async () => {
    if (meta.dirty && !confirm('Replace your unsaved changes with your saved profile?')) return;
    setSyncing(true); setMsg('');
    try { await pullFromProfile(); setMsg('Synced from your Huddle profile.'); }
    catch { setMsg('Could not reach your profile — nothing changed.'); }
    finally { setSyncing(false); }
  };
  const copy = async () => setMsg((await copyText(cvToText(cv, t))) ? 'CV text copied to clipboard.' : 'Copy failed — select the preview manually.');

  const setExp = (i: number, k: keyof Experience, v: string) => setCv((c) => ({ ...c, experience: c.experience.map((e, j) => j === i ? { ...e, [k]: v } : e) }));
  const addExp = () => setCv((c) => ({ ...c, experience: [...c.experience, { title: '', company: '', start: '', end: '', description: '' }] }));
  const delExp = (i: number) => setCv((c) => ({ ...c, experience: c.experience.filter((_, j) => j !== i) }));
  const setEdu = (i: number, k: keyof Education, v: string) => setCv((c) => ({ ...c, education: c.education.map((e, j) => j === i ? { ...e, [k]: v } : e) }));
  const addEdu = () => setCv((c) => ({ ...c, education: [...c.education, { degree: '', school: '', year: '' }] }));
  const delEdu = (i: number) => setCv((c) => ({ ...c, education: c.education.filter((_, j) => j !== i) }));
  const activeTemplate = TEMPLATES.find((x) => x.id === tpl) ?? TEMPLATES[0];

  return (
    <div className="cp-workspace">
      <div className="cp-toolbar aa-toolbar cp-noprint">
        <button className="aa-btn" onClick={syncFromProfile} disabled={syncing}><Ic d={ICON.sync} size={15} /> {syncing ? 'Syncing…' : 'Sync from my profile'}</button>
        <select className="aa-btn cp-sample-select" value="" aria-label="Load a sample persona"
          onChange={(e) => { const p = PERSONAS.find((x) => x.id === e.target.value); if (!p) return; if (meta.dirty && !confirm('Replace your unsaved changes with a sample CV?')) return; loadSample(p.id); setMsg(`Sample loaded: ${p.label}. It isn’t saved to your profile.`); }}>
          <option value="">Load sample…</option>
          {PERSONAS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        <span className="aa-spacer" />
        <button className="aa-btn" onClick={copy}><Ic d={ICON.copy} size={15} /> Copy text</button>
        <CvExportBar cv={cv} tpl={tpl} />
      </div>
      <MyCvCard />
      {msg && <p className="aa-msg aa-msg--ok cp-noprint" role="status">{msg}</p>}
      <div className="cp-grid">
        <div className="cp-stack cp-noprint">
          <div className="aa-card cp-card">
            <div className="cp-card__head">
              <div><h3>Top 10 Templates</h3><span className="cp-card__eyebrow">Choose a layout</span></div>
              <span className="cp-active-template">{activeTemplate.name}</span>
            </div>
            <div className="cp-templates">
              {TEMPLATES.map((x, i) => (
                <button key={x.id} className={`cp-tpl${tpl === x.id ? ' is-on' : ''}`} onClick={() => setTpl(x.id)} aria-pressed={tpl === x.id}>
                  <span className={`cp-thumb cp-thumb--${x.id}`} aria-hidden="true">
                    <i /><i /><i /><i /><i />
                    <b>#{i + 1}</b>
                  </span>
                  <span className="cp-tpl__name">{x.name}</span>
                  <span className="cp-tpl__desc">{x.desc}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="aa-card aa-form cp-card">
            <div className="aa-card__head"><h3>Details</h3></div>
            <div className="aa-form__grid cp-details-grid">
              <Field label="Full name"><input value={cv.name} onChange={(e) => set('name', e.target.value)} /></Field>
              <Field label="Professional title"><input value={cv.title} onChange={(e) => set('title', e.target.value)} /></Field>
              <Field label="Email"><input type="email" value={cv.email} onChange={(e) => set('email', e.target.value)} /></Field>
              <Field label="Phone"><input value={cv.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
              <Field label="Location"><input value={cv.location} onChange={(e) => set('location', e.target.value)} /></Field>
            </div>
            <Field label="Summary" wide><textarea rows={3} value={cv.summary} onChange={(e) => set('summary', e.target.value)} /></Field>
            <Field label="Skills (comma separated)" wide><input value={cv.skills.join(', ')} onChange={(e) => set('skills', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))} /></Field>
          </div>

          <div className="aa-card aa-form cp-card">
            <div className="aa-card__head"><h3>Experience</h3><button className="aa-btn aa-btn--sm" onClick={addExp}><Ic d={ICON.plus} size={14} /> Add</button></div>
            {cv.experience.length === 0 && <p className="cp-empty-note">No experience yet — add a role or sync from your profile.</p>}
            {cv.experience.map((e, i) => (
              <div key={i} className="cp-entry">
                <div className="cp-entry__head"><span>Role {i + 1}</span><button className="aa-btn aa-btn--sm aa-btn--danger" onClick={() => delExp(i)}><Ic d={ICON.trash} size={13} /> Remove</button></div>
                <div className="aa-form__grid cp-details-grid">
                  <Field label="Role"><input value={e.title} onChange={(ev) => setExp(i, 'title', ev.target.value)} /></Field>
                  <Field label="Company"><input value={e.company} onChange={(ev) => setExp(i, 'company', ev.target.value)} /></Field>
                  <Field label="Start"><input value={e.start ?? ''} onChange={(ev) => setExp(i, 'start', ev.target.value)} /></Field>
                  <Field label="End"><input value={e.end ?? ''} onChange={(ev) => setExp(i, 'end', ev.target.value)} /></Field>
                </div>
                <Field label="Highlights (one per line)" wide><textarea rows={3} value={e.description ?? ''} onChange={(ev) => setExp(i, 'description', ev.target.value)} /></Field>
              </div>
            ))}
          </div>

          <div className="aa-card aa-form cp-card">
            <div className="aa-card__head"><h3>Education</h3><button className="aa-btn aa-btn--sm" onClick={addEdu}><Ic d={ICON.plus} size={14} /> Add</button></div>
            {cv.education.length === 0 && <p className="cp-empty-note">Add a qualification or sync it from your profile.</p>}
            {cv.education.map((e, i) => (
              <div key={i} className="cp-entry">
                <div className="cp-entry__head"><span>Education {i + 1}</span><button className="aa-btn aa-btn--sm aa-btn--danger" onClick={() => delEdu(i)}><Ic d={ICON.trash} size={13} /> Remove</button></div>
                <div className="aa-form__grid cp-details-grid">
                  <Field label="Degree"><input value={e.degree} onChange={(ev) => setEdu(i, 'degree', ev.target.value)} /></Field>
                  <Field label="Year"><input value={e.year} onChange={(ev) => setEdu(i, 'year', ev.target.value)} /></Field>
                  <Field label="University / Institution" wide><input value={e.school} onChange={(ev) => setEdu(i, 'school', ev.target.value)} /></Field>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="cp-stack cp-preview-column">
          <div className="cp-preview-heading cp-noprint">
            <div><h3>Live preview</h3><p>Your changes update the CV instantly — ATS score <b data-testid="gen-ats">{ats.score}</b>.</p></div>
            <span>{activeTemplate.name}</span>
          </div>
          <div className="cp-preview-wrap" ref={previewRef}>
            <div className="cp-preview-sized" style={{ width: 794 * previewScale, height: 1123 * previewScale }}>
              <div className="cp-preview-scale" style={{ transform: `scale(${previewScale})` }}>
                <CvPaper cv={cv} tpl={tpl} t={t} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ================= AI ROLE BUILDER ================= */
/* ─── AI CV builder: chat with Gemini (server-side), live CV preview ─── */
const CHAT_KEY = 'huddle.cvChat.v3'; // v3: the CV itself lives in masterCV
/** The conversation only — the CV it builds is masterCV, shared with every other screen. */
type ChatState = { messages: CvChatMessage[]; progress: number; suggestions: string[] };

function AiCvChatPage({ go }: { go: (s: Section) => void }) {
  const { cv, setCv, saveToProfile: saveMaster, ats } = useMasterCv();
  const { api, user } = useAuth();
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [state, setState] = useState<ChatState | null>(() => {
    try { const raw = sessionStorage.getItem(CHAT_KEY); return raw ? JSON.parse(raw) as ChatState : null; } catch { return null; }
  });
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [slow, setSlow] = useState(false);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.6);

  useEffect(() => { api.cvChatStatus().then((r) => setConfigured(r.configured)).catch(() => setConfigured(false)); }, [api]);

  // Start a conversation from the current masterCV (so known facts aren't asked again).
  const fresh = useCallback((): ChatState => {
    const draft = cv;
    const first = (user?.name ?? '').split(' ')[0];
    const known = draft.title ? ` I can see you're a ${draft.title} — I'll use what's on your profile.` : '';
    return {
      messages: [{ role: 'assistant', text: `Hi${first ? ` ${first}` : ''}! 👋 I'm your AI CV Co-Pilot. Answer 3 quick questions — or just tap a suggestion — and I'll write a job-ready CV for you.${known}\n\nFirst: what job are you looking for?` }],
      progress: draft.experience.length ? 25 : 5,
      suggestions: draft.title
        ? [draft.title, 'A senior role in my field', 'Switch to a new field', 'Not sure yet — help me']
        : ['Customer support / BPO', 'Software engineer', 'Sales executive', 'Nurse / healthcare', 'Chef / hospitality', 'Fresher — first job'],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.name, cv.title, cv.experience.length]);
  useEffect(() => { if (!state && user) setState(fresh()); }, [state, user, fresh]);
  useEffect(() => { try { if (state) sessionStorage.setItem(CHAT_KEY, JSON.stringify(state)); } catch { /* ignore */ } }, [state]);
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }); }, [state?.messages.length, busy]);
  useEffect(() => {
    const fit = () => { const w = previewRef.current?.clientWidth; if (w) setScale(Math.min(1, Math.max(0.36, (w - 24) / 794))); };
    fit(); window.addEventListener('resize', fit); return () => window.removeEventListener('resize', fit);
  }, []);

  const send = async (text: string) => {
    const msg = text.trim();
    if (!msg || busy || !state) return;
    const messages: CvChatMessage[] = [...state.messages, { role: 'user', text: msg }];
    setState({ ...state, messages, suggestions: [] });
    setInput(''); setErr(''); setNote(''); setBusy(true); setSlow(false);
    const slowTimer = setTimeout(() => setSlow(true), 8000);
    try {
      const r = await api.cvChat({ messages, cv });
      setCv(() => ({ ...EMPTY_CV, ...r.cv }), 'ai'); // straight into masterCV — every screen updates
      setState({ messages: [...messages, { role: 'assistant', text: r.reply }], progress: r.progress, suggestions: r.suggestions });
    } catch (e) {
      setErr(cvErrorText(e));
      setState((s) => (s ? { ...s, messages: messages.slice(0, -1) } : s)); // let them resend
      setInput(msg);
    } finally {
      clearTimeout(slowTimer); setBusy(false); setSlow(false);
    }
  };

  const openInGenerator = () => go('cv'); // same masterCV — nothing to copy
  const saveToProfile = async () => {
    try { await saveMaster(); setNote('Saved to your profile — Jobs, applications and every Resume tool now use it.'); }
    catch (e) { setErr(cvErrorText(e)); }
  };
  const restart = () => { setState(fresh()); setErr(''); setNote(''); setInput(''); };
  // The AI marks missing numbers as [X+ calls/day] etc. — they must be filled in before use.
  const placeholders = useMemo(() => [...new Set(JSON.stringify(cv).match(/\[[^\]"]{1,40}\]/g) ?? [])], [cv]);

  if (configured === false) {
    return <div className="aa-card"><p className="cp-help">The AI CV builder isn’t set up on this server yet. An administrator needs to add a Gemini API key.</p></div>;
  }
  if (!state) return <div className="aa-card"><p className="cp-help">Loading…</p></div>;

  return (
    <div className="cp-grid cp-chat-grid">
      <div className="aa-card cp-chat" data-testid="cv-chat">
        <div className="cp-chat__head">
          <div><strong>AI CV Builder</strong><span>Answer a few questions — your CV writes itself on the right.</span></div>
          <button className="aa-btn aa-btn--sm" onClick={restart} disabled={busy}><Ic d={ICON.sync} size={14} /> Start over</button>
        </div>
        <div className="cp-chat__list" ref={listRef} aria-live="polite">
          {state.messages.map((m, i) => (
            <div key={i} className={`cp-msg cp-msg--${m.role}`} data-testid={`chat-${m.role}`}>{m.text}</div>
          ))}
          {busy && (
            <div className="cp-msg cp-msg--assistant cp-msg--typing" aria-label="Writing">
              <span /><span /><span />{slow && <em>Polishing your CV — this can take up to a minute…</em>}
            </div>
          )}
        </div>
        {err && <p className="aa-msg cp-chat__err" role="alert">{err} <button className="aa-btn aa-btn--sm" onClick={() => void send(input)}>Retry</button></p>}
        {!busy && state.suggestions.length > 0 && (
          <div className="cp-chat__chips">{state.suggestions.map((s) => <button key={s} className="cp-chip" onClick={() => void send(s)}>{s}</button>)}</div>
        )}
        <form className="cp-chat__input" onSubmit={(e) => { e.preventDefault(); void send(input); }}>
          <textarea
            value={input} rows={2} maxLength={2000} disabled={busy} data-testid="chat-input"
            placeholder="Type your answer… (Enter to send, Shift+Enter for a new line)"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(input); } }}
          />
          <button className="aa-btn aa-btn--primary" type="submit" disabled={busy || !input.trim()} data-testid="chat-send"><Ic d={ICON.next} size={15} /> Send</button>
        </form>
        <p className="cp-chat__fine">AI suggestions — check every detail before you use your CV. It won’t invent jobs, dates or numbers.</p>
      </div>

      <div className="cp-stack">
        <div className="aa-card cp-chat-cv">
          <div className="cp-chat-cv__head">
            <div><strong>Your CV</strong><span>{state.progress}% complete · ATS <b data-testid="chat-ats">{ats.score}</b> · same CV as the Generator</span></div>
            <div className="cp-chat-cv__actions">
              <button className="aa-btn aa-btn--sm" onClick={() => void saveToProfile()} disabled={busy} data-testid="chat-save-profile"><Ic d={ICON.check} size={14} /> Save to my profile</button>
              <button className="aa-btn aa-btn--sm" onClick={openInGenerator} disabled={busy} data-testid="chat-open-generator" title="Change template or edit by hand"><Ic d={ICON.cv} size={14} /> Edit</button>
              <CvExportBar cv={cv} tpl="modern-tech" />
            </div>
          </div>
          <div className="cp-chat-cv__bar"><span style={{ width: `${state.progress}%` }} /></div>
          {placeholders.length > 0 && (
            <p className="aa-msg cp-chat-cv__todo" data-testid="chat-placeholders">
              Replace {placeholders.length} placeholder{placeholders.length > 1 ? 's' : ''} like <b>{placeholders[0]}</b> with your real numbers before you download or share — tell the AI or edit them in the CV Generator.
            </p>
          )}
          {note && <p className="aa-msg aa-msg--ok">{note}</p>}
          <div className="cp-chat-cv__paper" ref={previewRef} data-testid="chat-preview">
            <div style={{ width: 794, transform: `scale(${scale})`, transformOrigin: 'top left', height: 1123 * scale }}>
              <CvPaper cv={cv} tpl="modern-tech" t={CV_LABELS} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
/* ================= EXPERT CV REVIEW ================= */
type ExpertSessionMode = 'generate' | 'review';
interface CvExpert {
  id: string; name: string; role: string; specialty: string; industry: string;
  rating: string; reviews: number; price: number; initials: string; color: string;
}
interface BookingDate { id: string; label: string; date: string; }
interface ExpertBooking {
  id: string; expertId: string; expertName: string; expertRole: string;
  modeTitle: string; dateId: string; date: string; slot: string; time: string; targetRole: string; cvIncluded: boolean;
}
interface ExpertBookingDraft {
  expertId: string; dateId: string; date: string; slot: string; time: string; targetRole: string; cvIncluded: boolean;
}

const CV_EXPERTS: CvExpert[] = [
  { id: 'rohan', name: 'Rohan Kulkarni', role: 'Staff Frontend Architect', specialty: 'Frontend & platform CVs', industry: 'Engineering & Tech', rating: '4.98', reviews: 184, price: 799, initials: 'RK', color: 'indigo' },
  { id: 'meera', name: 'Dr. Meera Nair', role: 'Senior Dietitian Physician', specialty: 'Clinical & healthcare careers', industry: 'Doctor & Healthcare', rating: '4.99', reviews: 142, price: 899, initials: 'MN', color: 'emerald' },
  { id: 'ananya', name: 'Ananya Sharma', role: 'Director of Talent Acquisition', specialty: 'Leadership & hiring strategy', industry: 'HR & Talent Acquisition', rating: '4.97', reviews: 226, price: 599, initials: 'AS', color: 'amber' },
  { id: 'vikram', name: 'Vikramaditya Rao', role: 'Principal Architect & Hiring Lead', specialty: 'System design & senior roles', industry: 'Engineering & Tech', rating: '4.95', reviews: 98, price: 799, initials: 'VR', color: 'indigo' },
  { id: 'priya', name: 'Priya Menon', role: 'Engineering Manager', specialty: 'Product engineering & leadership', industry: 'Engineering & Tech', rating: '4.96', reviews: 117, price: 699, initials: 'PM', color: 'emerald' },
  { id: 'arjun', name: 'Dr. Arjun Rao', role: 'Consultant Cardiologist', specialty: 'Clinical CVs & fellowships', industry: 'Doctor & Healthcare', rating: '4.93', reviews: 86, price: 999, initials: 'AR', color: 'amber' },
  { id: 'asha', name: 'Dr. Asha Iyer', role: 'Senior Medical Researcher', specialty: 'Research & academic CVs', industry: 'Doctor & Healthcare', rating: '4.97', reviews: 103, price: 899, initials: 'AI', color: 'indigo' },
  { id: 'kavita', name: 'Kavita Desai', role: 'People & Culture Director', specialty: 'HR, people ops & leadership', industry: 'HR & Talent Acquisition', rating: '4.94', reviews: 91, price: 649, initials: 'KD', color: 'emerald' },
  { id: 'rahul', name: 'Rahul Khanna', role: 'Executive Recruiter', specialty: 'Executive search & interviews', industry: 'HR & Talent Acquisition', rating: '4.96', reviews: 135, price: 699, initials: 'RK', color: 'amber' },
  { id: 'nikhil', name: 'Chef Nikhil Batra', role: 'Executive Chef & Restaurateur', specialty: 'Culinary leadership & hospitality', industry: 'Culinary & Hospitality', rating: '4.92', reviews: 74, price: 599, initials: 'NB', color: 'indigo' },
  { id: 'tara', name: 'Chef Tara Joseph', role: 'Hospitality Operations Lead', specialty: 'Hotels, service & culinary roles', industry: 'Culinary & Hospitality', rating: '4.95', reviews: 82, price: 549, initials: 'TJ', color: 'emerald' },
  { id: 'neha', name: 'Neha Kapoor', role: 'Investment Banking Vice President', specialty: 'Finance & business CVs', industry: 'Finance & Business', rating: '4.97', reviews: 122, price: 899, initials: 'NK', color: 'amber' },
  { id: 'suresh', name: 'Suresh Menon', role: 'Strategy & Operations Partner', specialty: 'Consulting & business leadership', industry: 'Finance & Business', rating: '4.94', reviews: 96, price: 799, initials: 'SM', color: 'indigo' },
];
const EXPERT_INDUSTRIES = ['All specialties', ...new Set(CV_EXPERTS.map((expert) => expert.industry))];
const BOOKING_DATES: BookingDate[] = Array.from({ length: 5 }, (_, i) => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + i);
  const id = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return {
    id,
    label: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : date.toLocaleDateString('en', { weekday: 'short' }),
    date: date.toLocaleDateString('en', { day: '2-digit', month: 'short' }),
  };
});
const BOOKING_SLOTS = [
  { time: '10:00 AM', available: true },
  { time: '10:30 AM', available: true },
  { time: '11:30 AM', available: false },
  { time: '02:00 PM', available: true },
  { time: '04:30 PM', available: true },
  { time: '07:00 PM', available: true },
  { time: '08:30 PM', available: true },
];
const SESSION_AGENDA: Record<ExpertSessionMode, { time: string; title: string; description: string }[]> = {
  generate: [
    { time: '00–05 min', title: 'Role alignment & experience discovery', description: 'Map your career story, key projects, and target roles.' },
    { time: '05–20 min', title: 'Live CV building & bullet crafting', description: 'Turn your experience into clear, measurable achievements.' },
    { time: '20–27 min', title: 'ATS keywords & structure polish', description: 'Improve skill coverage and make the layout easy to scan.' },
    { time: '27–30 min', title: 'Export & application plan', description: 'Review the draft and agree on practical next steps.' },
  ],
  review: [
    { time: '00–05 min', title: 'Target role & first impression', description: 'Review the CV layout and positioning for your target role.' },
    { time: '05–20 min', title: 'Line-by-line feedback', description: 'Strengthen bullets with clearer outcomes and impact.' },
    { time: '20–27 min', title: 'ATS and content improvements', description: 'Identify formatting issues, skill gaps, and weak sections.' },
    { time: '27–30 min', title: 'Feedback summary & action plan', description: 'Leave with a focused checklist for your next CV revision.' },
  ],
};

function getSessionEndTime(start: string): string {
  const [clock, period] = start.split(' ');
  const [rawHour, rawMinute] = clock.split(':').map(Number);
  const totalMinutes = (rawHour % 12) * 60 + rawMinute + (period === 'PM' ? 720 : 0) + 30;
  const clockMinutes = totalMinutes % 1440;
  const hour = Math.floor(clockMinutes / 60) % 12 || 12;
  const minute = clockMinutes % 60;
  const nextPeriod = clockMinutes >= 720 ? 'PM' : 'AM';
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} ${nextPeriod}`;
}

interface ExpertReviewPageProps {
  mode: ExpertSessionMode; setMode: (mode: ExpertSessionMode) => void;
  expertId: string; setExpertId: (id: string) => void;
  bookings: ExpertBooking[]; notice: string;
  onOpenBooking: (expertId?: string) => void; onBrowseExperts: () => void; onCancelBooking: (id: string) => void;
}
function ExpertReviewPage({ mode, setMode, expertId, setExpertId, bookings, notice, onOpenBooking, onBrowseExperts, onCancelBooking }: ExpertReviewPageProps) {
  const agenda = SESSION_AGENDA[mode];
  const topExperts = CV_EXPERTS.slice(0, 3);
  const { money } = useMoney();

  return (
    <div className="cp-expert-page cp-expert-page--full">
      <header className="cp-expert-page-toolbar">
        <div className="cp-mode-tabs" role="group" aria-label="Expert session type">
          <button type="button" className={mode === 'generate' ? 'is-selected' : ''} onClick={() => setMode('generate')}>Generate CV with Expert</button>
          <button type="button" className={mode === 'review' ? 'is-selected' : ''} onClick={() => setMode('review')}>1:1 Expert CV Review</button>
        </div>
        <button className="aa-btn aa-btn--primary" onClick={() => onOpenBooking(expertId)}><Ic d={ICON.calendar} size={14} /> Book 30-Min Session</button>
      </header>

      {notice && <div className="cp-booking-notice" role="status">{notice}</div>}

      <section className="aa-card cp-flow-card">
        <div className="cp-flow-card__heading">
          <div><span>30-minute session flow</span><strong>{mode === 'generate' ? 'Generate CV with Expert' : '1:1 Expert CV Review'}</strong></div>
          <small><Ic d={ICON.clock} size={13} /> Structured 4-stage agenda</small>
        </div>
        <div className="cp-flow-grid">
          {agenda.map((step, index) => (
            <article className="cp-flow-step" key={step.time}>
              <div className="cp-flow-step__top"><span className="cp-flow-step__number">0{index + 1}</span><span className="cp-flow-step__time">{step.time}</span></div>
              <h3>{step.title}</h3>
              <p>{step.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="cp-available-experts">
        <div className="cp-available-experts__heading">
          <div><h2>Available experts <span>13 specialists</span></h2><p>Engineering, healthcare, HR, culinary &amp; more</p></div>
          <button className="aa-btn cp-browse-button" onClick={onBrowseExperts}>Browse all experts <Ic d={ICON.next} size={14} /></button>
        </div>
        <div className="cp-featured-experts">
          {topExperts.map((expert) => (
            <article className={`cp-featured-expert${expert.id === expertId ? ' is-selected' : ''}`} key={expert.id}>
              <span className={`cp-expert-avatar cp-expert-avatar--${expert.color}`}>{expert.initials}</span>
              <div className="cp-featured-expert__main">
                <div className="cp-featured-expert__name"><strong>{expert.name}</strong><span>★ {expert.rating} <small>({expert.reviews})</small></span></div>
                <p>{expert.role}</p>
                <div className="cp-featured-expert__meta"><strong>{money(expert.price, 'INR', false)} <small>/ 30m</small></strong><span>{expert.industry}</span></div>
              </div>
              <button type="button" className="aa-btn aa-btn--sm" onClick={() => { setExpertId(expert.id); onOpenBooking(expert.id); }}>Book slot</button>
            </article>
          ))}
        </div>
      </section>

      <div className="cp-session-columns">
        <section className="aa-card cp-sessions-card">
          <div className="cp-section-heading">
            <div><h3>Upcoming 30-Min Sessions <span className="cp-session-count">{bookings.length}</span></h3><p>Demo requests are stored only for this page session.</p></div>
            <button className="cp-add-slot" onClick={() => onOpenBooking(expertId)}>+ Add slot</button>
          </div>
          {bookings.length === 0 ? (
            <div className="cp-sessions-empty"><Ic d={ICON.calendar} size={22} /><strong>No session requests yet</strong><span>Choose an expert and time to add a demo request here.</span></div>
          ) : (
            <div className="cp-session-list">
              {bookings.map((booking) => (
                <article className="cp-session-item" key={booking.id}>
                  <span className="cp-session-calendar"><Ic d={ICON.calendar} size={16} /><small>30m</small></span>
                  <div className="cp-session-info">
                    <strong>{booking.modeTitle} <small>Demo request</small></strong>
                    <span>with {booking.expertName} · {booking.expertRole}</span>
                    <span>{booking.date} · {booking.time} · Focus: {booking.targetRole}{booking.cvIncluded ? ' · CV attached' : ''}</span>
                  </div>
                  <button className="aa-btn aa-btn--sm" type="button" onClick={() => onCancelBooking(booking.id)}>Remove</button>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="aa-card cp-sessions-card">
          <div className="cp-section-heading">
            <div><h3>Completed expert sessions &amp; feedback <span className="cp-session-count">0</span></h3></div>
          </div>
          <div className="cp-sessions-empty cp-completed-empty"><Ic d={ICON.check} size={22} /><strong>No completed sessions yet</strong><span>Expert feedback and updated CVs will appear here after a session.</span></div>
        </section>
      </div>
    </div>
  );
}

interface ExpertsDirectoryPageProps { onBook: (expertId: string) => void; }
function ExpertsDirectoryPage({ onBook }: ExpertsDirectoryPageProps) {
  const { money } = useMoney();
  const [search, setSearch] = useState('');
  const [cats, setCats] = useState<string[]>([]); // empty = all specialties
  const toggleCat = (c: string) => setCats((cur) => (cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c]));
  const filteredExperts = CV_EXPERTS.filter((expert) => {
    const matchesIndustry = !cats.length || cats.includes(expert.industry);
    const query = search.trim().toLowerCase();
    const matchesSearch = !query || [expert.name, expert.role, expert.specialty, expert.industry].some((value) => value.toLowerCase().includes(query));
    return matchesIndustry && matchesSearch;
  });

  return (
    <div className="cp-directory-page">
      <div className="cp-directory-intro"><div><h2>Find the right expert for your next move</h2><p>Browse specialists by industry, experience, and career focus.</p></div><span>{CV_EXPERTS.length} specialists</span></div>
      <div className="cp-directory-filters">
        <label className="cp-directory-search"><Ic d={ICON.search} size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search experts, roles, or skills" aria-label="Search experts" /></label>
      </div>
      <div className="cp-cat-chips" role="group" aria-label="Filter by category" data-testid="expert-cats">
        <button className={`cp-cat-chip${cats.length === 0 ? ' is-on' : ''}`} onClick={() => setCats([])} aria-pressed={cats.length === 0}>All specialties</button>
        {EXPERT_INDUSTRIES.slice(1).map((c) => (
          <button key={c} className={`cp-cat-chip${cats.includes(c) ? ' is-on' : ''}`} onClick={() => toggleCat(c)} aria-pressed={cats.includes(c)}>
            {c} <small>{CV_EXPERTS.filter((e) => e.industry === c).length}</small>
          </button>
        ))}
      </div>
      <div className="cp-directory-results"><strong>{filteredExperts.length} experts</strong><span>Each session is 30 minutes · Prices are shown in INR</span></div>
      {filteredExperts.length ? (
        <div className="cp-directory-grid">
          {filteredExperts.map((expert) => (
            <article className="aa-card cp-directory-expert" key={expert.id}>
              <div className="cp-directory-expert__header">
                <span className={`cp-expert-avatar cp-expert-avatar--${expert.color}`}>{expert.initials}</span>
                <div><strong>{expert.name}</strong><span>★ {expert.rating} · {expert.reviews} reviews</span></div>
              </div>
              <span className="cp-directory-industry">{expert.industry}</span>
              <h3>{expert.role}</h3>
              <p>{expert.specialty}</p>
              <div className="cp-directory-expert__footer"><strong>{money(expert.price, 'INR', false)} <small>/ 30 min</small></strong><button className="aa-btn aa-btn--sm aa-btn--primary" onClick={() => onBook(expert.id)}>Book slot</button></div>
            </article>
          ))}
        </div>
      ) : <div className="aa-card cp-directory-empty">No experts match those filters. Try another search or category.</div>}
    </div>
  );
}

interface ExpertBookingModalProps {
  expertId: string; setExpertId: (id: string) => void; mode: ExpertSessionMode;
  bookings: ExpertBooking[]; onClose: () => void; onSubmit: (draft: ExpertBookingDraft) => void;
}
function ExpertBookingModal({ expertId, setExpertId, mode, bookings, onClose, onSubmit }: ExpertBookingModalProps) {
  const { cv, meta, ats, readiness } = useMasterCv();
  const { money } = useMoney();
  const [dateId, setDateId] = useState(BOOKING_DATES[0].id);
  const [slot, setSlot] = useState('04:30 PM');
  const [targetRole, setTargetRole] = useState('');
  const [attachCv, setAttachCv] = useState(true);
  const expert = CV_EXPERTS.find((item) => item.id === expertId) ?? CV_EXPERTS[0];
  const date = BOOKING_DATES.find((item) => item.id === dateId) ?? BOOKING_DATES[0];
  const slotIsBooked = (time: string) => bookings.some((booking) => booking.expertId === expert.id && booking.dateId === date.id && booking.slot === time);
  const submitBooking = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!slot || slotIsBooked(slot)) return;
    onSubmit({
      expertId: expert.id,
      dateId: date.id,
      date: `${date.label}, ${date.date}`,
      slot,
      time: `${slot} – ${getSessionEndTime(slot)}`,
      targetRole: targetRole.trim() || cv.title || 'General CV guidance',
      cvIncluded: attachCv,
    });
  };

  return (
    <div className="cp-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="cp-booking-modal" role="dialog" aria-modal="true" aria-labelledby="expert-booking-title">
        <header><div><h2 id="expert-booking-title">Book a 30-minute session</h2><p>{mode === 'generate' ? 'Generate CV with Expert' : '1:1 Expert CV Review'}</p></div><button type="button" className="cp-modal-close" onClick={onClose} aria-label="Close booking dialog">×</button></header>
        <form className="cp-modal-form" onSubmit={submitBooking}>
          <Field label="Choose an expert">
            <select value={expertId} onChange={(event) => setExpertId(event.target.value)} aria-label="Choose an expert">
              {CV_EXPERTS.map((item) => <option key={item.id} value={item.id}>{item.name} — {item.industry} · {money(item.price, 'INR', false)}</option>)}
            </select>
          </Field>
          <div className="cp-modal-expert"><span className={`cp-expert-avatar cp-expert-avatar--${expert.color}`}>{expert.initials}</span><div><strong>{expert.name}</strong><span>{expert.role} · ★ {expert.rating}</span></div><b>{money(expert.price, 'INR', false)}</b></div>
          <div className="cp-booking-field">
            <span className="cp-booking-label">Select date</span>
            <div className="cp-date-grid">{BOOKING_DATES.map((item) => <button type="button" key={item.id} className={`cp-date-option${dateId === item.id ? ' is-selected' : ''}`} onClick={() => setDateId(item.id)} aria-pressed={dateId === item.id}><small>{item.label}</small><strong>{item.date}</strong></button>)}</div>
          </div>
          <div className="cp-booking-field">
            <div className="cp-booking-slots__heading"><span className="cp-booking-label">Available 30-minute slots</span><span>{slot ? `${slot} – ${getSessionEndTime(slot)}` : 'Choose a time'}</span></div>
            <div className="cp-slot-grid">{BOOKING_SLOTS.map((item) => {
              const unavailable = !item.available || slotIsBooked(item.time);
              return <button type="button" key={item.time} disabled={unavailable} className={`cp-slot-option${slot === item.time ? ' is-selected' : ''}`} onClick={() => setSlot(item.time)}>{item.time}</button>;
            })}</div>
          </div>
          <Field label="Target role & session goals" wide><textarea rows={3} value={targetRole} onChange={(event) => setTargetRole(event.target.value)} placeholder="What would you like to work on with this expert?" /></Field>
          <label className="cp-attach-cv" data-testid="booking-cv"><span className="cp-attach-cv__copy"><Ic d={ICON.cv} size={15} /><span>Attach my synced CV<small>{meta.fileName || cv.title || cv.name || 'No CV details yet'}{meta.dirty ? ' (latest unsaved edits)' : ''} · ATS {ats.score} · Readiness {readiness}%</small></span></span><input type="checkbox" checked={attachCv} onChange={(event) => setAttachCv(event.target.checked)} /></label>
          <button className="aa-btn aa-btn--primary cp-book-button" type="submit" disabled={!slot || slotIsBooked(slot)}><Ic d={ICON.calendar} size={15} /> Request session · {money(expert.price, 'INR', false)}</button>
          <p className="cp-demo-note">Demo only: booking and payment are not connected.</p>
        </form>
      </section>
    </div>
  );
}

/* ================= SHELL ================= */
type Section = StudioSection;
const SECTIONS: { id: Section; label: string; icon: string; group: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: ICON.dash, group: 'Overview' },
  { id: 'cv', label: 'CV Generator', icon: ICON.cv, group: 'Build' },
  { id: 'role', label: 'AI CV Builder', icon: ICON.wand, group: 'Build' },
  { id: 'expert', label: 'Expert CV Review', icon: ICON.expert, group: 'Prepare' },
  { id: 'experts', label: 'Experts Directory', icon: ICON.target, group: 'Prepare' },
  { id: 'sync', label: 'My Profile & Sync', icon: ICON.sync, group: 'Settings' },
];
const TITLES: Record<Section, [string, string]> = {
  dashboard: ['Career Dashboard', 'Upload, score and sync your CV — every tool uses the same copy'],
  cv: ['CV Generator', 'Pick a template, edit live, export'],
  role: ['AI CV Builder', 'Chat with AI — your CV builds itself as you answer'],
  expert: ['Expert CV Review', 'Co-build or refine your CV in a focused 30-minute session'],
  experts: ['Experts Directory', 'Explore career specialists across industries'],
  sync: ['My Profile & Sync', 'Edit your details once — save to sync everywhere'],
};
function sectionFromPath(): Section {
  const seg = location.pathname.split('/').filter(Boolean);
  const s = seg[1] as Section;
  if (SECTIONS.some((x) => x.id === s)) return s;
  if (seg.length > 1) history.replaceState(null, '', '/career'); // unknown or removed page (e.g. /career/jd)
  return 'dashboard';
}

export function CareerApp({ exit }: { exit: () => void }) {
  // masterCV wraps the whole studio: one CV for every tab and modal.
  return <MasterCvProvider><CareerStudio exit={exit} /></MasterCvProvider>;
}

function CareerStudio({ exit }: { exit: () => void }) {
  const { user } = useAuth();
  const { loading } = useMasterCv();
  const [bookings, setBookings] = useState<ExpertBooking[]>([]);
  const [expertId, setExpertId] = useState(CV_EXPERTS[0].id);
  const [expertMode, setExpertMode] = useState<ExpertSessionMode>('generate');
  const [bookingOpen, setBookingOpen] = useState(false);
  const [expertNotice, setExpertNotice] = useState('');
  const [section, setSection] = useState<Section>(() => sectionFromPath());
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onPop = () => setSection(sectionFromPath());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const go = useCallback((s: Section) => {
    const path = s === 'dashboard' ? '/career' : `/career/${s}`;
    if (location.pathname !== path) history.pushState(null, '', path);
    setSection(s); setMenuOpen(false); window.scrollTo(0, 0);
  }, []);
  const openExpertBooking = (id?: string) => {
    if (id) setExpertId(id);
    setBookingOpen(true);
  };
  const submitExpertBooking = (draft: ExpertBookingDraft) => {
    const expert = CV_EXPERTS.find((item) => item.id === draft.expertId) ?? CV_EXPERTS[0];
    setBookings((current) => [{
      ...draft,
      id: String(Date.now()),
      expertName: expert.name,
      expertRole: expert.role,
      modeTitle: expertMode === 'generate' ? 'Generate CV with Expert' : '1:1 Expert CV Review',
    }, ...current]);
    setExpertNotice('Demo only: this request is saved on this page; no expert has been contacted and no payment was taken.');
    setBookingOpen(false);
  };
  const cancelExpertBooking = (id: string) => {
    setBookings((current) => current.filter((booking) => booking.id !== id));
    setExpertNotice('Demo request removed.');
  };

  const body = (() => {
    switch (section) {
      case 'cv': return <CvGeneratorPage />;
      case 'role': return <AiCvChatPage go={go} />;
      case 'expert': return <ExpertReviewPage
        mode={expertMode}
        setMode={setExpertMode}
        expertId={expertId}
        setExpertId={setExpertId}
        bookings={bookings}
        notice={expertNotice}
        onOpenBooking={openExpertBooking}
        onBrowseExperts={() => go('experts')}
        onCancelBooking={cancelExpertBooking}
      />;
      case 'experts': return <ExpertsDirectoryPage onBook={openExpertBooking} />;
      case 'sync': return <ProfileSyncPage go={go} />;
      default: return <StudioDashboard go={go} />;
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
    <>
      <div className="admin-app cp-app">
        <div className="aa-shell">
          <aside className={`aa-side${menuOpen ? ' is-open' : ''}`} aria-label="Career sections">
            <div className="aa-brand">
              <span className="aa-brand__mark"><Ic d={ICON.cv} size={20} /></span>
              <div><div className="aa-brand__name">Resume</div><div className="aa-brand__sub">Huddle</div></div>
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
              <span className="aa-avatar">{initials(user?.name || 'U')}</span>
              <div className="aa-side__who"><strong>{user?.name}</strong><span>Member</span></div>
            </div>
          </aside>
          <div className={`aa-scrim${menuOpen ? ' is-show' : ''}`} onClick={() => setMenuOpen(false)} />
          <div className="aa-main">
            <header className="aa-topbar">
              <button className="aa-hamburger" aria-label="Open menu" onClick={() => setMenuOpen(true)}><Ic d={ICON.menu} size={20} /></button>
              <div className="cp-topbar__titles"><div className="aa-topbar__title">{TITLES[section][0]}</div><div className="aa-topbar__sub">{TITLES[section][1]}</div></div>
              <StudioStatus go={go} />
            </header>
            <div className="aa-content">{loading ? <div className="aa-skeleton" /> : body}</div>
          </div>
        </div>
        {bookingOpen && <ExpertBookingModal expertId={expertId} setExpertId={setExpertId} mode={expertMode} bookings={bookings} onClose={() => setBookingOpen(false)} onSubmit={submitExpertBooking} />}
      </div>
    </>
  );
}
