// Career Portal — a full-screen member app built the same way as the admin and
// recruiter consoles (the isolated .admin-app / aa- shell), bundling every career
// tool: a multi-template CV generator with live preview, an AI role builder, a
// JD-to-CV matcher, and expert CV session requests. Real profile data comes from
// Huddle; the writing assists run client-side.
import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type CSSProperties, type FormEvent, type ReactNode,
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
type TemplateId =
  | 'modern-tech'
  | 'executive-classic'
  | 'minimalist-creative'
  | 'startup-compact'
  | 'ats-pro'
  | 'split-banner'
  | 'timeline-eng'
  | 'nordic-right'
  | 'bold-editorial'
  | 'modern-geometric';

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

const CV_LABELS = { summary: 'Summary', experience: 'Experience', education: 'Education', skills: 'Skills', contact: 'Contact' };

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

/* ================= context ================= */
interface Stats { atsScores: number[]; jdRuns: number; expertSessions: number; }
interface CareerCtx {
  cv: CvData; setCv: (fn: (c: CvData) => CvData) => void;
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
const initials = (n: string) => (n || '?').split(' ').map((x) => x[0]).slice(0, 2).join('').toUpperCase();
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

/* ================= CV preview templates ================= */
function Contact({ cv }: { cv: CvData }) {
  return <>{[cv.email, cv.phone, cv.location].filter(Boolean).map((x, i) => <span className="cv-contact__item" key={i}>{x}</span>)}</>;
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

function CvPaper({ cv, tpl, t }: { cv: CvData; tpl: TemplateId; t: typeof CV_LABELS }) {
  const skills = <div className="cv-skills">{cv.skills.map((s, i) => <span className="cv-pill" key={i}>{s}</span>)}</div>;
  const section = (label: string, content: ReactNode, className = '') => (
    <section className={`cv-sec ${className}`}><div className="cv-sec-title">{label}</div>{content}</section>
  );
  const header = (className = '') => (
    <header className={`cv-head ${className}`}>
      <div><h1>{cv.name || 'Your name'}</h1><div className="cv-title">{cv.title}</div></div>
      <div className="cv-contact"><Contact cv={cv} /></div>
    </header>
  );
  const summary = section(t.summary, <div className="cv-desc">{cv.summary}</div>);
  const experience = section(t.experience, <ExpList cv={cv} />);
  const education = section(t.education, <EduList cv={cv} />);
  const skillSection = section(t.skills, skills);

  switch (tpl) {
    case 'modern-tech':
      return <div className="cv-paper cv-modern-tech">
        <aside className="cv-rail">
          <h1>{cv.name || 'Your name'}</h1><div className="cv-title">{cv.title}</div>
          <div className="cv-sec-title">{t.contact}</div><div className="cv-contact"><Contact cv={cv} /></div>
          <div className="cv-sec-title">{t.skills}</div>{skills}
        </aside>
        <div className="cv-body">{summary}{experience}{education}</div>
      </div>;
    case 'executive-classic':
      return <div className="cv-paper cv-executive">
        {header('cv-head--centered')}{summary}{experience}
        <div className="cv-bottom-grid">{education}{skillSection}</div>
      </div>;
    case 'minimalist-creative':
      return <div className="cv-paper cv-minimalist">
        {header('cv-head--minimal')}{summary}{experience}{education}{skillSection}
      </div>;
    case 'startup-compact':
      return <div className="cv-paper cv-startup">
        {header('cv-head--compact')}{summary}
        <div className="cv-cols"><div>{experience}</div><div>{education}{skillSection}</div></div>
      </div>;
    case 'ats-pro':
      return <div className="cv-paper cv-ats">
        <header className="cv-head cv-head--ats">
          <div><h1>{cv.name || 'Your name'}</h1><div className="cv-title">{cv.title}</div></div>
          <div className="cv-contact"><Contact cv={cv} /></div>
        </header>
        {summary}{skillSection}{experience}{education}
      </div>;
    case 'split-banner':
      return <div className="cv-paper cv-split">
        <header className="cv-split__banner"><div><h1>{cv.name || 'Your name'}</h1><div className="cv-title">{cv.title}</div></div><div className="cv-contact"><Contact cv={cv} /></div></header>
        <div className="cv-split__body"><div>{summary}{experience}</div><aside>{skillSection}{education}</aside></div>
      </div>;
    case 'timeline-eng':
      return <div className="cv-paper cv-timeline">
        {header('cv-head--timeline')}{summary}
        <section className="cv-sec cv-timeline__experience"><div className="cv-sec-title">{t.experience}</div><ExpList cv={cv} /></section>
        <div className="cv-bottom-grid">{skillSection}{education}</div>
      </div>;
    case 'nordic-right':
      return <div className="cv-paper cv-nordic">
        <main>{header('cv-head--nordic')}{summary}{experience}</main>
        <aside><section className="cv-sec"><div className="cv-sec-title">{t.contact}</div><div className="cv-contact"><Contact cv={cv} /></div></section>{skillSection}{education}</aside>
      </div>;
    case 'bold-editorial':
      return <div className="cv-paper cv-editorial">
        <div className="cv-editorial__bar" />
        <div className="cv-editorial__body">{header('cv-head--editorial')}{summary}{experience}<div className="cv-bottom-grid">{skillSection}{education}</div></div>
      </div>;
    case 'modern-geometric':
      return <div className="cv-paper cv-geometric">
        <header className="cv-geometric__banner"><span>{initials(cv.name || 'Y')}</span><div><h1>{cv.name || 'Your name'}</h1><div className="cv-title">{cv.title}</div><div className="cv-contact"><Contact cv={cv} /></div></div></header>
        {summary}{experience}<div className="cv-bottom-grid">{skillSection}{education}</div>
      </div>;
  }
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
    { id: 'expert', icon: ICON.expert, title: 'Expert CV Review', desc: 'Book a CV build or review session' },
  ];
  return (
    <>
      <div className="aa-kpis">
        <StatCard icon={ICON.target} val={atsAvg ? `${atsAvg}%` : '—'} label="Avg ATS match score" tone="--aa-s1" />
        <StatCard icon={ICON.check} val={String(stats.jdRuns)} label="JD matches run" tone="--aa-s7" />
        <StatCard icon={ICON.expert} val={String(stats.expertSessions)} label="Expert sessions requested" tone="--aa-s4" />
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
  const { cv, setCv } = useCareer();
  const { api } = useAuth();
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
  const setEdu = (i: number, k: keyof Education, v: string) => setCv((c) => ({ ...c, education: c.education.map((e, j) => j === i ? { ...e, [k]: v } : e) }));
  const addEdu = () => setCv((c) => ({ ...c, education: [...c.education, { degree: '', school: '', year: '' }] }));
  const delEdu = (i: number) => setCv((c) => ({ ...c, education: c.education.filter((_, j) => j !== i) }));
  const activeTemplate = TEMPLATES.find((x) => x.id === tpl) ?? TEMPLATES[0];

  return (
    <div className="cp-workspace">
      <div className="cp-toolbar aa-toolbar cp-noprint">
        <button className="aa-btn" onClick={syncFromProfile} disabled={syncing}><Ic d={ICON.sync} size={15} /> {syncing ? 'Syncing…' : 'Sync from my profile'}</button>
        <button className="aa-btn" onClick={() => { setCv(() => ({ ...SAMPLE })); setMsg('Sample CV loaded.'); }}><Ic d={ICON.spark} size={15} /> Load sample</button>
        <span className="aa-spacer" />
        <button className="aa-btn" onClick={copy}><Ic d={ICON.copy} size={15} /> Copy text</button>
        <button className="aa-btn aa-btn--primary" onClick={() => window.print()}><Ic d={ICON.print} size={15} /> Print / PDF</button>
      </div>
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
            <div><h3>Live preview</h3><p>Your changes update the CV instantly.</p></div>
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
                <div className="cp-featured-expert__meta"><strong>₹{expert.price} <small>/ 30m</small></strong><span>{expert.industry}</span></div>
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
                    <span>{booking.date} · {booking.time} · Focus: {booking.targetRole}{booking.cvIncluded ? ' · Portal CV included' : ''}</span>
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
  const [search, setSearch] = useState('');
  const [industry, setIndustry] = useState(EXPERT_INDUSTRIES[0]);
  const filteredExperts = CV_EXPERTS.filter((expert) => {
    const matchesIndustry = industry === EXPERT_INDUSTRIES[0] || expert.industry === industry;
    const query = search.trim().toLowerCase();
    const matchesSearch = !query || [expert.name, expert.role, expert.specialty, expert.industry].some((value) => value.toLowerCase().includes(query));
    return matchesIndustry && matchesSearch;
  });

  return (
    <div className="cp-directory-page">
      <div className="cp-directory-intro"><div><h2>Find the right expert for your next move</h2><p>Browse specialists by industry, experience, and career focus.</p></div><span>{CV_EXPERTS.length} specialists</span></div>
      <div className="cp-directory-filters">
        <label className="cp-directory-search"><Ic d={ICON.search} size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search experts, roles, or skills" aria-label="Search experts" /></label>
        <label className="cp-directory-select"><span>Industry</span><select value={industry} onChange={(event) => setIndustry(event.target.value)} aria-label="Filter by industry">{EXPERT_INDUSTRIES.map((item) => <option key={item}>{item}</option>)}</select></label>
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
              <div className="cp-directory-expert__footer"><strong>₹{expert.price} <small>/ 30 min</small></strong><button className="aa-btn aa-btn--sm aa-btn--primary" onClick={() => onBook(expert.id)}>Book slot</button></div>
            </article>
          ))}
        </div>
      ) : <div className="aa-card cp-directory-empty">No experts match those filters. Try another search or industry.</div>}
    </div>
  );
}

interface ExpertBookingModalProps {
  expertId: string; setExpertId: (id: string) => void; mode: ExpertSessionMode;
  bookings: ExpertBooking[]; onClose: () => void; onSubmit: (draft: ExpertBookingDraft) => void;
}
function ExpertBookingModal({ expertId, setExpertId, mode, bookings, onClose, onSubmit }: ExpertBookingModalProps) {
  const { cv } = useCareer();
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
      targetRole: targetRole.trim() || 'General CV guidance',
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
              {CV_EXPERTS.map((item) => <option key={item.id} value={item.id}>{item.name} — {item.industry} · ₹{item.price}</option>)}
            </select>
          </Field>
          <div className="cp-modal-expert"><span className={`cp-expert-avatar cp-expert-avatar--${expert.color}`}>{expert.initials}</span><div><strong>{expert.name}</strong><span>{expert.role} · ★ {expert.rating}</span></div><b>₹{expert.price}</b></div>
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
          <label className="cp-attach-cv"><span className="cp-attach-cv__copy"><Ic d={ICON.cv} size={15} /><span>Use my current Portal CV<small>{cv.title || cv.name || 'No CV details yet'}</small></span></span><input type="checkbox" checked={attachCv} onChange={(event) => setAttachCv(event.target.checked)} /></label>
          <button className="aa-btn aa-btn--primary cp-book-button" type="submit" disabled={!slot || slotIsBooked(slot)}><Ic d={ICON.calendar} size={15} /> Request session · ₹{expert.price}</button>
          <p className="cp-demo-note">Demo only: booking and payment are not connected.</p>
        </form>
      </section>
    </div>
  );
}

/* ================= SHELL ================= */
type Section = 'dashboard' | 'cv' | 'role' | 'jd' | 'expert' | 'experts';
const SECTIONS: { id: Section; label: string; icon: string; group: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: ICON.dash, group: 'Overview' },
  { id: 'cv', label: 'CV Generator', icon: ICON.cv, group: 'Build' },
  { id: 'role', label: 'AI Role Builder', icon: ICON.wand, group: 'Build' },
  { id: 'jd', label: 'JD Match', icon: ICON.target, group: 'Apply' },
  { id: 'expert', label: 'Expert CV Review', icon: ICON.expert, group: 'Prepare' },
  { id: 'experts', label: 'Experts Directory', icon: ICON.target, group: 'Prepare' },
];
const TITLES: Record<Section, [string, string]> = {
  dashboard: ['Career Dashboard', 'Your tools to build, apply and prepare'],
  cv: ['CV Generator', 'Pick a template, edit live, export'],
  role: ['AI Role Builder', 'Role-optimized bullets and summary'],
  jd: ['JD Match & Skill Gaps', 'Score your CV against any job description'],
  expert: ['Expert CV Review', 'Co-build or refine your CV in a focused 30-minute session'],
  experts: ['Experts Directory', 'Explore career specialists across industries'],
};
function sectionFromPath(): Section {
  const seg = location.pathname.split('/').filter(Boolean);
  const s = seg[1] as Section;
  return SECTIONS.some((x) => x.id === s) ? s : 'dashboard';
}

export function CareerApp({ exit }: { exit: () => void }) {
  const { user, api } = useAuth();
  const [cv, setCvState] = useState<CvData>({ ...EMPTY, name: user?.name || '', email: user?.email || '' });
  const [stats, setStats] = useState<Stats>({ atsScores: [], jdRuns: 0, expertSessions: 0 });
  const [bookings, setBookings] = useState<ExpertBooking[]>([]);
  const [expertId, setExpertId] = useState(CV_EXPERTS[0].id);
  const [expertMode, setExpertMode] = useState<ExpertSessionMode>('generate');
  const [bookingOpen, setBookingOpen] = useState(false);
  const [expertNotice, setExpertNotice] = useState('');
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
    bump((current) => ({ ...current, expertSessions: current.expertSessions + 1 }));
  };
  const cancelExpertBooking = (id: string) => {
    setBookings((current) => current.filter((booking) => booking.id !== id));
    setExpertNotice('Demo request removed.');
    bump((current) => ({ ...current, expertSessions: Math.max(0, current.expertSessions - 1) }));
  };

  const body = (() => {
    switch (section) {
      case 'cv': return <CvGeneratorPage />;
      case 'role': return <RoleBuilderPage go={go} />;
      case 'jd': return <JdTailorPage />;
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

  const ctx: CareerCtx = { cv, setCv, stats, bump };

  return (
    <Ctx.Provider value={ctx}>
      <div className="admin-app">
        <div className="aa-shell">
          <aside className={`aa-side${menuOpen ? ' is-open' : ''}`} aria-label="Career sections">
            <div className="aa-brand">
              <span className="aa-brand__mark"><Ic d={ICON.cv} size={20} /></span>
              <div><div className="aa-brand__name">CV's Portal</div><div className="aa-brand__sub">Huddle</div></div>
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
        {bookingOpen && <ExpertBookingModal expertId={expertId} setExpertId={setExpertId} mode={expertMode} bookings={bookings} onClose={() => setBookingOpen(false)} onSubmit={submitExpertBooking} />}
      </div>
    </Ctx.Provider>
  );
}
