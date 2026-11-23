import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { build, defineConfig, type Plugin } from 'vite';

// In development the web app runs on :5173 and the Node server on :3001.
// These proxies make /ws and /api look same-origin, so no CORS or URL juggling.
const SERVER = process.env.VITE_DEV_SERVER ?? 'http://localhost:3001';
// Public address used in canonical links, Open Graph and the sitemap.
const SITE_URL = (process.env.SITE_URL ?? 'https://harish007.duckdns.org').replace(/\/+$/, '');

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * After the client build, render every public landing page to static HTML
 * (dist/landing/*.html) with full SEO tags, plus sitemap.xml and robots.txt.
 * The Node server serves these files for /, /for-job-seekers, … (see server/src/app.js).
 */
function prerenderLanding(): Plugin {
  let root = '';
  let outDir = '';
  let skip = false;
  return {
    name: 'huddle-prerender-landing',
    apply: 'build',
    configResolved(c) {
      root = c.root;
      outDir = path.resolve(c.root, c.build.outDir);
      skip = !!c.build.ssr || process.env.HUDDLE_SKIP_PRERENDER === '1';
    },
    async closeBundle() {
      if (skip) return;
      const ssrOut = path.resolve(root, 'node_modules/.huddle-prerender');
      await build({
        configFile: false,
        root,
        logLevel: 'warn',
        plugins: [react(), tailwindcss()],
        build: { ssr: 'src/components/landing/entry-server.jsx', outDir: ssrOut, emptyOutDir: true, sourcemap: false },
      });
      const entry = fs.readdirSync(ssrOut).find((f) => /^entry-server\.(m?js)$/.test(f));
      if (!entry) throw new Error('prerender: SSR entry not built');
      const mod = await import(pathToFileURL(path.join(ssrOut, entry)).href + `?t=${Date.now()}`);
      const template = fs.readFileSync(path.join(outDir, 'index.html'), 'utf8');
      const routes = mod.LANDING_ROUTES as Record<string, { path: string; title: string; description: string }>;
      const faq = mod.FAQ_ITEMS as { q: string; a: string }[];
      fs.mkdirSync(path.join(outDir, 'landing'), { recursive: true });

      for (const [id, r] of Object.entries(routes)) {
        const url = `${SITE_URL}${r.path}`;
        const jsonLd: object[] = [
          { '@context': 'https://schema.org', '@type': 'Organization', name: 'Huddle', url: SITE_URL, logo: `${SITE_URL}/icon-512.png` },
          { '@context': 'https://schema.org', '@type': 'WebSite', name: 'Huddle', url: SITE_URL },
          { '@context': 'https://schema.org', '@type': 'WebPage', name: r.title, description: r.description, url },
        ];
        if (id === 'home') {
          jsonLd.push({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
          });
        }
        const head = [
          `<title>${esc(r.title)}</title>`,
          `<meta name="description" content="${esc(r.description)}" />`,
          `<meta name="robots" content="index, follow" />`,
          `<link rel="canonical" href="${url}" />`,
          `<meta property="og:site_name" content="Huddle" />`,
          `<meta property="og:type" content="website" />`,
          `<meta property="og:url" content="${url}" />`,
          `<meta property="og:title" content="${esc(r.title)}" />`,
          `<meta property="og:description" content="${esc(r.description)}" />`,
          `<meta property="og:image" content="${SITE_URL}/icon-512.png" />`,
          `<meta name="twitter:card" content="summary" />`,
          `<meta name="twitter:title" content="${esc(r.title)}" />`,
          `<meta name="twitter:description" content="${esc(r.description)}" />`,
          `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>`,
          // Signed-in visitors to "/" go straight to the app: hide the static page until React decides.
          id === 'home'
            ? `<script>try{if(localStorage.getItem('huddle:session'))document.documentElement.classList.add('hl-session')}catch(e){}</script><style>.hl-session #root>.hl{visibility:hidden}</style>`
            : '',
        ].join('\n    ');
        const html = template
          // drop the app shell's generic SEO tags; the page gets its own
          .replace(/<title>[\s\S]*?<\/title>\s*/, '')
          .replace(/<meta (name|property)="(description|og:[a-z_]+|twitter:[a-z_]+)"[^>]*>\s*/g, '')
          .replace('</head>', `    ${head}\n  </head>`)
          .replace('<div id="root"></div>', `<div id="root">${mod.render(r.path)}</div>`);
        fs.writeFileSync(path.join(outDir, 'landing', `${id}.html`), html);
      }

      const today = new Date().toISOString().slice(0, 10);
      fs.writeFileSync(
        path.join(outDir, 'sitemap.xml'),
        `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${Object.values(routes)
          .map((r) => `  <url><loc>${SITE_URL}${r.path}</loc><lastmod>${today}</lastmod><priority>${r.path === '/' ? '1.0' : '0.8'}</priority></url>`)
          .join('\n')}\n  <url><loc>${SITE_URL}/register</loc><priority>0.5</priority></url>\n  <url><loc>${SITE_URL}/login</loc><priority>0.3</priority></url>\n</urlset>\n`,
      );
      fs.writeFileSync(
        path.join(outDir, 'robots.txt'),
        [
          'User-agent: *',
          'Allow: /',
          // signed-in app areas and the API have nothing for search engines
          ...['/api/', '/admin', '/recruiter', '/career', '/jobs', '/profile', '/network', '/messages', '/calls', '/chat', '/meet', '/r/', '/logs'].map((p) => `Disallow: ${p}`),
          '',
          `Sitemap: ${SITE_URL}/sitemap.xml`,
          '',
        ].join('\n'),
      );
      fs.rmSync(ssrOut, { recursive: true, force: true });
      console.log(`✓ prerendered ${Object.keys(routes).length} landing pages + sitemap.xml + robots.txt`);
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), prerenderLanding()],
  server: {
    host: true, // expose on your LAN so phones/other laptops can open it
    port: 5173,
    proxy: {
      '/ws': { target: SERVER.replace(/^http/, 'ws'), ws: true },
      '/api': SERVER,
      '/health': SERVER,
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
