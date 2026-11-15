import { ApiError, type ApplicationStatus, type Job, type JobApplication, type JobInput, type RecruiterDashboard as Dash } from '@vca/shared';
import { useCallback, useEffect, useState, type FormEvent, type MouseEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { BriefcaseIcon, CloseIcon, PencilIcon, PlusIcon, TrashIcon } from './Icons';
import { Line } from './Line';
import { Avatar } from './RoomBadge';

const initial = (s: string) => (s || '?').charAt(0).toUpperCase();
const salaryText = (j: Pick<Job, 'salaryMin' | 'salaryMax' | 'salaryCurrency'>) => {
  const f = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));
  if (j.salaryMin && j.salaryMax) return `${j.salaryCurrency} ${f(j.salaryMin)}–${f(j.salaryMax)}`;
  if (j.salaryMin) return `${j.salaryCurrency} ${f(j.salaryMin)}+`;
  return null;
};

/* ── status control shared by recent list + applicants modal ── */
function StatusSelect({ value, onChange }: { value: ApplicationStatus; onChange: (s: ApplicationStatus) => void }) {
  return (
    <select className={`rec-status rec-status--${value}`} value={value} onChange={(e) => onChange(e.target.value as ApplicationStatus)} aria-label="Application status">
      <option value="applied">Applied</option>
      <option value="shortlisted">Shortlisted</option>
      <option value="rejected">Not selected</option>
    </select>
  );
}

/* ── create / edit a job ── */
function JobForm({ editing, onClose, onSaved }: { editing: Job | null; onClose: () => void; onSaved: () => void }) {
  const { api } = useAuth();
  const [f, setF] = useState<JobInput>({
    title: editing?.title ?? '', company: editing?.company ?? '', category: editing?.category ?? 'tech',
    country: editing?.country ?? '', type: editing?.type ?? 'full-time', experience: editing?.experience ?? 'mid',
    salaryMin: editing?.salaryMin ?? null, salaryMax: editing?.salaryMax ?? null, salaryCurrency: editing?.salaryCurrency ?? 'INR',
    remote: editing?.remote ?? false, description: editing?.description ?? '', active: editing?.active ?? true,
    applyUrl: editing?.applyUrl ?? '', source: editing?.source ?? '',
  });
  const [skills, setSkills] = useState((editing?.skills ?? []).join(', '));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const upd = <K extends keyof JobInput>(k: K, v: JobInput[K]) => setF((c) => ({ ...c, [k]: v }));
  const numOrNull = (s: string) => (s.trim() === '' ? null : Number(s.replace(/[^\d.]/g, '')) || null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null); setFields({});
    try {
      const input: JobInput = { ...f, title: f.title.trim(), company: (f.company ?? '').trim(), skills: skills.split(',').map((s) => s.trim()).filter(Boolean) };
      if (editing) await api.recruiterUpdateJob(editing.id, input);
      else await api.recruiterCreateJob(input);
      onSaved();
    } catch (ex) {
      const ae = ex instanceof ApiError ? ex : null;
      setFields(ae?.fields ?? {});
      setErr(ae?.message ?? 'Could not save this job.');
      setBusy(false);
    }
  };

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label={editing ? 'Edit role' : 'Post a role'} onClick={onClose}>
      <form className="modal__card card job-form" onClick={(e: MouseEvent) => e.stopPropagation()} onSubmit={submit} noValidate>
        <header className="card__head">
          <div><h2>{editing ? 'Edit role' : 'Post a role'}</h2><p>Appears on the Jobs board and in your pipeline.</p></div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><CloseIcon width={20} height={20} /></button>
        </header>
        <div className="card__grid">
          <Line name="r-title" label="Title" type="text" autoComplete="off" value={f.title} onChange={(v) => upd('title', v)} error={fields.title} />
          <Line name="r-company" label="Company" type="text" autoComplete="off" value={f.company ?? ''} onChange={(v) => upd('company', v)} error={fields.company} />
        </div>
        <div className="job-form__row">
          <label className="admin__field"><span>Category</span>
            <select className="admin__select" value={f.category} onChange={(e) => upd('category', e.target.value as Job['category'])}><option value="tech">Tech</option><option value="non-tech">Non-Tech</option></select>
          </label>
          <label className="admin__field"><span>Type</span>
            <select className="admin__select" value={f.type} onChange={(e) => upd('type', e.target.value as Job['type'])}>
              <option value="full-time">Full-time</option><option value="part-time">Part-time</option><option value="contract">Contract</option><option value="internship">Internship</option>
            </select>
          </label>
          <label className="admin__field"><span>Experience</span>
            <select className="admin__select" value={f.experience} onChange={(e) => upd('experience', e.target.value as Job['experience'])}>
              <option value="entry">Entry</option><option value="mid">Mid</option><option value="senior">Senior</option><option value="lead">Lead</option>
            </select>
          </label>
        </div>
        <div className="job-form__row">
          <Line name="r-country" label="Location" type="text" autoComplete="off" value={f.country ?? ''} onChange={(v) => upd('country', v)} />
          <Line name="r-cur" label="Currency" type="text" autoComplete="off" value={f.salaryCurrency ?? ''} onChange={(v) => upd('salaryCurrency', v)} />
          <Line name="r-min" label="Salary min" type="text" autoComplete="off" value={f.salaryMin == null ? '' : String(f.salaryMin)} onChange={(v) => upd('salaryMin', numOrNull(v))} />
          <Line name="r-max" label="Salary max" type="text" autoComplete="off" value={f.salaryMax == null ? '' : String(f.salaryMax)} onChange={(v) => upd('salaryMax', numOrNull(v))} />
        </div>
        <div className="line">
          <label htmlFor="r-desc">Description</label>
          <div className="line__row"><textarea id="r-desc" className="pp-textarea" rows={4} maxLength={8000} value={f.description ?? ''} onChange={(e) => upd('description', e.target.value)} /></div>
          <span className="line__rule" />
        </div>
        <Line name="r-skills" label="Skills (comma separated)" type="text" autoComplete="off" value={skills} onChange={setSkills} />
        <Line name="r-apply" label="Apply URL — opens the company’s site (optional)" type="text" autoComplete="off" value={f.applyUrl ?? ''} onChange={(v) => upd('applyUrl', v)} error={fields.applyUrl} />
        <div className="job-form__toggles">
          <label className="admin-ads__active"><input type="checkbox" checked={!!f.remote} onChange={(e) => upd('remote', e.target.checked)} /> Remote</label>
          <label className="admin-ads__active"><input type="checkbox" checked={f.active !== false} onChange={(e) => upd('active', e.target.checked)} /> Active (visible on the Jobs board)</label>
        </div>
        {err && <p className="form-msg" role="alert">{err}</p>}
        <div className="modal__actions">
          <button type="button" className="btn btn--secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn--primary" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Publish role'}</button>
        </div>
      </form>
    </div>
  );
}

/* ── applicants for one role ── */
function ApplicantsModal({ job, onClose, onChanged }: { job: Job; onClose: () => void; onChanged: () => void }) {
  const { api } = useAuth();
  const [applicants, setApplicants] = useState<JobApplication[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api.recruiterApplicants(job.id).then(({ applicants }) => setApplicants(applicants)).catch(() => setApplicants([]));
  }, [api, job.id]);
  const setStatus = async (a: JobApplication, status: ApplicationStatus) => {
    setErr(null);
    try {
      await api.recruiterSetApplicationStatus(a.id, status);
      setApplicants((cur) => cur?.map((x) => (x.id === a.id ? { ...x, status } : x)) ?? cur);
      onChanged();
    } catch (ex) {
      setErr(ex instanceof ApiError ? ex.message : 'Could not update status.');
    }
  };
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label={`Candidates for ${job.title}`} onClick={onClose}>
      <div className="modal__card card" onClick={(e: MouseEvent) => e.stopPropagation()}>
        <header className="card__head"><div><h2>Candidates</h2><p>{job.title} · {job.company}</p></div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><CloseIcon width={20} height={20} /></button></header>
        {err && <p className="form-msg" role="alert">{err}</p>}
        {applicants === null ? <div className="skeleton-list" aria-hidden="true"><i /></div> : applicants.length === 0 ? (
          <p className="card__empty">No candidates yet.</p>
        ) : (
          <div className="admin-dir__list">
            {applicants.map((a) => (
              <div key={a.id} className="rec-applicant">
                <Avatar id={a.userId} name={a.profile?.name || a.userName || '?'} size={38} />
                <div className="rec-applicant__info">
                  <strong>{a.profile?.name || a.userName}</strong>
                  {a.profile?.headline && <span>{a.profile.headline}</span>}
                  {a.note && <em>“{a.note}”</em>}
                </div>
                <StatusSelect value={a.status} onChange={(s) => void setStatus(a, s)} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── main ── */
export function RecruiterDashboard() {
  const { api, user } = useAuth();
  const [data, setData] = useState<Dash | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Job | null>(null);
  const [applicantsFor, setApplicantsFor] = useState<Job | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    api.recruiterDashboard().then(setData).catch(() => setData({ jobCount: 0, funnel: { total: 0, applied: 0, shortlisted: 0, rejected: 0 }, jobs: [], recentApplicants: [] }));
  }, [api]);
  useEffect(() => load(), [load]);

  const remove = async (job: Job) => {
    if (!window.confirm(`Delete “${job.title}”? Applications to it will be removed too.`)) return;
    try { await api.recruiterDeleteJob(job.id); load(); } catch (ex) { setErr(ex instanceof ApiError ? ex.message : 'Could not delete the role.'); }
  };
  const moveStatus = async (a: JobApplication, status: ApplicationStatus) => {
    try { await api.recruiterSetApplicationStatus(a.id, status); load(); } catch { /* ignore */ }
  };

  const exportAts = () => {
    if (!data) return;
    const rows = [['Candidate', 'Role', 'Status', 'Applied']];
    for (const a of data.recentApplicants) rows.push([a.profile?.name || a.userName || '', a.job?.title || '', a.status, a.createdAt || '']);
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const el = document.createElement('a');
    el.href = url; el.download = `huddle-ats-${new Date().toISOString().slice(0, 10)}.csv`;
    el.click();
    URL.revokeObjectURL(url);
  };

  if (!data) return <section className="page rec"><div className="skeleton-list" aria-hidden="true"><i /><i /></div></section>;
  const { funnel, jobs, recentApplicants, jobCount } = data;
  const rate = funnel.total ? Math.round((funnel.shortlisted / funnel.total) * 100) : 0;
  const stages: { label: string; n: number; cls: string }[] = [
    { label: 'Applied', n: funnel.applied, cls: 'applied' },
    { label: 'Shortlisted', n: funnel.shortlisted, cls: 'shortlisted' },
    { label: 'Not selected', n: funnel.rejected, cls: 'rejected' },
  ];
  const maxStage = Math.max(1, ...stages.map((s) => s.n));

  return (
    <div className="admin-shell">
      <section className="page rec" data-testid="recruiter-dashboard">
      <header className="rec__head">
        <div>
          <h1>Welcome back, {(user?.name || 'there').split(' ')[0]}</h1>
          <p>Your talent pipeline across {jobCount} open role{jobCount !== 1 ? 's' : ''}.</p>
        </div>
        <button className="btn btn--secondary btn--small" onClick={exportAts} disabled={recentApplicants.length === 0} title="Download recent applicants as CSV">⭳ Export ATS data</button>
        <button className="btn btn--primary" onClick={() => { setEditing(null); setFormOpen(true); }} data-testid="rec-post"><PlusIcon width={16} height={16} /> Post a role</button>
      </header>
      {err && <p className="form-msg" role="alert">{err}</p>}

      <div className="rec__tiles" id="overview">
        <div className="rec-tile"><span className="rec-tile__n">{funnel.total}</span><span className="rec-tile__l">Total applicants</span></div>
        <div className="rec-tile"><span className="rec-tile__n">{rate}%</span><span className="rec-tile__l">Shortlist rate</span></div>
        <div className="rec-tile"><span className="rec-tile__n">{jobCount}</span><span className="rec-tile__l">Active roles</span></div>
        <div className="rec-tile"><span className="rec-tile__n">{funnel.shortlisted}</span><span className="rec-tile__l">Shortlisted</span></div>
      </div>

      <div className="rec__grid" id="funnel">
        <div className="card rec-funnel">
          <h2>Candidate funnel</h2>
          <p className="rec-funnel__sub">Where your {funnel.total} applicant{funnel.total !== 1 ? 's' : ''} stand.</p>
          <div className="rec-funnel__stages">
            {stages.map((s) => (
              <div key={s.label} className="rec-stage">
                <div className="rec-stage__top"><span>{s.label}</span><strong>{s.n}</strong></div>
                <div className="rec-stage__bar"><span className={`rec-stage__fill rec-stage__fill--${s.cls}`} style={{ width: `${(s.n / maxStage) * 100}%` }} /></div>
              </div>
            ))}
          </div>
        </div>

        <div className="card rec-recent" id="applicants">
          <h2>Recent applicants</h2>
          {recentApplicants.length === 0 ? (
            <p className="card__empty">No applicants yet. Share your roles to get candidates.</p>
          ) : (
            <ul className="rec-recent__list">
              {recentApplicants.map((a) => (
                <li key={a.id} className="rec-recent__row">
                  <Avatar id={a.userId} name={a.profile?.name || a.userName || '?'} size={36} />
                  <div className="rec-recent__who">
                    <strong>{a.profile?.name || a.userName}</strong>
                    <span>{a.job?.title ?? 'Role'}</span>
                  </div>
                  <StatusSelect value={a.status} onChange={(s) => void moveStatus(a, s)} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="card rec-reqs" id="jobs">
        <header className="rec-reqs__head"><h2>Active requisitions</h2><span className="rec-reqs__count">{jobCount} role{jobCount !== 1 ? 's' : ''}</span></header>
        {jobs.length === 0 ? (
          <p className="card__empty">You haven’t posted any roles yet. Post one to start sourcing.</p>
        ) : (
          <div className="rec-reqs__grid">
            {jobs.map((j) => {
              const sal = salaryText(j);
              const n = j.applicantCount ?? 0;
              return (
                <div key={j.id} className={`rec-reqcard${j.active ? '' : ' is-hidden'}`}>
                  <div className="rec-reqcard__top">
                    <span className="rec-req__logo" aria-hidden="true">{initial(j.company)}</span>
                    <span className={`rec-reqcard__state rec-reqcard__state--${j.active ? 'live' : 'off'}`}>{j.active ? 'Live' : 'Hidden'}</span>
                  </div>
                  <strong className="rec-reqcard__title">{j.title}</strong>
                  <span className="rec-reqcard__meta">{j.company}{j.country ? ` · ${j.country}` : ''}{j.remote ? ' · Remote' : ''}</span>
                  {sal && <span className="rec-reqcard__sal">{sal}</span>}
                  <button className="rec-reqcard__count" onClick={() => setApplicantsFor(j)} data-testid="rec-view-candidates">
                    <b>{n}</b> candidate{n !== 1 ? 's' : ''} →
                  </button>
                  <div className="rec-reqcard__actions">
                    <button className="link-btn" onClick={() => { setEditing(j); setFormOpen(true); }} aria-label="Edit role"><PencilIcon width={14} height={14} /> Edit</button>
                    <button className="link-btn admin-dir__danger" onClick={() => void remove(j)} aria-label="Delete role"><TrashIcon width={14} height={14} /></button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {formOpen && <JobForm editing={editing} onClose={() => setFormOpen(false)} onSaved={() => { setFormOpen(false); load(); }} />}
      {applicantsFor && <ApplicantsModal job={applicantsFor} onClose={() => setApplicantsFor(null)} onChanged={load} />}
      <p className="rec__foot"><BriefcaseIcon width={14} height={14} /> You see only the roles you posted and their candidates.</p>
      </section>
    </div>
  );
}
