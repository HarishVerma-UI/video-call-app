// Public CV links: a member publishes their CV at <app>/<mobile number>, readable
// by anyone with the link (no sign-in). Opt-in only; the member can unpublish.
//
//   GET    /api/career/public-cv     your published link (or null)       [signed in]
//   PUT    /api/career/public-cv     publish { cv, template }            [signed in]
//   DELETE /api/career/public-cv     unpublish                           [signed in]
//   GET    /api/public/cv/:number    the published CV                    [anyone]
//
// The slug is the CV's phone number, digits only. A number can belong to one
// member at a time (first to publish keeps it). Public reads are rate-limited per
// IP so nobody can cheaply walk through phone numbers.
import { HttpError, clientIp, readJson, sendJson } from './http.js';
import { createRateLimiter } from './auth/rateLimit.js';
import { cleanCv } from './cvChat.js';

export const CV_TEMPLATES = ['modern-tech', 'executive-classic', 'minimalist-creative', 'startup-compact', 'ats-pro', 'split-banner', 'timeline-eng', 'nordic-right', 'bold-editorial', 'modern-geometric'];

/** "+91 98765-43210" → "919876543210"; null unless 7–15 digits (E.164 length). */
export function phoneSlug(phone) {
  const digits = String(phone ?? '').replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 15 ? digits : null;
}

const shape = (d) => d && { slug: d.slug, template: d.template, updatedAt: d.updatedAt instanceof Date ? d.updatedAt.toISOString() : d.updatedAt };

export function createPublicCv({ store, requireUser, trustProxy = false, log = () => {} }) {
  const readLimiter = createRateLimiter({ limit: 30, windowMs: 60_000 });
  const writeLimiter = createRateLimiter({ limit: 10, windowMs: 60_000 });

  return {
    async handle(req, res, pathname) {
      const pub = pathname.match(/^\/api\/public\/cv\/([0-9]{1,20})$/);
      if (pub && req.method === 'GET') {
        const lim = readLimiter.hit(clientIp(req, trustProxy));
        if (!lim.ok) throw new HttpError(429, 'Too many requests — try again in a minute.', { retryAfterSec: lim.retryAfterSec });
        const doc = await store.get(pub[1]);
        if (!doc) throw new HttpError(404, 'No CV is published at this link.');
        sendJson(res, 200, { cv: cleanCv(doc.cv), template: doc.template, updatedAt: shape(doc).updatedAt }, { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' });
        return true;
      }

      if (pathname !== '/api/career/public-cv') return false;
      const user = await requireUser(req);
      if (req.method === 'GET') {
        sendJson(res, 200, { published: shape(await store.getByUser(user.id)) });
        return true;
      }
      if (req.method === 'DELETE') {
        await store.removeByUser(user.id);
        log(`public cv unpublished by ${user.id}`);
        sendJson(res, 200, { published: null });
        return true;
      }
      if (req.method === 'PUT') {
        const lim = writeLimiter.hit(user.id);
        if (!lim.ok) throw new HttpError(429, 'Too many updates — wait a moment.', { retryAfterSec: lim.retryAfterSec });
        const b = await readJson(req, 128 * 1024);
        const cv = cleanCv(b.cv);
        const slug = phoneSlug(cv.phone);
        if (!slug) throw new HttpError(400, 'Add a valid mobile number to your CV first — it becomes your link.');
        if (!cv.name) throw new HttpError(400, 'Add your name to the CV first.');
        const template = CV_TEMPLATES.includes(b.template) ? b.template : CV_TEMPLATES[0];
        const owner = await store.get(slug);
        if (owner && owner.userId !== user.id) throw new HttpError(409, 'This mobile number’s link is already used by another member.');
        const doc = await store.put(user.id, slug, { cv, template });
        log(`public cv published by ${user.id}`);
        sendJson(res, 200, { published: shape(doc) });
        return true;
      }
      throw new HttpError(405, 'Method not allowed');
    },
    close() { readLimiter.close(); writeLimiter.close(); },
  };
}
