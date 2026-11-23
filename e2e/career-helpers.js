// Shared helpers for the Resume studio / AI CV / public CV end-to-end tests.

const { expect } = require('@playwright/test');

let counter = 0;

/** A unique member (name, email, password). */
function freshMember(name = 'Studio Member') {
  counter++;
  return { name: `${name} ${counter}`, email: `career-${counter}-${Date.now()}@example.com`, password: 'test-pass-1234' };
}

/** A unique 10-digit mobile number (public CV links are keyed by it). */
function freshPhone() {
  return `9${String(Date.now()).slice(-6)}${String(++counter).padStart(3, '0')}`;
}

/**
 * Register via the API, then sign in. Returns { token, user, creds }.
 * By default the session is stored the way the app stores it after a login (the
 * "huddle:session" key) — this keeps long runs under the server's login rate limit
 * (50 sign-ins per IP per 15 min). Pass { viaForm: true } to use the real login form.
 */
async function signUpAndSignIn(page, request, name, { viaForm = false } = {}) {
  const creds = freshMember(name);
  const res = await request.post('/api/auth/register', { data: creds });
  expect(res.status()).toBe(201);
  const body = await res.json();
  await page.goto('/login');
  if (viaForm) {
    await page.getByLabel(/email/i).fill(creds.email);
    await page.getByLabel(/password/i).fill(creds.password);
    await page.getByTestId('password-submit').click();
  } else {
    await page.evaluate((session) => localStorage.setItem('huddle:session', JSON.stringify(session)), { token: body.token, user: body.user, expiresAt: body.expiresAt });
    await page.reload();
  }
  await expect(page.getByTestId('rail-feed')).toBeVisible({ timeout: 10_000 });
  return { ...body, creds };
}

async function signInAsAdmin(page) {
  await page.goto('/login');
  await page.getByLabel(/email/i).fill('admin@example.test');
  await page.getByLabel(/password/i).fill('admin-test-1234');
  await page.getByTestId('password-submit').click();
  await expect(page.getByTestId('rail-admin')).toBeVisible({ timeout: 10_000 });
}

/** Open the Resume studio and wait for the dashboard. */
async function openStudio(page, path = '/career') {
  await page.goto(path);
  await expect(page.getByTestId('studio-status')).toBeVisible({ timeout: 10_000 });
}

/** Click a Resume studio sidebar item by its label. */
async function studioNav(page, label) {
  await page.locator('.aa-nav__item', { hasText: label }).click();
}

/** Live ATS score from the status bar. */
async function statusAts(page) {
  return Number(await page.getByTestId('status-ats').locator('b').textContent());
}

/** The signed-in member's saved profile, straight from the API. */
async function savedProfile(request, token) {
  const res = await request.get('/api/profile/me', { headers: { Authorization: `Bearer ${token}` } });
  expect(res.ok()).toBeTruthy();
  return (await res.json()).profile;
}

/** A small plain-text CV the server can parse. */
function textCv({ name = 'Rahul Verma', phone = '+91 98111 22334' } = {}) {
  return Buffer.from([
    name, 'Customer Support Executive', `rahul.v@example.com | ${phone} | Jaipur`, '',
    'SUMMARY', 'Customer support executive with 2 years handling inbound voice and chat for an e-commerce brand.', '',
    'SKILLS', 'Customer Service, Zendesk, Active Listening, Hindi, English', '',
    'EXPERIENCE', 'Customer Support Executive - Concentrix (2023 - Present)', 'Handled 70 calls per day with 92% CSAT', '',
    'EDUCATION', 'B.A. - University of Rajasthan - 2022', '',
  ].join('\n'), 'utf8');
}

module.exports = { freshMember, freshPhone, signUpAndSignIn, signInAsAdmin, openStudio, studioNav, statusAts, savedProfile, textCv };
