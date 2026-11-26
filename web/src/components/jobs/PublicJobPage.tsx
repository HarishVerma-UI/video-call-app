// Public job view at /jobs/<id> — shown to signed-out visitors who open a shared
// job link. Anyone can read the posting; applying sends them to sign in / sign up.
import { createApi, type Job } from '@vca/shared';
import { useEffect, useMemo, useState } from 'react';
import { API_BASE } from '../../config';

/** "/jobs/abc123" → "abc123", else null. (Not the plural listing route "/jobs".) */
export function publicJobId(pathname: string): string | null {
  return pathname.match(/^\/jobs\/([^/]+)\/?$/)?.[1] ?? null;
}

const fmtSalary = (job: Job): string => {
  const c = job.salaryCurrency || '';
  const n = (v: number) => v.toLocaleString('en-IN');
  if (job.salaryMin && job.salaryMax) return `${c}${n(job.salaryMin)} – ${c}${n(job.salaryMax)}`;
  if (job.salaryMin) return `From ${c}${n(job.salaryMin)}`;
  if (job.salaryMax) return `Up to ${c}${n(job.salaryMax)}`;
  return '';
};

export function PublicJobPage({ jobId }: { jobId: string }) {
  const api = useMemo(() => createApi(API_BASE, () => null), []);
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<'' | 'missing' | 'failed'>('');

  useEffect(() => {
    api.publicJob(jobId)
      .then((r) => { setJob(r.job); document.title = `${r.job.title} at ${r.job.company} | Huddle`; })
      .catch((e: { status?: number }) => setError(e?.status === 404 ? 'missing' : 'failed'));
  }, [api, jobId]);

  if (error) {
    return (
      <div className="pubjob">
        <div className="pubjob__card pubjob__empty">
          <h1>{error === 'missing' ? 'This job isn’t available' : 'Couldn’t load this job'}</h1>
          <p>{error === 'missing' ? 'The posting may have been closed or removed.' : 'Please try again in a moment.'}</p>
          <a className="btn btn--primary" href="/">Go to Huddle</a>
        </div>
      </div>
    );
  }
  if (!job) return <div className="pubjob"><div className="pubjob__card"><span className="spinner" /></div></div>;

  const salary = fmtSalary(job);
  const applyHref = `/register?next=${encodeURIComponent(`/jobs/${job.id}`)}`;
  const signInHref = `/login?next=${encodeURIComponent(`/jobs/${job.id}`)}`;

  return (
    <div className="pubjob">
      <header className="pubjob__top">
        <a className="pubjob__brand" href="/">Huddle</a>
        <a className="btn btn--secondary btn--sm" href={signInHref}>Sign in</a>
      </header>

      <div className="pubjob__card">
        <div className="pubjob__eyebrow">Shared job</div>
        <h1 className="pubjob__title">{job.title}</h1>
        <div className="pubjob__company">{job.company}{job.country ? ` · ${job.country}` : ''}</div>

        <div className="pubjob__tags">
          <span className="pubjob__tag">{job.type}</span>
          <span className="pubjob__tag">{job.experience}</span>
          {job.remote && <span className="pubjob__tag pubjob__tag--good">Remote</span>}
          {job.category && <span className="pubjob__tag">{job.category === 'non-tech' ? 'Non-tech' : 'Tech'}</span>}
          {salary && <span className="pubjob__tag pubjob__tag--pay">{salary}</span>}
        </div>

        {job.description && <section className="pubjob__sec"><h2>About the role</h2><p className="pubjob__desc">{job.description}</p></section>}

        {job.requirements.length > 0 && (
          <section className="pubjob__sec">
            <h2>Requirements</h2>
            <ul className="pubjob__list">{job.requirements.map((r, i) => <li key={i}>{r}</li>)}</ul>
          </section>
        )}

        {job.skills.length > 0 && (
          <section className="pubjob__sec">
            <h2>Skills</h2>
            <div className="pubjob__chips">{job.skills.map((s, i) => <span className="pubjob__chip" key={i}>{s}</span>)}</div>
          </section>
        )}

        <div className="pubjob__cta">
          <p>Sign in or create a free account to apply with your Huddle profile.</p>
          <div className="pubjob__cta-row">
            <a className="btn btn--primary" href={applyHref} data-testid="pubjob-apply">Create account & apply</a>
            <a className="btn btn--secondary" href={signInHref}>I already have an account</a>
          </div>
        </div>
      </div>
    </div>
  );
}
