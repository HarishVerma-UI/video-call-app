// Public CV at <app>/<mobile number> — open to anyone, no sign-in. Shows the copy
// the member published, in their chosen template, with PDF / CSV downloads.
import { createApi, type PublicCv } from '@vca/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import { API_BASE } from '../../config';
import { CV_LABELS, CvPaper, TEMPLATE_IDS, type TemplateId } from './CvPaper';
import { downloadCsv, downloadPdf } from './CvExport';
import './career.css';

/** "/919876543210" → "919876543210" (7–15 digits), else null. */
export function publicCvSlug(pathname: string): string | null {
  return pathname.match(/^\/(\d{7,15})\/?$/)?.[1] ?? null;
}

export function PublicCvPage({ slug }: { slug: string }) {
  const api = useMemo(() => createApi(API_BASE, () => null), []);
  const [data, setData] = useState<PublicCv | null>(null);
  const [error, setError] = useState<'' | 'missing' | 'failed'>('');
  const [busy, setBusy] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  // Members share these links themselves; keep them out of search results.
  useEffect(() => {
    const m = document.createElement('meta');
    m.name = 'robots';
    m.content = 'noindex, nofollow';
    document.head.appendChild(m);
    return () => m.remove();
  }, []);
  useEffect(() => {
    api.publicCv(slug)
      .then((r) => { setData(r); document.title = `${r.cv.name || 'CV'} | CV`; })
      .catch((e: { status?: number }) => setError(e?.status === 404 ? 'missing' : 'failed'));
  }, [api, slug]);
  useEffect(() => {
    const fit = () => { const w = wrap.current?.clientWidth; if (w) setScale(Math.min(1, w / 794)); };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [data]);

  const tpl: TemplateId = TEMPLATE_IDS.includes(data?.template as TemplateId) ? (data!.template as TemplateId) : 'modern-tech';
  const pdf = async () => {
    if (!data) return;
    setBusy(true);
    try { await downloadPdf(data.cv, tpl); } finally { setBusy(false); }
  };

  return (
    <div className="pcv">
      <div className="pcv__bar">
        <a className="pcv__brand" href="/">Huddle <span>· Resume</span></a>
        {data && (
          <div className="pcv__btns">
            <button className="pcv__btn pcv__btn--primary" onClick={() => void pdf()} disabled={busy} data-testid="pcv-pdf">{busy ? 'Preparing…' : 'Download PDF'}</button>
            <button className="pcv__btn" onClick={() => downloadCsv(data.cv)} data-testid="pcv-csv">Download CSV</button>
          </div>
        )}
      </div>
      {!data && !error && <div className="pcv__msg" aria-busy="true"><p>Loading CV…</p></div>}
      {error && (
        <div className="pcv__msg" data-testid="pcv-missing">
          <h1>{error === 'missing' ? 'No CV at this link' : 'Couldn’t load this CV'}</h1>
          <p>{error === 'missing' ? 'It may have been turned off by its owner, or the number is wrong.' : 'Please check your connection and try again.'}</p>
        </div>
      )}
      {data && (
        <div className="pcv__paper" ref={wrap} style={{ height: 1123 * scale }} data-testid="pcv-paper">
          <div style={{ width: 794, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
            <CvPaper cv={data.cv} tpl={tpl} t={CV_LABELS} />
          </div>
        </div>
      )}
      {data && <p className="pcv__foot">Updated {new Date(data.updatedAt).toLocaleDateString()} · Made with Huddle</p>}
    </div>
  );
}
