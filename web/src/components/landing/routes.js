// Public marketing pages: their URLs and SEO metadata. Shared by the landing page
// (client-side title/meta updates) and the build-time prerender (static HTML that
// search engines and link previews read without running JavaScript).

export const SITE_NAME = 'Huddle';

/** route id (used inside the landing page) → URL + SEO */
export const LANDING_ROUTES = {
  home: {
    path: '/',
    title: 'Huddle | Upload your CV once, get matched, talk face to face',
    description:
      'Huddle turns your CV into a living profile: a live ATS score, an AI CV builder for every profession, one-click apply, a permanent public CV link and in-browser video calls with recruiters.',
  },
  'job-seekers': {
    path: '/for-job-seekers',
    title: 'For job seekers: AI CV builder, live ATS score & one-click apply | Huddle',
    description:
      'Upload your CV once or build one by chatting with AI. See your ATS score and missing keywords, apply with one click and get video calls from recruiters, in English, Hindi and 5 more languages.',
  },
  recruiters: {
    path: '/for-recruiters',
    title: 'For recruiters: complete, scored candidates and instant video calls | Huddle',
    description:
      'Post jobs in minutes, receive candidates with complete ATS-scored profiles and CVs attached, shortlist in one click and talk face to face in the browser, no scheduling links.',
  },
  'public-cv-link': {
    path: '/public-cv-link',
    title: 'Your CV, one permanent link. Share it anywhere | Huddle',
    description:
      'Publish your CV at a permanent link (your mobile number). Anyone can view and download it without signing in. Update it or turn it off any time; not indexed by search engines.',
  },
};

const BY_PATH = Object.fromEntries(Object.entries(LANDING_ROUTES).map(([id, r]) => [r.path, id]));

/** "/for-recruiters/" → "recruiters"; unknown → null */
export function routeFromPath(pathname) {
  const p = (pathname || '/').replace(/\/+$/, '') || '/';
  return BY_PATH[p] ?? null;
}
export const isLandingPath = (pathname) => routeFromPath(pathname) !== null;
export const pathForRoute = (id) => (LANDING_ROUTES[id] ?? LANDING_ROUTES.home).path;

function setMeta(attr, key, content) {
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!el) { el = document.createElement('meta'); el.setAttribute(attr, key); document.head.appendChild(el); }
  el.setAttribute('content', content);
}

/** Keep title / description / canonical / Open Graph in step with client-side navigation. */
export function applyRouteMeta(id) {
  if (typeof document === 'undefined') return;
  const r = LANDING_ROUTES[id] ?? LANDING_ROUTES.home;
  const url = `${location.origin}${r.path}`;
  document.title = r.title;
  setMeta('name', 'description', r.description);
  setMeta('name', 'robots', 'index, follow');
  setMeta('property', 'og:title', r.title);
  setMeta('property', 'og:description', r.description);
  setMeta('property', 'og:url', url);
  let link = document.head.querySelector('link[rel="canonical"]');
  if (!link) { link = document.createElement('link'); link.rel = 'canonical'; document.head.appendChild(link); }
  link.href = url;
}
