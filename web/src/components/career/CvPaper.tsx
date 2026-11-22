// The CV page itself — 10 templates rendered from one CvData. Shared by the Resume
// app (generator, AI builder) and the public CV page at /<mobile number>.
import type { ReactNode } from 'react';
import type { Education, Experience } from '@vca/shared';

export interface CvData {
  name: string; title: string; email: string; phone: string; location: string;
  summary: string; skills: string[]; experience: Experience[]; education: Education[];
}

export type TemplateId =
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

export const TEMPLATE_IDS: TemplateId[] = ['modern-tech', 'executive-classic', 'minimalist-creative', 'startup-compact', 'ats-pro', 'split-banner', 'timeline-eng', 'nordic-right', 'bold-editorial', 'modern-geometric'];

export const CV_LABELS = { summary: 'Summary', experience: 'Experience', education: 'Education', skills: 'Skills', contact: 'Contact' };
export const initials = (n: string) => (n || '?').split(' ').map((x) => x[0]).slice(0, 2).join('').toUpperCase();

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

export function CvPaper({ cv, tpl, t }: { cv: CvData; tpl: TemplateId; t: typeof CV_LABELS }) {
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
