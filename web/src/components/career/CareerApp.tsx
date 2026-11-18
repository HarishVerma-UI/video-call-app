// Career Portal — a full-screen member app built the same way as the admin and
// recruiter consoles (the isolated .admin-app / aa- shell), bundling every career
// tool: a multi-template CV generator with live preview, an AI role builder, a
// JD-to-CV matcher, a cover-letter writer, multilingual CV labels and a mock
// interview simulator. Real data is pulled from the member's Huddle profile; the
// AI assists run client-side so the whole portal works offline inside the app.
import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type CSSProperties, type ReactNode,
} from 'react';
import type { Education, Experience } from '@vca/shared';
import { useAuth } from '../../auth/AuthContext';
import '../../admin.css';
import './career.css';

/* ================= model ================= */
interface CvData {
  name: string; title: string; email: string; phone: string; location: string;
  summary: string; skills: string[]; experience: Experience[]; education: Education[];
}
type TemplateId = 'modern' | 'exec' | 'minimal' | 'compact';
type Lang = 'en' | 'es' | 'fr' | 'de' | 'hi';

const SAMPLE: CvData = {
  name: 'Harish Kumar Verma',
  title: 'Senior Angular Developer / Front-end Technical Lead',
  email: 'you@example.com',
  phone: '+91 90000 00000',
  location: 'Bengaluru, India',
  summary: 'Front-end technical lead with 10+ years building scalable Angular applications, design systems and reusable component libraries. Drives version migrations, performance, and mentoring across distributed teams.',
  skills: ['Angular', 'TypeScript', 'RxJS', 'Storybook', 'NgRx', 'SCSS', 'Jest', 'CI/CD'],
  experience: [
    { title: 'Front-end Technical Lead', company: 'Acme Corp', start: '2021', end: 'Present', description: 'Led migration of a 400k-LOC app from Angular 11 to 17.\nBuilt a published component library adopted by 6 squads.\nCut initial load time 42% with lazy routes and OnPush.' },
    { title: 'Senior Angular Developer', company: 'Globex', start: '2017', end: '2021', description: 'Owned the design-system and shared services used across 4 products.\nIntroduced Storybook docs and visual regression tests.' },
  ],
  education: [
    { degree: 'B.E. Computer Science', school: 'Pune University', year: '2013' },
  ],
};
const EMPTY: CvData = { name: '', title: '', email: '', phone: '', location: '', summary: '', skills: [], experience: [], education: [] };

const LANGS: { id: Lang; label: string }[] = [
  { id: 'en', label: 'English' }, { id: 'es', label: 'Español' }, { id: 'fr', label: 'Français' },
  { id: 'de', label: 'Deutsch' }, { id: 'hi', label: 'हिन्दी' },
];
const L10N: Record<Lang, { summary: string; experience: string; education: string; skills: string; contact: string }> = {
  en: { summary: 'Summary', experience: 'Experience', education: 'Education', skills: 'Skills', contact: 'Contact' },
  es: { summary: 'Resumen', experience: 'Experiencia', education: 'Educación', skills: 'Habilidades', contact: 'Contacto' },
  fr: { summary: 'Profil', experience: 'Expérience', education: 'Formation', skills: 'Compétences', contact: 'Contact' },
  de: { summary: 'Profil', experience: 'Berufserfahrung', education: 'Ausbildung', skills: 'Kenntnisse', contact: 'Kontakt' },
  hi: { summary: 'सारांश', experience: 'अनुभव', education: 'शिक्षा', skills: 'कौशल', contact: 'संपर्क' },
};

const TEMPLATES: { id: TemplateId; name: string; desc: string; colors: string[] }[] = [
  { id: 'modern', name: 'Modern Tech Clean', desc: 'Two-column, dark rail, pill skills', colors: ['#1e293b', '#4f46e5', '#fff'] },
  { id: 'exec', name: 'Executive Classic', desc: 'Serif, centered header, formal', colors: ['#f8fafc', '#1e293b', '#cbd5e1'] },
  { id: 'minimal', name: 'Minimalist Creative', desc: 'Whitespace, bold oversized name', colors: ['#fff', '#6366f1', '#e2e8f0'] },
  { id: 'compact', name: 'Startup & Compact', desc: 'Dense one-page, two columns', colors: ['#eef2ff', '#6366f1', '#fff'] },
];

/* ================= context ================= */
interface Stats { atsScores: number[]; jdRuns: number; mockSessions: number; coverLetters: number; }
interface CareerCtx {
  cv: CvData; setCv: (fn: (c: CvData) => CvData) => void;
  lang: Lang; setLang: (l: Lang) => void;
  stats: Stats; bump: (fn: (s: Stats) => Stats) => void;
}
const Ctx = createContext<CareerCtx | null>(null);
const useCareer = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('CareerCtx');
  return c;
};

/* ================= helpers ================= */
function Ic({ d, size = 18 }: { d: string; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">{d.split('|').map((p, i) => <path key={i} d={p} />)}</svg>;
}
const ICON = {
  dash: 'M4 4h6v8H4z|M14 4h6v5h-6z|M14 13h6v7h-6z|M4 16h6v4H4z',
  cv: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z|M14 2v6h6M9 13h6M9 17h4',
  wand: 'M15 4V2M15 10V8M12.5 6.5h-2M19.5 6.5h-2|M5 19l9-9|M17 13l4 4-2 2-4-4z',
  target: 'M12 12m-9 0a9 9 0 1 0 18 0 9 9 0 1 0-18 0|M12 12m-5 0a5 5 0 1 0 10 0 5 5 0 1 0-10 0|M12 12m-1 0a1 1 0 1 0 2 0 1 1 0 1 0-2 0',
  letter: 'M4 4h16v16H4z|M4 7l8 6 8-6',
  globe: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20|M2 12h20|M12 2a15 15 0 0 1 0 20|M12 2a15 15 0 0 0 0 20',
  mic: 'M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z|M5 11a7 7 0 0 0 14 0M12 18v4',
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
const initials = (n: string) => (n || '?').split(' ').map((x) => x[0]).slice(0, 2).join('').toUpperCase();
async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; }
  catch { return false; }
}
function cvToText(cv: CvData, t: typeof L10N['en']): string {
  const lines = [cv.name, cv.title, [cv.email, cv.phone, cv.location].filter(Boolean).join(' · '), '', t.summary.toUpperCase(), cv.summary, ''];
  lines.push(t.experience.toUpperCase());
  cv.experience.forEach((e) => { lines.push(`${e.title} — ${e.company} (${[e.start, e.end].filter(Boolean).join('–')})`); if (e.description) lines.push(e.description); lines.push(''); });
  lines.push(t.education.toUpperCase());
  cv.education.forEach((e) => lines.push(`${e.degree}, ${e.school} ${e.year ?? ''}`.trim()));
  lines.push('', t.skills.toUpperCase(), cv.skills.join(', '));
  return lines.join('\n');
}

/* ================= CV preview templates ================= */
function Contact({ cv }: { cv: CvData }) {
  return <>{[cv.email, cv.phone, cv.location].filter(Boolean).map((x, i) => <div className="cv-contact" key={i}>{x}</div>)}</>;
}
function ExpList({ cv }: { cv: CvData }) {
  return <>{cv.experience.map((e, i) => (
    <div className="cv-item" key={i}>
      <div className="cv-role">{e.title}</div>
      <div className="cv-meta">{e.company}{(e.start || e.end) ? ` · ${[e.start, e.end].filter(Boolean).join(' – ')}` : ''}</div>
      {e.description && <div className="cv-desc">{e.description}</div>}
    </div>
  ))}</>;
}
function EduList({ cv }: { cv: CvData }) {
  return <>{cv.education.map((e, i) => (
    <div className="cv-item" key={i}><div className="cv-role">{e.degree}</div><div className="cv-meta">{e.school}{e.year ? ` · ${e.year}` : ''}</div></div>
  ))}</>;
}

function CvPaper({ cv, tpl, t }: { cv: CvData; tpl: TemplateId; t: typeof L10N['en'] }) {
  if (tpl === 'modern') return (
    <div className="cv-paper cv-modern">
      <div className="cv-rail">
        <h1>{cv.name}</h1><div className="cv-title">{cv.title}</div>
        <div className="cv-sec-title">{t.contact}</div><Contact cv={cv} />
        <div className="cv-sec-title">{t.skills}</div><div>{cv.skills.map((s, i) => <span className="cv-pill" key={i}>{s}</span>)}</div>
      </div>
      <div className="cv-body">
        <div className="cv-sec"><div className="cv-sec-title">{t.summary}</div><div className="cv-desc">{cv.summary}</div></div>
        <div className="cv-sec"><div className="cv-sec-title">{t.experience}</div><ExpList cv={cv} /></div>
        <div className="cv-sec"><div className="cv-sec-title">{t.education}</div><EduList cv={cv} /></div>
      </div>
    </div>
  );
  if (tpl === 'exec') return (
    <div className="cv-paper cv-exec">
      <div className="cv-head"><h1>{cv.name}</h1><div className="cv-title">{cv.title}</div><div className="cv-contact">{[cv.email, cv.phone, cv.location].filter(Boolean).join('   |   ')}</div></div>
      <div className="cv-sec"><div className="cv-sec-title">{t.summary}</div><div className="cv-desc">{cv.summary}</div></div>
      <div className="cv-sec"><div className="cv-sec-title">{t.experience}</div><ExpList cv={cv} /></div>
      <div className="cv-sec"><div className="cv-sec-title">{t.education}</div><EduList cv={cv} /></div>
      <div className="cv-sec"><div className="cv-sec-title">{t.skills}</div><div>{cv.skills.map((s, i) => <span className="cv-pill" key={i}>{s}</span>)}</div></div>
    </div>
  );
  if (tpl === 'minimal') return (
    <div className="cv-paper cv-min">
      <div className="cv-head"><h1>{cv.name}</h1><div className="cv-title">{cv.title}</div><div className="cv-contact">{[cv.email, cv.phone, cv.location].filter(Boolean).join('  ·  ')}</div></div>
      <div className="cv-sec"><div className="cv-sec-title">{t.summary}</div><div className="cv-desc">{cv.summary}</div></div>
      <div className="cv-sec"><div className="cv-sec-title">{t.experience}</div><ExpList cv={cv} /></div>
      <div className="cv-sec"><div className="cv-sec-title">{t.education}</div><EduList cv={cv} /></div>
      <div className="cv-sec"><div className="cv-sec-title">{t.skills}</div><div>{cv.skills.map((s, i) => <span className="cv-pill" key={i}>{s}</span>)}</div></div>
    </div>
  );
  return (
    <div className="cv-paper cv-compact">
      <div className="cv-head"><div><h1>{cv.name}</h1><div className="cv-title">{cv.title}</div></div><div className="cv-contact">{[cv.email, cv.phone, cv.location].filter(Boolean).map((x, i) => <div key={i}>{x}</div>)}</div></div>
      <div className="cv-sec"><div className="cv-sec-title">{t.summary}</div><div className="cv-desc">{cv.summary}</div></div>
      <div className="cv-cols">
        <div><div className="cv-sec"><div className="cv-sec-title">{t.experience}</div><ExpList cv={cv} /></div></div>
        <div>
          <div className="cv-sec"><div className="cv-sec-title">{t.education}</div><EduList cv={cv} /></div>
          <div className="cv-sec"><div className="cv-sec-title">{t.skills}</div><div>{cv.skills.map((s, i) => <span className="cv-pill" key={i}>{s}</span>)}</div></div>
        </div>
      </div>
    </div>
  );
}

/* ================= DASHBOARD ================= */
function StatCard({ icon, val, label, tone }: { icon: string; val: string; label: string; tone: string }) {
  return (
    <div className="aa-kpi">
      <div className="aa-kpi__top"><span className="aa-kpi__ic" style={{ background: `color-mix(in srgb, var(${tone}) 14%, transparent)`, color: `var(${tone})` }}><Ic d={icon} /></span></div>
      <div><div className="aa-kpi__val">{val}</div><div className="aa-kpi__label">{label}</div></div>
    </div>
  );
}
function DashboardPage({ go }: { go: (s: Section) => void }) {
  const { stats } = useCareer();
  const atsAvg = stats.atsScores.length ? Math.round(stats.atsScores.reduce((a, b) => a + b, 0) / stats.atsScores.length) : 0;
  const quick: { id: Section; icon: string; title: string; desc: string }[] = [
    { id: 'cv', icon: ICON.cv, title: 'CV Generator', desc: 'Pick a template, edit live, export' },
    { id: 'role', icon: ICON.wand, title: 'AI Role Builder', desc: 'Role-optimized bullet points' },
    { id: 'jd', icon: ICON.target, title: 'JD Match & Gaps', desc: 'Score your CV against a job' },
    { id: 'cover', icon: ICON.letter, title: 'Cover Letter', desc: 'Draft a tailored letter' },
    { id: 'lang', icon: ICON.globe, title: 'Translate CV', desc: '5 languages, native phrasing' },
    { id: 'interview', icon: ICON.mic, title: 'Mock Interview', desc: 'Practise with instant feedback' },
  ];
  return (
    <>
      <div className="aa-kpis">
        <StatCard icon={ICON.target} val={atsAvg ? `${atsAvg}%` : '—'} label="Avg ATS match score" tone="--aa-s1" />
        <StatCard icon={ICON.check} val={String(stats.jdRuns)} label="JD matches run" tone="--aa-s7" />
        <StatCard icon={ICON.mic} val={String(stats.mockSessions)} label="Mock interviews done" tone="--aa-s4" />
        <StatCard icon={ICON.letter} val={String(stats.coverLetters)} label="Cover letters created" tone="--aa-s6" />
      </div>
      <div className="aa-card">
        <div className="aa-card__head"><h3>Your career toolkit</h3><span className="aa-sub">everything to land the next role</span></div>
        <div className="aa-kpis" style={{ marginTop: 4 }}>
          {quick.map((q) => (
            <button key={q.id} className="aa-kpi" style={{ cursor: 'pointer', textAlign: 'left' }} onClick={() => go(q.id)}>
              <div className="aa-kpi__top"><span className="aa-kpi__ic" style={{ background: 'var(--aa-accent-soft)', color: 'var(--aa-accent)' }}><Ic d={q.icon} /></span></div>
              <div><div className="aa-u__name">{q.title}</div><div className="cp-help">{q.desc}</div></div>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

/* ================= CV GENERATOR ================= */
function Field({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return <label className={`aa-field${wide ? ' aa-field--wide' : ''}`}><span>{label}</span>{children}</label>;
}
function CvGeneratorPage() {
  const { cv, setCv, lang } = useCareer();
  const { api } = useAuth();
  const [tpl, setTpl] = useState<TemplateId>('modern');
  const [msg, setMsg] = useState('');
  const [syncing, setSyncing] = useState(false);
  const t = L10N[lang];
  const set = <K extends keyof CvData>(k: K, v: CvData[K]) => setCv((c) => ({ ...c, [k]: v }));

  const syncFromProfile = async () => {
    setSyncing(true); setMsg('');
    try {
      const { profile } = await api.myProfile();
      setCv((c) => ({
        ...c,
        name: profile.name || c.name,
        title: profile.headline || c.title,
        location: profile.location || c.location,
        phone: profile.mobile || c.phone,
        skills: profile.skills?.length ? profile.skills : c.skills,
        experience: profile.experience?.length ? profile.experience : c.experience,
        education: profile.education?.length ? profile.education : c.education,
        summary: profile.bio || c.summary,
      }));
      setMsg('Synced from your Huddle profile.');
    } catch { setMsg('Could not reach your profile — filled nothing.'); }
    finally { setSyncing(false); }
  };
  const copy = async () => setMsg((await copyText(cvToText(cv, t))) ? 'CV text copied to clipboard.' : 'Copy failed — select the preview manually.');

  const setExp = (i: number, k: keyof Experience, v: string) => setCv((c) => ({ ...c, experience: c.experience.map((e, j) => j === i ? { ...e, [k]: v } : e) }));
  const addExp = () => setCv((c) => ({ ...c, experience: [...c.experience, { title: '', company: '', start: '', end: '', description: '' }] }));
  const delExp = (i: number) => setCv((c) => ({ ...c, experience: c.experience.filter((_, j) => j !== i) }));

  return (
    <div className="cp-grid">
      <div className="cp-stack cp-noprint">
        <div className="aa-card">
          <div className="aa-card__head"><h3>Template</h3></div>
          <div className="cp-templates">
            {TEMPLATES.map((x) => (
              <button key={x.id} className={`cp-tpl${tpl === x.id ? ' is-on' : ''}`} onClick={() => setTpl(x.id)}>
                <div className="cp-swatch">{x.colors.map((c, i) => <i key={i} style={{ background: c, width: `${100 / x.colors.length}%` }} />)}</div>
                <div className="cp-tpl__name">{x.name}</div><div className="cp-tpl__desc">{x.desc}</div>
              </button>
            ))}
          </div>
        </div>
        <div className="aa-card aa-form">
          <div className="aa-card__head"><h3>Details</h3></div>
          <div className="aa-form__grid">
            <Field label="Full name"><input value={cv.name} onChange={(e) => set('name', e.target.value)} /></Field>
            <Field label="Professional title"><input value={cv.title} onChange={(e) => set('title', e.target.value)} /></Field>
            <Field label="Email"><input value={cv.email} onChange={(e) => set('email', e.target.value)} /></Field>
            <Field label="Phone"><input value={cv.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
            <Field label="Location"><input value={cv.location} onChange={(e) => set('location', e.target.value)} /></Field>
          </div>
          <Field label="Summary" wide><textarea rows={3} value={cv.summary} onChange={(e) => set('summary', e.target.value)} /></Field>
          <Field label="Skills (comma separated)" wide><input value={cv.skills.join(', ')} onChange={(e) => set('skills', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))} /></Field>
        </div>
        <div className="aa-card aa-form">
          <div className="aa-card__head"><h3>Experience</h3><button className="aa-btn aa-btn--sm" onClick={addExp}><Ic d={ICON.plus} size={14} /> Add</button></div>
          {cv.experience.length === 0 && <p className="cp-empty-note">No experience yet — add a role or sync from your profile.</p>}
          {cv.experience.map((e, i) => (
            <div key={i} className="aa-form" style={{ borderTop: i ? '1px solid var(--aa-border)' : 0, paddingTop: i ? 12 : 0 }}>
              <div className="aa-form__grid">
                <Field label="Role"><input value={e.title} onChange={(ev) => setExp(i, 'title', ev.target.value)} /></Field>
                <Field label="Company"><input value={e.company} onChange={(ev) => setExp(i, 'company', ev.target.value)} /></Field>
                <Field label="Start"><input value={e.start ?? ''} onChange={(ev) => setExp(i, 'start', ev.target.value)} /></Field>
                <Field label="End"><input value={e.end ?? ''} onChange={(ev) => setExp(i, 'end', ev.target.value)} /></Field>
              </div>
              <Field label="Highlights (one per line)" wide><textarea rows={3} value={e.description ?? ''} onChange={(ev) => setExp(i, 'description', ev.target.value)} /></Field>
              <div className="aa-form__actions"><button className="aa-btn aa-btn--sm aa-btn--danger" onClick={() => delExp(i)}><Ic d={ICON.trash} size={14} /> Remove</button></div>
            </div>
          ))}
        </div>
      </div>

      <div className="cp-stack">
        <div className="aa-toolbar cp-noprint">
          <button className="aa-btn" onClick={syncFromProfile} disabled={syncing}><Ic d={ICON.sync} size={15} /> {syncing ? 'Syncing…' : 'Sync from my profile'}</button>
          <button className="aa-btn" onClick={() => setCv(() => ({ ...SAMPLE }))}><Ic d={ICON.spark} size={15} /> Load sample</button>
          <span className="aa-spacer" />
          <button className="aa-btn" onClick={copy}><Ic d={ICON.copy} size={15} /> Copy text</button>
          <button className="aa-btn aa-btn--primary" onClick={() => window.print()}><Ic d={ICON.print} size={15} /> Print / PDF</button>
        </div>
        {msg && <p className="aa-msg aa-msg--ok cp-noprint">{msg}</p>}
        <div className="cp-preview-wrap"><CvPaper cv={cv} tpl={tpl} t={t} /></div>
      </div>
    </div>
  );
}

/* ================= AI ROLE BUILDER ================= */
function RoleBuilderPage({ go }: { go: (s: Section) => void }) {
  const { cv, setCv } = useCareer();
  const [role, setRole] = useState(cv.title || 'Senior Angular Developer');
  const [level, setLevel] = useState('Senior');
  const [focus, setFocus] = useState('');
  const [out, setOut] = useState<{ summary: string; bullets: string[] } | null>(null);

  const generate = () => {
    const skills = cv.skills.length ? cv.skills : ['Angular', 'TypeScript', 'RxJS'];
    const areas = focus.split(',').map((s) => s.trim()).filter(Boolean);
    const summary = `${level} ${role} with a track record of shipping ${skills.slice(0, 3).join(', ')} at scale. Known for ${areas[0] || 'performance'} and ${areas[1] || 'clean architecture'}, mentoring engineers and turning ambiguous requirements into reliable, well-tested product.`;
    const verbs = ['Led', 'Architected', 'Shipped', 'Optimized', 'Mentored'];
    const bullets = [
      `${verbs[0]} a ${skills[0]} initiative that cut ${areas[0] || 'load time'} by a measurable margin across the product.`,
      `${verbs[1]} a reusable ${skills[1] || 'component'} library adopted by multiple squads, with Storybook docs and tests.`,
      `${verbs[2]} ${level.toLowerCase()}-level features end to end using ${skills.slice(0, 3).join(', ')}.`,
      `${verbs[3]} CI/CD and ${areas[1] || 'bundle size'}, improving deploy confidence and review velocity.`,
      `${verbs[4]} ${level === 'Lead' ? 'a team of engineers' : 'junior developers'} on ${role.toLowerCase()} best practices.`,
    ];
    setOut({ summary, bullets });
  };
  const importAll = () => {
    if (!out) return;
    setCv((c) => ({ ...c, title: role, summary: out.summary, experience: c.experience.length ? c.experience.map((e, i) => i === 0 ? { ...e, description: out.bullets.join('\n') } : e) : [{ title: role, company: 'Your company', start: '', end: 'Present', description: out.bullets.join('\n') }] }));
    go('cv');
  };
  return (
    <div className="cp-grid">
      <div className="aa-card aa-form cp-stack">
        <div className="aa-card__head"><h3>Describe the role</h3></div>
        <Field label="Target job title" wide><input value={role} onChange={(e) => setRole(e.target.value)} /></Field>
        <Field label="Seniority level" wide>
          <select value={level} onChange={(e) => setLevel(e.target.value)}>{['Entry', 'Mid', 'Senior', 'Lead', 'Principal'].map((x) => <option key={x}>{x}</option>)}</select>
        </Field>
        <Field label="Focus areas / custom prompt" wide><textarea rows={4} value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="e.g. micro-frontends, performance, design systems" /></Field>
        <div className="aa-form__actions"><button className="aa-btn aa-btn--primary" onClick={generate}><Ic d={ICON.wand} size={15} /> Generate</button></div>
      </div>
      <div className="cp-stack">
        {!out && <div className="aa-card"><p className="cp-help">Fill the role in and generate role-optimized bullet points and a summary you can drop straight into your CV.</p></div>}
        {out && (
          <>
            <div className="aa-card"><div className="aa-card__head"><h3>Optimized summary</h3></div><p className="cv-desc" style={{ color: 'var(--aa-text-2)' }}>{out.summary}</p></div>
            <div className="aa-card">
              <div className="aa-card__head"><h3>Suggested bullets</h3><button className="aa-btn aa-btn--primary aa-btn--sm" onClick={importAll}><Ic d={ICON.check} size={14} /> Import to editor</button></div>
              <div className="cp-bullets">{out.bullets.map((b, i) => <CopyBullet key={i} text={b} />)}</div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
function CopyBullet({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return (
    <div className="cp-bullet">
      <span style={{ flex: 1 }}>{text}</span>
      <button className="aa-iconbtn" title="Copy" onClick={async () => { if (await copyText(text)) { setOk(true); setTimeout(() => setOk(false), 1200); } }}><Ic d={ok ? ICON.check : ICON.copy} size={15} /></button>
    </div>
  );
}

/* ================= JD TAILOR ================= */
const STOP = new Set(['the', 'and', 'for', 'with', 'you', 'your', 'our', 'are', 'will', 'have', 'this', 'that', 'from', 'all', 'who', 'how', 'can', 'use', 'work', 'team', 'role', 'job', 'etc', 'a', 'an', 'to', 'of', 'in', 'on', 'as', 'is', 'be', 'or', 'we']);
function JdTailorPage() {
  const { cv, bump } = useCareer();
  const [jd, setJd] = useState('');
  const [res, setRes] = useState<{ score: number; missing: string[]; matched: string[]; bullets: string[] } | null>(null);

  const analyze = () => {
    const words = jd.toLowerCase().match(/[a-z][a-z+#.]{2,}/g) || [];
    const freq = new Map<string, number>();
    for (const w of words) if (!STOP.has(w)) freq.set(w, (freq.get(w) || 0) + 1);
    const keywords = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 18).map(([w]) => w);
    const have = new Set(cv.skills.map((s) => s.toLowerCase()));
    const haveText = (cv.summary + ' ' + cv.experience.map((e) => `${e.title} ${e.description ?? ''}`).join(' ')).toLowerCase();
    const matched: string[] = []; const missing: string[] = [];
    for (const k of keywords) (have.has(k) || haveText.includes(k) ? matched : missing).push(k);
    const score = keywords.length ? Math.round((matched.length / keywords.length) * 100) : 0;
    const bullets = missing.slice(0, 4).map((k) => `Delivered measurable results using ${k.charAt(0).toUpperCase() + k.slice(1)} — quantify the impact (%, time saved, scale).`);
    setRes({ score, missing: missing.slice(0, 12), matched: matched.slice(0, 12), bullets });
    bump((s) => ({ ...s, jdRuns: s.jdRuns + 1, atsScores: [...s.atsScores, score] }));
  };
  return (
    <div className="cp-grid">
      <div className="aa-card aa-form cp-stack">
        <div className="aa-card__head"><h3>Paste the job description</h3></div>
        <Field label="Job description" wide><textarea rows={14} value={jd} onChange={(e) => setJd(e.target.value)} placeholder="Paste the full JD here…" /></Field>
        <div className="aa-form__actions"><button className="aa-btn aa-btn--primary" onClick={analyze} disabled={!jd.trim()}><Ic d={ICON.target} size={15} /> Analyze match</button></div>
      </div>
      <div className="cp-stack">
        {!res && <div className="aa-card"><p className="cp-help">We compare the JD's key terms against your CV skills and experience, score the match, and show the keywords you're missing with ready-to-edit bullet points.</p></div>}
        {res && (
          <>
            <div className="aa-card"><div className="cp-score">
              <div className="cp-ring" style={{ '--v': res.score } as CSSProperties}><div className="cp-ring__inner">{res.score}%</div></div>
              <div><div className="aa-u__name" style={{ fontSize: 16 }}>Resume match score</div><p className="cp-help">{res.matched.length} of {res.matched.length + res.missing.length} key terms found in your CV.</p></div>
            </div></div>
            {res.missing.length > 0 && <div className="aa-card"><div className="aa-card__head"><h3>Missing keywords</h3></div><div className="cp-kw">{res.missing.map((k) => <span className="aa-pill aa-pill--crit" key={k}>{k}</span>)}</div></div>}
            <div className="aa-card"><div className="aa-card__head"><h3>Found in your CV</h3></div><div className="cp-kw">{res.matched.length ? res.matched.map((k) => <span className="aa-pill aa-pill--good" key={k}>{k}</span>) : <span className="cp-help">None matched yet — add relevant skills.</span>}</div></div>
            {res.bullets.length > 0 && <div className="aa-card"><div className="aa-card__head"><h3>Tailored bullets to add</h3></div><div className="cp-bullets">{res.bullets.map((b, i) => <CopyBullet key={i} text={b} />)}</div></div>}
          </>
        )}
      </div>
    </div>
  );
}

/* ================= COVER LETTER ================= */
function CoverLetterPage() {
  const { cv, bump } = useCareer();
  const [company, setCompany] = useState('');
  const [role, setRole] = useState(cv.title || '');
  const [why, setWhy] = useState('');
  const [letter, setLetter] = useState('');
  const [copied, setCopied] = useState(false);

  const generate = () => {
    const skills = cv.skills.slice(0, 3).join(', ') || 'my core skills';
    const text = `Dear Hiring Team at ${company || '[Company]'},

I'm excited to apply for the ${role || '[Role]'} position. As a ${cv.title || 'professional'} with a strong foundation in ${skills}, I bring both the technical depth and the collaborative mindset your team is looking for.

${cv.summary || 'Over my career I have consistently delivered reliable, well-tested work and helped teams move faster.'}

What draws me to ${company || 'your company'} specifically is ${why || 'the chance to work on products that reach real users and to grow alongside a strong engineering culture'}. I would welcome the opportunity to contribute from day one and to keep raising the bar for quality.

Thank you for your time and consideration. I'd love to discuss how I can help ${company || 'your team'} succeed.

Warm regards,
${cv.name || 'Your Name'}
${cv.email || ''}${cv.phone ? ' · ' + cv.phone : ''}`;
    setLetter(text);
    bump((s) => ({ ...s, coverLetters: s.coverLetters + 1 }));
  };
  return (
    <div className="cp-grid">
      <div className="aa-card aa-form cp-stack">
        <div className="aa-card__head"><h3>Cover letter details</h3></div>
        <Field label="Company name" wide><input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="e.g. Infosys" /></Field>
        <Field label="Target role" wide><input value={role} onChange={(e) => setRole(e.target.value)} /></Field>
        <Field label="Key motivations" wide><textarea rows={4} value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Why this company / role excites you" /></Field>
        <div className="aa-form__actions"><button className="aa-btn aa-btn--primary" onClick={generate}><Ic d={ICON.letter} size={15} /> Generate letter</button></div>
      </div>
      <div className="cp-stack">
        {!letter && <div className="aa-card"><p className="cp-help">We'll weave your name, title and skills into a polished, professional letter you can copy and send.</p></div>}
        {letter && (
          <>
            <div className="aa-toolbar"><span className="aa-spacer" /><button className="aa-btn aa-btn--primary" onClick={async () => { if (await copyText(letter)) { setCopied(true); setTimeout(() => setCopied(false), 1400); } }}><Ic d={copied ? ICON.check : ICON.copy} size={15} /> {copied ? 'Copied' : 'Copy letter'}</button></div>
            <div className="cp-letter">{letter}</div>
          </>
        )}
      </div>
    </div>
  );
}

/* ================= LANGUAGE ================= */
function LanguagePage() {
  const { cv, lang, setLang } = useCareer();
  return (
    <div className="cp-grid">
      <div className="aa-card cp-stack">
        <div className="aa-card__head"><h3>CV language</h3></div>
        <p className="cp-help">Switch the section labels of your CV between languages with native professional phrasing. Your content stays as written — headings and structure adapt.</p>
        <div className="cp-langbtns">
          {LANGS.map((l) => <button key={l.id} className={`aa-btn${lang === l.id ? ' aa-btn--primary' : ''}`} onClick={() => setLang(l.id)}>{l.label}</button>)}
        </div>
        <div className="aa-dlgrid" style={{ marginTop: 8 }}>
          {(['summary', 'experience', 'education', 'skills'] as const).map((k) => (
            <div className="aa-dl" key={k}><dt>{k}</dt><dd>{L10N[lang][k]}</dd></div>
          ))}
        </div>
      </div>
      <div className="cp-preview-wrap"><CvPaper cv={cv} tpl="modern" t={L10N[lang]} /></div>
    </div>
  );
}

/* ================= MOCK INTERVIEW ================= */
const QUESTIONS: { q: string; tag: string; kind: 'Behavioral' | 'Technical' }[] = [
  { q: 'Tell me about a time you led a difficult migration. What was the situation and the result?', tag: 'STAR', kind: 'Behavioral' },
  { q: 'Describe a conflict within your team and how you resolved it.', tag: 'STAR', kind: 'Behavioral' },
  { q: 'How do you optimize change detection and rendering performance in a large Angular app?', tag: 'Technical', kind: 'Technical' },
  { q: 'Walk me through how you design a reusable component library other teams will adopt.', tag: 'System', kind: 'Technical' },
  { q: 'Tell me about a project that failed. What did you learn?', tag: 'STAR', kind: 'Behavioral' },
  { q: 'How would you structure state management for a complex dashboard?', tag: 'System', kind: 'Technical' },
];
function MockInterviewPage() {
  const { bump } = useCareer();
  const [i, setI] = useState(0);
  const [ans, setAns] = useState('');
  const [rec, setRec] = useState(false);
  const [fb, setFb] = useState<{ clarity: number; star: string; tips: string[] } | null>(null);
  const timer = useRef<number | null>(null);
  const q = QUESTIONS[i];

  useEffect(() => () => { if (timer.current) window.clearInterval(timer.current); }, []);
  const toggleRec = () => {
    if (rec) { setRec(false); if (timer.current) window.clearInterval(timer.current); return; }
    setRec(true);
    // Simulated voice capture — appends transcript-style prompts so the textarea fills.
    timer.current = window.setInterval(() => setAns((a) => a + (a ? ' ' : '') + '…'), 900);
    window.setTimeout(() => { setRec(false); if (timer.current) window.clearInterval(timer.current); }, 3600);
  };
  const evaluate = () => {
    const words = ans.trim().split(/\s+/).filter((w) => w !== '…').length;
    const hasStar = /\b(situation|task|action|result|led|achieved|resulted|impact|%)\b/i.test(ans);
    const clarity = Math.min(95, 40 + Math.min(words, 120) / 2 + (hasStar ? 12 : 0));
    const tips = [
      words < 40 ? 'Add more detail — aim for 120–200 words so the interviewer can follow the story.' : 'Good length — keep it focused and cut filler.',
      hasStar ? 'Nice: your answer signals the STAR structure.' : 'Frame it with STAR: Situation, Task, Action, Result.',
      /\d/.test(ans) ? 'Great — you quantified the impact.' : 'Quantify the result (%, time saved, users, scale).',
    ];
    setFb({ clarity: Math.round(clarity), star: hasStar ? 'Detected' : 'Not clear', tips });
    bump((s) => ({ ...s, mockSessions: s.mockSessions + 1 }));
  };
  const next = () => { setI((n) => (n + 1) % QUESTIONS.length); setAns(''); setFb(null); };
  const prev = () => { setI((n) => (n - 1 + QUESTIONS.length) % QUESTIONS.length); setAns(''); setFb(null); };

  return (
    <div className="cp-grid">
      <div className="cp-stack">
        <div className="aa-card">
          <div className="aa-card__head"><span className={`cp-qtag aa-pill aa-pill--${q.kind === 'Technical' ? 'recruiter' : 'good'}`}>{q.kind} · {q.tag}</span><span className="cp-help">{i + 1} / {QUESTIONS.length}</span></div>
          <p className="cp-q">{q.q}</p>
          <div className="aa-toolbar" style={{ marginTop: 14 }}>
            <button className="aa-btn aa-btn--sm" onClick={prev}><Ic d={ICON.back} size={14} /> Prev</button>
            <button className="aa-btn aa-btn--sm" onClick={next}>Next <Ic d="M9 18l6-6-6-6" size={14} /></button>
          </div>
        </div>
        <div className="aa-card aa-form">
          <div className="aa-card__head"><h3>Your answer</h3></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 10 }}>
            <button className={`cp-mic${rec ? ' is-rec' : ''}`} onClick={toggleRec} aria-label="Record voice answer"><Ic d={ICON.mic} size={26} /></button>
            <span className="cp-help">{rec ? 'Listening… (simulated capture)' : 'Tap to record a voice answer, or type below.'}</span>
          </div>
          <Field label="Transcript / typed answer" wide><textarea rows={7} value={ans} onChange={(e) => setAns(e.target.value)} placeholder="Answer using the STAR method…" /></Field>
          <div className="aa-form__actions"><button className="aa-btn aa-btn--primary" onClick={evaluate} disabled={!ans.trim()}><Ic d={ICON.spark} size={15} /> Get feedback</button></div>
        </div>
      </div>
      <div className="cp-stack">
        {!fb && <div className="aa-card"><p className="cp-help">Answer the question, then get an instant read on clarity, STAR structure and concrete ways to sharpen your response.</p></div>}
        {fb && (
          <>
            <div className="aa-card"><div className="cp-score">
              <div className="cp-ring" style={{ '--v': fb.clarity } as CSSProperties}><div className="cp-ring__inner">{fb.clarity}</div></div>
              <div><div className="aa-u__name" style={{ fontSize: 16 }}>Clarity score</div><p className="cp-help">STAR structure: <b>{fb.star}</b></p></div>
            </div></div>
            <div className="aa-card cp-feedback">
              <div className="aa-card__head"><h3>Recommendations</h3></div>
              <div className="cp-bullets" style={{ background: 'transparent' }}>{fb.tips.map((tip, k) => <div key={k} style={{ display: 'flex', gap: 8 }}><Ic d={ICON.check} size={15} /><span>{tip}</span></div>)}</div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ================= SHELL ================= */
type Section = 'dashboard' | 'cv' | 'role' | 'jd' | 'cover' | 'lang' | 'interview';
const SECTIONS: { id: Section; label: string; icon: string; group: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: ICON.dash, group: 'Overview' },
  { id: 'cv', label: 'CV Generator', icon: ICON.cv, group: 'Build' },
  { id: 'role', label: 'AI Role Builder', icon: ICON.wand, group: 'Build' },
  { id: 'lang', label: 'Translate CV', icon: ICON.globe, group: 'Build' },
  { id: 'jd', label: 'JD Match', icon: ICON.target, group: 'Apply' },
  { id: 'cover', label: 'Cover Letter', icon: ICON.letter, group: 'Apply' },
  { id: 'interview', label: 'Mock Interview', icon: ICON.mic, group: 'Prepare' },
];
const TITLES: Record<Section, [string, string]> = {
  dashboard: ['Career Dashboard', 'Your tools to build, apply and prepare'],
  cv: ['CV Generator', 'Pick a template, edit live, export'],
  role: ['AI Role Builder', 'Role-optimized bullets and summary'],
  jd: ['JD Match & Skill Gaps', 'Score your CV against any job description'],
  cover: ['Cover Letter', 'Draft a tailored, professional letter'],
  lang: ['Multilingual CV', 'Translate your CV labels across 5 languages'],
  interview: ['Mock Interview', 'Practise with instant AI feedback'],
};
function sectionFromPath(): Section {
  const seg = location.pathname.split('/').filter(Boolean);
  const s = seg[1] as Section;
  return SECTIONS.some((x) => x.id === s) ? s : 'dashboard';
}

export function CareerApp({ exit }: { exit: () => void }) {
  const { user, api } = useAuth();
  const [cv, setCvState] = useState<CvData>({ ...EMPTY, name: user?.name || '', email: user?.email || '' });
  const [lang, setLang] = useState<Lang>('en');
  const [stats, setStats] = useState<Stats>({ atsScores: [], jdRuns: 0, mockSessions: 0, coverLetters: 0 });
  const [section, setSection] = useState<Section>(() => sectionFromPath());
  const [menuOpen, setMenuOpen] = useState(false);
  const [seeded, setSeeded] = useState(false);

  const setCv = useCallback((fn: (c: CvData) => CvData) => setCvState(fn), []);
  const bump = useCallback((fn: (s: Stats) => Stats) => setStats(fn), []);

  // Open in a realistic working state: try the member's real profile; if it has
  // nothing usable yet, fall back to a clearly-labelled sample so nothing is blank.
  useEffect(() => {
    let live = true;
    api.myProfile().then(({ profile }) => {
      if (!live) return;
      const hasData = profile.headline || profile.skills?.length || profile.experience?.length;
      setCvState((c) => hasData ? {
        ...c,
        name: profile.name || c.name,
        title: profile.headline || c.title,
        location: profile.location || c.location,
        phone: profile.mobile || c.phone,
        summary: profile.bio || c.summary,
        skills: profile.skills?.length ? profile.skills : c.skills,
        experience: profile.experience?.length ? profile.experience : c.experience,
        education: profile.education?.length ? profile.education : c.education,
      } : { ...SAMPLE, name: c.name || SAMPLE.name, email: c.email || SAMPLE.email });
      setSeeded(true);
    }).catch(() => { if (live) { setCvState((c) => ({ ...SAMPLE, name: c.name || SAMPLE.name, email: c.email || SAMPLE.email })); setSeeded(true); } });
    return () => { live = false; };
  }, [api]);

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

  const body = (() => {
    switch (section) {
      case 'cv': return <CvGeneratorPage />;
      case 'role': return <RoleBuilderPage go={go} />;
      case 'jd': return <JdTailorPage />;
      case 'cover': return <CoverLetterPage />;
      case 'lang': return <LanguagePage />;
      case 'interview': return <MockInterviewPage />;
      default: return <DashboardPage go={go} />;
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

  const ctx: CareerCtx = { cv, setCv, lang, setLang, stats, bump };

  return (
    <Ctx.Provider value={ctx}>
      <div className="admin-app">
        <div className="aa-shell">
          <aside className={`aa-side${menuOpen ? ' is-open' : ''}`} aria-label="Career sections">
            <div className="aa-brand">
              <span className="aa-brand__mark"><Ic d={ICON.cv} size={20} /></span>
              <div><div className="aa-brand__name">Career Portal</div><div className="aa-brand__sub">Huddle</div></div>
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
              <div><div className="aa-topbar__title">{TITLES[section][0]}</div><div className="aa-topbar__sub">{TITLES[section][1]}</div></div>
            </header>
            <div className="aa-content">{seeded || section === 'dashboard' ? body : <div className="aa-skeleton" />}</div>
          </div>
        </div>
      </div>
    </Ctx.Provider>
  );
}
