// Download a CV as PDF or CSV, and publish it at a public link: <app>/<mobile number>.
//
// PDF: the chosen template is rendered off-screen at full A4 size, captured as an
// image (so it looks exactly like the preview) and split across A4 pages. The CV
// text is also written as an invisible layer, so the PDF stays searchable and
// readable by applicant-tracking systems.
import { ApiError, type PublishedCv } from '@vca/shared';
import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { useAuth } from '../../auth/AuthContext';
import { CV_LABELS, CvPaper, type CvData, type TemplateId } from './CvPaper';

const fileBase = (cv: CvData) => (cv.name || 'cv').trim().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'cv';

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ---------- CSV ---------- */
/** Quote a cell; neutralise spreadsheet formulas (=, +, -, @) so opening the file is safe. */
function cell(v: string): string {
  let s = String(v ?? '');
  const phoneLike = /^[+-][\d\s().-]*$/.test(s); // "+91 98765 43210" is data, not a formula
  if (/^[=+\-@\t\r]/.test(s) && !phoneLike) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export function cvToCsv(cv: CvData): string {
  const rows: string[][] = [['Section', 'Title', 'Organisation', 'Start', 'End', 'Details']];
  const contact: [string, string][] = [['Name', cv.name], ['Professional title', cv.title], ['Email', cv.email], ['Phone', cv.phone], ['Location', cv.location]];
  for (const [k, v] of contact) if (v) rows.push(['Contact', k, '', '', '', v]);
  if (cv.summary) rows.push(['Summary', '', '', '', '', cv.summary]);
  for (const e of cv.experience) rows.push(['Experience', e.title, e.company, e.start ?? '', e.end ?? '', e.description ?? '']);
  for (const e of cv.education) rows.push(['Education', e.degree, e.school, '', e.year ?? '', '']);
  for (const s of cv.skills) rows.push(['Skill', s, '', '', '', '']);
  // BOM so Excel opens UTF-8 (₹, accents, Hindi…) correctly.
  return '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n');
}
export function downloadCsv(cv: CvData) {
  saveBlob(new Blob([cvToCsv(cv)], { type: 'text/csv;charset=utf-8' }), `${fileBase(cv)}-CV.csv`);
}

/* ---------- PDF ---------- */
function plainText(cv: CvData): string {
  const out = [cv.name, cv.title, [cv.email, cv.phone, cv.location].filter(Boolean).join(' | ')];
  if (cv.summary) out.push('', CV_LABELS.summary, cv.summary);
  if (cv.experience.length) out.push('', CV_LABELS.experience, ...cv.experience.flatMap((e) => [`${e.title} - ${e.company} (${[e.start, e.end].filter(Boolean).join(' - ')})`, e.description ?? '']));
  if (cv.education.length) out.push('', CV_LABELS.education, ...cv.education.map((e) => `${e.degree}, ${e.school} ${e.year ?? ''}`));
  if (cv.skills.length) out.push('', CV_LABELS.skills, cv.skills.join(', '));
  return out.filter((l) => l !== undefined).join('\n');
}

export async function downloadPdf(cv: CvData, tpl: TemplateId) {
  const [{ toPng }, { jsPDF }] = await Promise.all([import('html-to-image'), import('jspdf')]);
  // Render the paper at real size, off-screen (previews on the page are scaled down).
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:794px;pointer-events:none;';
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    flushSync(() => root.render(<CvPaper cv={cv} tpl={tpl} t={CV_LABELS} />));
    await document.fonts?.ready;
    const paper = host.firstElementChild as HTMLElement;
    const w = paper.offsetWidth;
    const h = paper.offsetHeight;
    const png = await toPng(paper, { pixelRatio: 2, backgroundColor: '#ffffff', width: w, height: h, style: { boxShadow: 'none' } });

    const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    const pageW = 210;
    const pageH = 297;
    const imgH = (h * pageW) / w;
    const pages = Math.max(1, Math.ceil(imgH / pageH - 0.02)); // ignore a sliver of overflow
    for (let i = 0; i < pages; i++) {
      if (i) pdf.addPage();
      pdf.addImage(png, 'PNG', 0, -i * pageH, pageW, imgH, 'cv', 'FAST');
    }
    // Invisible text layer: selectable / searchable / ATS-readable.
    pdf.setPage(1);
    pdf.setFontSize(6);
    pdf.text(pdf.splitTextToSize(plainText(cv), pageW - 20), 10, 10, { renderingMode: 'invisible' });
    pdf.setProperties({ title: `${cv.name || 'CV'} — CV`, subject: cv.title, creator: 'Huddle Resume' });
    pdf.save(`${fileBase(cv)}-CV.pdf`);
  } finally {
    root.unmount();
    host.remove();
  }
}

/* ---------- toolbar ---------- */
const errText = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');
export const publicCvUrl = (slug: string) => `${location.origin}/${slug}`;

/**
 * Download PDF / CSV + "Public link" for any CV on the Resume pages. The link
 * panel and messages open as a popover under the buttons.
 */
export function CvExportBar({ cv, tpl }: { cv: CvData; tpl: TemplateId }) {
  const { api } = useAuth();
  const [busy, setBusy] = useState<'' | 'pdf' | 'link'>('');
  const [published, setPublished] = useState<PublishedCv | null>(null);
  const [panel, setPanel] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);
  useEffect(() => { api.myPublicCv().then((r) => mounted.current && setPublished(r.published)).catch(() => {}); }, [api]);

  const pdf = async () => {
    setBusy('pdf'); setMsg(null);
    try { await downloadPdf(cv, tpl); } catch { setMsg({ ok: false, text: 'Could not create the PDF. Please try again.' }); }
    finally { if (mounted.current) setBusy(''); }
  };
  const publish = async () => {
    setBusy('link'); setMsg(null);
    try {
      const r = await api.publishCv({ cv, template: tpl });
      setPublished(r.published);
      setMsg({ ok: true, text: published ? 'Public CV updated.' : 'Your CV is live at the link below.' });
    } catch (e) { setMsg({ ok: false, text: errText(e) }); }
    finally { if (mounted.current) setBusy(''); }
  };
  const unpublish = async () => {
    setBusy('link'); setMsg(null);
    try { await api.unpublishCv(); setPublished(null); setMsg({ ok: true, text: 'Link turned off — nobody can open it now.' }); }
    catch (e) { setMsg({ ok: false, text: errText(e) }); }
    finally { if (mounted.current) setBusy(''); }
  };
  const copy = async () => {
    if (!published) return;
    try { await navigator.clipboard.writeText(publicCvUrl(published.slug)); setCopied(true); setTimeout(() => setCopied(false), 1500); }
    catch { setMsg({ ok: false, text: 'Copy failed — select the link and copy it.' }); }
  };
  const digits = cv.phone.replace(/\D/g, '');
  const numberChanged = !!published && digits !== published.slug;

  return (
    <div className="cp-export cp-noprint">
      <div className="cp-export__btns">
        <button className="aa-btn aa-btn--primary aa-btn--sm" onClick={() => void pdf()} disabled={!!busy} data-testid="cv-download-pdf">
          {busy === 'pdf' ? 'Preparing PDF…' : 'Download PDF'}
        </button>
        <button className="aa-btn aa-btn--sm" onClick={() => downloadCsv(cv)} disabled={!!busy} data-testid="cv-download-csv">Download CSV</button>
        <button className={`aa-btn aa-btn--sm${panel ? ' is-on' : ''}`} onClick={() => setPanel((p) => !p)} aria-expanded={panel} data-testid="cv-public-link">
          {published ? 'Public link · on' : 'Public link'}
        </button>
      </div>
      {(panel || msg) && (
        <div className="cp-export__pop">
      {msg && <p className={`aa-msg${msg.ok ? ' aa-msg--ok' : ''}`} role="status">{msg.text}</p>}
      {panel && (
        <div className="cp-export__panel" data-testid="cv-public-panel">
          {published ? (
            <>
              <div className="cp-export__url">
                <a href={publicCvUrl(published.slug)} target="_blank" rel="noreferrer" data-testid="cv-public-url">{publicCvUrl(published.slug)}</a>
                <button className="aa-btn aa-btn--sm" onClick={() => void copy()}>{copied ? 'Copied' : 'Copy'}</button>
              </div>
              <p className="cp-help">
                Anyone with this link can see the published copy, including your email and phone.
                {numberChanged ? ' Your phone number changed — updating will move the link to the new number.' : ' Edits here don’t go live until you update.'}
              </p>
              <div className="cp-export__btns">
                <button className="aa-btn aa-btn--primary aa-btn--sm" onClick={() => void publish()} disabled={!!busy} data-testid="cv-publish">{busy === 'link' ? 'Saving…' : 'Update public CV'}</button>
                <button className="aa-btn aa-btn--sm aa-btn--danger" onClick={() => void unpublish()} disabled={!!busy} data-testid="cv-unpublish">Turn off link</button>
              </div>
            </>
          ) : (
            <>
              <p className="cp-help">
                Share your CV with anyone — no sign-in needed. Your link will be
                {' '}<strong>{digits.length >= 7 ? publicCvUrl(digits) : `${location.origin}/<your mobile number>`}</strong>.
                It shows your email and phone. You can turn it off any time.
              </p>
              {digits.length < 7 && <p className="cp-help cp-export__warn">Add your mobile number to the CV first — it becomes your link.</p>}
              <button className="aa-btn aa-btn--primary aa-btn--sm" onClick={() => void publish()} disabled={!!busy || digits.length < 7} data-testid="cv-publish">{busy === 'link' ? 'Publishing…' : 'Publish my CV'}</button>
            </>
          )}
        </div>
      )}
        </div>
      )}
    </div>
  );
}
