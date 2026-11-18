// Read-only candidate detail drawer, shared by the admin console and the
// recruiter people directory. Shows every profile field staff may review —
// contact, expected salary, skills, experience, education and the CV — with no
// edit controls. It renders nothing destructive; callers decide whether to show
// their own actions elsewhere.
import { useEffect } from 'react';
import { ROLE_LABEL, normalizeRole, type AdminUser, type DirectoryUser, type UserRole } from '@vca/shared';

type DetailUser = AdminUser | DirectoryUser;

const AV = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#6250d6', '#008300', '#e34948'];
const avColor = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return AV[h % AV.length]; };
const initials = (n: string) => (n || '?').split(' ').map((x) => x[0]).slice(0, 2).join('').toUpperCase();
const fmtDate = (s?: string | null) => (s ? new Date(s).toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const roleCls = (role?: UserRole | string) => {
  const r = normalizeRole(role || 'member');
  return r === 'super_admin' ? 'admin' : r === 'recruiter' ? 'recruiter' : 'member';
};

function Ic({ d, size = 16 }: { d: string; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;
}
function Row({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return <div className="aa-dl"><dt>{label}</dt><dd>{value}</dd></div>;
}

export function UserDetailDrawer({ user, onClose }: { user: DetailUser; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const p = user.profile ?? null;
  const exp = p?.experience ?? [];
  const edu = p?.education ?? [];

  return (
    <div className="aa-drawer" role="dialog" aria-modal="true" aria-label={`${user.name} details`}>
      <div className="aa-drawer__scrim" onClick={onClose} />
      <aside className="aa-drawer__panel">
        <header className="aa-drawer__head">
          <span className="aa-u__av aa-u__av--lg" style={{ background: avColor(user.name) }}>{initials(user.name)}</span>
          <div className="aa-drawer__who">
            <div className="aa-drawer__name">{user.name}</div>
            <div className="aa-drawer__mail">{user.email || '—'}</div>
            <span className={`aa-pill aa-pill--${roleCls(user.role)}`}>{ROLE_LABEL[normalizeRole(user.role || 'member')]}</span>
          </div>
          <button className="aa-iconbtn" onClick={onClose} aria-label="Close"><Ic d="M18 6 6 18M6 6l12 12" size={18} /></button>
        </header>

        <div className="aa-drawer__body">
          {p?.headline && <p className="aa-drawer__headline">{p.headline}</p>}

          <dl className="aa-dlgrid">
            <Row label="Joined" value={fmtDate(user.createdAt)} />
            <Row label="Last active" value={user.lastLoginAt ? fmtDate(user.lastLoginAt) : '—'} />
            <Row label="Location" value={p?.location} />
            <Row label="Mobile" value={p?.mobile} />
            <Row label="Expected salary" value={p?.expectedSalary} />
          </dl>

          {p?.bio && <section className="aa-drawer__sec"><h4>About</h4><p className="aa-drawer__bio">{p.bio}</p></section>}

          {p?.skills && p.skills.length > 0 && (
            <section className="aa-drawer__sec">
              <h4>Skills</h4>
              <div className="aa-chips">{p.skills.map((s, i) => <span className="aa-chip" key={i}>{s}</span>)}</div>
            </section>
          )}

          {exp.length > 0 && (
            <section className="aa-drawer__sec">
              <h4>Experience</h4>
              {exp.map((e, i) => (
                <div className="aa-timeline" key={i}>
                  <div className="aa-timeline__role">{e.title}{e.company ? ` · ${e.company}` : ''}</div>
                  {(e.start || e.end) && <div className="aa-timeline__when">{[e.start, e.end].filter(Boolean).join(' – ')}</div>}
                  {e.description && <p className="aa-timeline__desc">{e.description}</p>}
                </div>
              ))}
            </section>
          )}

          {edu.length > 0 && (
            <section className="aa-drawer__sec">
              <h4>Education</h4>
              {edu.map((e, i) => (
                <div className="aa-timeline" key={i}>
                  <div className="aa-timeline__role">{e.degree || e.school}</div>
                  {(e.school || e.year) && <div className="aa-timeline__when">{[e.degree ? e.school : '', e.year].filter(Boolean).join(' · ')}</div>}
                </div>
              ))}
            </section>
          )}

          <section className="aa-drawer__sec">
            <h4>Resume</h4>
            {p?.cvUrl
              ? <a className="aa-btn aa-btn--primary" href={p.cvUrl} target="_blank" rel="noreferrer"><Ic d="M12 3v12M8 11l4 4 4-4M5 21h14" size={15} /> Download CV{p.cvName ? ` · ${p.cvName}` : ''}</a>
              : <p className="aa-drawer__muted">No CV uploaded.</p>}
          </section>
        </div>
      </aside>
    </div>
  );
}
