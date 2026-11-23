// API-level checks for the Resume studio backend: CV parsing (.txt), AI CV chat
// guards, the admin prompt API and public CV links.

const { test, expect } = require('@playwright/test');
const { freshMember, freshPhone, textCv } = require('./career-helpers');

async function member(request, name) {
  const res = await request.post('/api/auth/register', { data: freshMember(name) });
  expect(res.status()).toBe(201);
  const body = await res.json();
  return { ...body, auth: { Authorization: `Bearer ${body.token}` } };
}

test.describe('CV parsing', () => {
  test('a plain-text CV parses into skills, experience and education', async ({ request }) => {
    const m = await member(request, 'Parse Txt');
    const res = await request.post('/api/profile/cv/parse', { headers: { ...m.auth, 'Content-Type': 'text/plain' }, data: textCv() });
    expect(res.status()).toBe(200);
    const { parsed } = await res.json();
    expect(parsed.skills).toEqual(expect.arrayContaining(['Zendesk']));
    expect(parsed.summary).toContain('Customer support executive');
  });

  test('binary data sent as text is rejected', async ({ request }) => {
    const m = await member(request, 'Parse Bad');
    const res = await request.post('/api/profile/cv/parse', { headers: { ...m.auth, 'Content-Type': 'text/plain' }, data: Buffer.from([0x41, 0x00, 0x42]) });
    expect(res.status()).toBe(400);
  });
});

test.describe('AI CV chat guards', () => {
  test('needs sign-in; reports whether AI is configured; validates the turn', async ({ request }) => {
    expect((await request.get('/api/career/cv-chat/status')).status()).toBe(401);
    expect((await request.post('/api/career/cv-chat', { data: { messages: [{ role: 'user', text: 'hi' }] } })).status()).toBe(401);
    const m = await member(request, 'Chat Guard');
    const status = await (await request.get('/api/career/cv-chat/status', { headers: m.auth })).json();
    expect(typeof status.configured).toBe('boolean');
    if (!status.configured) {
      // No key on this server → a clear 503, never a crash.
      expect((await request.post('/api/career/cv-chat', { headers: m.auth, data: { messages: [{ role: 'user', text: 'hi' }] } })).status()).toBe(503);
    } else {
      // Last message must be the member's.
      expect((await request.post('/api/career/cv-chat', { headers: m.auth, data: { messages: [{ role: 'assistant', text: 'hello' }] } })).status()).toBe(400);
    }
  });
});

test.describe('Admin AI prompt API', () => {
  test('members get 403; admins can read the default and the fixed rules', async ({ request }) => {
    const m = await member(request, 'Not Admin');
    expect((await request.get('/api/admin/ai/cv-prompt', { headers: m.auth })).status()).toBe(403);
    expect((await request.delete('/api/admin/ai/cv-prompt', { headers: m.auth })).status()).toBe(403);
    const login = await (await request.post('/api/auth/login', { data: { email: 'admin@example.test', password: 'admin-test-1234' } })).json();
    const admin = { Authorization: `Bearer ${login.token}` };
    const res = await request.get('/api/admin/ai/cv-prompt', { headers: admin });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.defaultPrompt).toContain('Huddle AI CV Co-Pilot');
    expect(body.fixedRules).toContain('NEVER invent facts');
    expect(body.maxChars).toBe(12000);
    expect((await request.put('/api/admin/ai/cv-prompt', { headers: admin, data: { prompt: 'short' } })).status()).toBe(400);
  });
});

test.describe('Public CV links', () => {
  test('publish, read without sign-in, refuse a taken number, unpublish', async ({ request }) => {
    const a = await member(request, 'Pub A');
    const b = await member(request, 'Pub B');
    const phone = freshPhone();
    const cv = { name: 'Pub A', title: 'Designer', phone: `+91 ${phone}`, skills: ['Figma'], extra: 'dropped' };

    // needs sign-in and a valid number
    expect((await request.put('/api/career/public-cv', { data: { cv } })).status()).toBe(401);
    expect((await request.put('/api/career/public-cv', { headers: a.auth, data: { cv: { ...cv, phone: '123' } } })).status()).toBe(400);

    // publish
    const pub = await request.put('/api/career/public-cv', { headers: a.auth, data: { cv, template: 'bold-editorial' } });
    expect(pub.status()).toBe(200);
    const { published } = await pub.json();
    expect(published.slug).toBe(`91${phone}`);
    expect((await (await request.get('/api/career/public-cv', { headers: a.auth })).json()).published.slug).toBe(published.slug);

    // anyone can read it; unknown fields are dropped; not indexed by search engines
    const read = await request.get(`/api/public/cv/${published.slug}`);
    expect(read.status()).toBe(200);
    expect(read.headers()['x-robots-tag']).toBe('noindex');
    const body = await read.json();
    expect(body.cv.name).toBe('Pub A');
    expect(body.cv.extra).toBeUndefined();
    expect(body.template).toBe('bold-editorial');

    // the same number can't be taken by someone else
    expect((await request.put('/api/career/public-cv', { headers: b.auth, data: { cv: { ...cv, name: 'Pub B' } } })).status()).toBe(409);

    // unpublish
    expect((await request.delete('/api/career/public-cv', { headers: a.auth })).status()).toBe(200);
    expect((await request.get(`/api/public/cv/${published.slug}`)).status()).toBe(404);
  });

  test('the public page URL serves the web app (SPA) for any number', async ({ request }) => {
    const res = await request.get('/9876500000');
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('text/html');
  });
});
