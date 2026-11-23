// Public website (/, /for-job-seekers, /for-recruiters, /public-cv-link):
// what search engines receive, page-to-page navigation, and the hand-off into
// sign-in and registration. Needs the web app built (npm run build).

const { test, expect } = require('@playwright/test');

test.use({ launchOptions: { slowMo: 0 } });

const PAGES = [
  { path: '/', title: /Upload your CV once/, h1: 'Upload once. Get matched. Talk face to face.' },
  { path: '/for-job-seekers', title: /For job seekers/, h1: /Upload once\. Build a stronger CV/ },
  { path: '/for-recruiters', title: /For recruiters/, h1: /Complete, ATS-scored candidates/ },
  { path: '/public-cv-link', title: /one permanent link/, h1: 'One link for your CV. Share it anywhere.' },
];

test.describe('Public website: SEO (no JavaScript)', () => {
  for (const p of PAGES) {
    test(`${p.path} is served as complete static HTML with its own SEO tags`, async ({ request, baseURL }) => {
      const res = await request.get(p.path);
      expect(res.status()).toBe(200);
      expect(res.headers()['content-type']).toContain('text/html');
      const html = await res.text();
      // Step 1: own title + description, one each
      expect(html.match(/<title>/g)).toHaveLength(1);
      expect(html).toMatch(new RegExp(`<title>[^<]*${p.title.source}`));
      expect(html.match(/<meta name="description"/g)).toHaveLength(1);
      // Step 2: canonical, robots, Open Graph, Twitter, structured data
      expect(html).toMatch(new RegExp(`<link rel="canonical" href="https?://[^"]+${p.path === '/' ? '/' : p.path}"`));
      expect(html).toContain('<meta name="robots" content="index, follow"');
      expect(html).toContain('<meta property="og:title"');
      expect(html).toContain('<meta name="twitter:card"');
      expect(html).toContain('application/ld+json');
      // Step 3: the real content is in the HTML (exactly one h1)
      const h1s = html.match(/<h1[\s>]/g) ?? [];
      expect(h1s).toHaveLength(1);
      // Step 4: crawlable links to the other pages and to sign-in
      for (const other of PAGES) expect(html).toContain(`href="${other.path}"`);
      expect(html).toContain('href="/login"');
      void baseURL;
    });
  }

  test('home page carries FAQ structured data', async ({ request }) => {
    const html = await (await request.get('/')).text();
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));
    const types = blocks.flat().map((b) => b['@type']);
    expect(types).toEqual(expect.arrayContaining(['Organization', 'WebSite', 'WebPage', 'FAQPage']));
    const faq = blocks.flat().find((b) => b['@type'] === 'FAQPage');
    expect(faq.mainEntity.length).toBeGreaterThan(3);
    expect(faq.mainEntity[0]).toHaveProperty('acceptedAnswer.text');
  });

  test('robots.txt and sitemap.xml list the public pages and keep private areas out', async ({ request }) => {
    const robots = await (await request.get('/robots.txt')).text();
    expect(robots).toContain('Disallow: /api/');
    expect(robots).toContain('Disallow: /admin');
    expect(robots).toMatch(/Sitemap: https?:\/\/.+\/sitemap\.xml/);
    const sitemap = await request.get('/sitemap.xml');
    expect(sitemap.headers()['content-type']).toContain('xml');
    const xml = await sitemap.text();
    for (const p of PAGES) expect(xml).toContain(`${p.path === '/' ? '/</loc>' : `${p.path}</loc>`}`);
  });

  test('app pages are not the landing page (the app shell is served)', async ({ request }) => {
    const html = await (await request.get('/jobs')).text();
    expect(html).toContain('<div id="root"></div>');
  });
});

test.describe('Public website: in the browser', () => {
  test('navigation between pages updates the URL, title and canonical; Back works', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    // Step 1: home
    await page.goto('/');
    await expect(page.locator('.hl h1')).toHaveText(PAGES[0].h1);
    await expect(page).toHaveTitle(PAGES[0].title);
    // Step 2: header links
    const nav = page.getByRole('navigation', { name: 'Primary Navigation' });
    await nav.getByRole('link', { name: 'For Recruiters' }).click();
    await expect(page).toHaveURL(/\/for-recruiters$/);
    await expect(page).toHaveTitle(/For recruiters/);
    await expect(page.locator('link[rel=canonical]')).toHaveAttribute('href', /\/for-recruiters$/);
    await expect(page.locator('.hl h1')).toHaveText(PAGES[2].h1);
    await nav.getByRole('link', { name: 'Public CV link' }).click();
    await expect(page).toHaveURL(/\/public-cv-link$/);
    // Step 3: browser Back / Forward
    await page.goBack();
    await expect(page).toHaveURL(/\/for-recruiters$/);
    await expect(page.locator('.hl h1')).toHaveText(PAGES[2].h1);
    await page.goForward();
    await expect(page.locator('.hl h1')).toHaveText(PAGES[3].h1);
    // Step 4: anchor links land on the home section
    await nav.getByRole('link', { name: 'FAQ' }).click();
    await expect(page).toHaveURL(/\/#faq$/);
    await expect(page.locator('#faq')).toBeInViewport();
    // Step 5: a deep link opens that page directly
    await page.goto('/for-job-seekers');
    await expect(page.locator('.hl h1')).toHaveText(PAGES[1].h1);
    expect(errors).toEqual([]);
  });

  test('Sign in goes to /login, the logo and "Back to home" return to the website', async ({ page }) => {
    await page.goto('/');
    await page.locator('header').getByRole('link', { name: /Sign in/ }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByTestId('tab-login')).toHaveAttribute('aria-selected', 'true');
    await expect(page).toHaveTitle('Sign in | Huddle');
    // switching tabs updates the URL and title
    await page.getByTestId('tab-register').click();
    await expect(page).toHaveURL(/\/register$/);
    await expect(page).toHaveTitle(/Create your free account/);
    await page.getByTestId('back-home').click();
    await expect(page.locator('.hl h1')).toBeVisible();
    await page.goto('/login');
    await page.getByRole('link', { name: 'Huddle home page' }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  test('the Get started form hands its details to registration (recruiter and job seeker)', async ({ page }) => {
    for (const [role, expected] of [['Recruiter', 'Talent Partner'], ['Job seeker', 'Career Explorer']]) {
      await page.goto('/#get-started');
      const form = page.locator('#get-started form');
      await form.locator('#signup-name').fill(`Starter ${role}`);
      await form.locator('#signup-email').fill(`start-${role.replace(' ', '')}@example.com`);
      await form.locator('#signup-role').selectOption(role);
      await form.getByRole('button', { name: /Continue to create account/ }).click();
      // Step: lands on registration, prefilled, with the right account type
      await expect(page).toHaveURL(/\/register\?/);
      await expect(page.getByTestId('tab-register')).toHaveAttribute('aria-selected', 'true');
      await expect(page.getByLabel('Your name')).toHaveValue(`Starter ${role}`);
      await expect(page.getByLabel('Email')).toHaveValue(`start-${role.replace(' ', '')}@example.com`);
      await expect(page.getByLabel(expected)).toBeChecked();
    }
  });

  test('Get started and Start hiring buttons open registration (recruiter preselected for hiring)', async ({ page }) => {
    await page.goto('/');
    await page.locator('header').getByRole('link', { name: 'Get started' }).click();
    await expect(page).toHaveURL(/\/register$/);
    await expect(page.getByLabel('Career Explorer')).toBeChecked();
    await page.goto('/for-recruiters');
    await page.getByRole('link', { name: 'Start hiring' }).first().click();
    await expect(page).toHaveURL(/\/register\?role=recruiter$/);
    await expect(page.getByLabel('Talent Partner')).toBeChecked();
  });

  test('no "beta" wording or long dashes anywhere on the website, and the old /beta link redirects to registration', async ({ page, request }) => {
    for (const path of ['/', '/for-job-seekers', '/for-recruiters', '/public-cv-link']) {
      await page.goto(path);
      expect(await page.locator('.hl').innerText()).not.toMatch(/beta/i);
      const html = await (await request.get(path)).text();
      expect(html).not.toMatch(/beta/i);
      // house style: no long dash (U+2014) in anything visitors read
      expect(await page.locator('.hl').innerText()).not.toContain('\u2014');
      expect(html).not.toContain('\u2014');
    }
    const old = await request.get('/beta', { maxRedirects: 0 });
    expect(old.status()).toBe(301);
    expect(old.headers().location).toBe('/register');
    await page.goto('/beta');
    await expect(page).toHaveURL(/\/register$/);
  });

  test('recruiter console link opens sign-in in recruiter mode', async ({ page }) => {
    await page.goto('/for-recruiters');
    await page.getByRole('link', { name: /Open Recruiter Console/ }).click();
    await expect(page).toHaveURL(/\/login\?as=recruiter$/);
  });

  test('signed-in members get the app at "/", still see marketing pages, and sign out to /login', async ({ page, request }) => {
    const creds = { name: 'Landing Member', email: `landing-${Date.now()}@example.com`, password: 'test-pass-1234' };
    const body = await (await request.post('/api/auth/register', { data: creds })).json();
    await page.goto('/login');
    await page.evaluate((s) => localStorage.setItem('huddle:session', JSON.stringify(s)), { token: body.token, user: body.user, expiresAt: body.expiresAt });
    // Step 1: "/" is the member feed, not the website
    await page.goto('/');
    await expect(page.getByTestId('rail-feed')).toBeVisible();
    await expect(page.locator('.hl')).toHaveCount(0);
    // Step 2: marketing pages still open for members
    await page.goto('/for-job-seekers');
    await expect(page.locator('.hl h1')).toHaveText(PAGES[1].h1);
    // Step 3: signing out shows the sign-in form, not the website
    await page.goto('/');
    await page.getByTestId('rail-profile').click();
    await page.getByTestId('sign-out').click();
    await expect(page.getByTestId('tab-login')).toBeVisible();
  });

  test('phone: no sideways scroll; the menu opens and links work', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole('button', { name: 'Open navigation menu' }).click();
    await page.getByRole('link', { name: 'For Job Seekers' }).last().click();
    await expect(page).toHaveURL(/\/for-job-seekers$/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
