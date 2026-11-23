// AI CV builder chat: auth, "not configured", validation of model output, and
// that the current CV + history reach the model. The model is faked here.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { api, registerUser, startTestApp } from './helpers.js';

let calls = [];
let nextReply = '';
let t;
let off;
before(async () => {
  t = await startTestApp({
    config: { ai: { geminiApiKey: 'test-key', geminiModel: 'test-model' } },
    cvChatGenerate: async (args) => { calls.push(args); return nextReply; },
  });
  off = await startTestApp(); // no key configured
});
after(async () => { await t.app.close(); await off.app.close(); });

test('cv chat requires sign-in', async () => {
  const res = await api(t.base, 'POST', '/api/career/cv-chat', { messages: [{ role: 'user', text: 'hi' }] });
  assert.equal(res.status, 401);
});

test('cv chat reports 503 when no AI key is configured', async () => {
  const u = await registerUser(off.base, 'No Key');
  assert.deepEqual((await api(off.base, 'GET', '/api/career/cv-chat/status', null, u.token)).body, { configured: false });
  const res = await api(off.base, 'POST', '/api/career/cv-chat', { messages: [{ role: 'user', text: 'hi' }] }, u.token);
  assert.equal(res.status, 503);
});

test('cv chat sends history + current CV to the model and returns a cleaned CV', async () => {
  const u = await registerUser(t.base, 'Chatty');
  calls = [];
  nextReply = JSON.stringify({
    reply: 'Great — what did you achieve at Acme?',
    progress: 140, // out of range → clamped
    suggestions: ['Led a team', 'Cut costs', 'Shipped app', 'Won award', 'Trained juniors', 'Saved money', 'one too many'],
    cv: { name: 'Chatty', title: 'Frontend Engineer', skills: ['Angular', '', 'TypeScript'], experience: [{ title: 'Engineer', company: 'Acme', start: '2021', end: 'Present', description: '• Built UI' }, { title: '', company: '' }], extra: 'dropped' },
  });
  const res = await api(t.base, 'POST', '/api/career/cv-chat', {
    messages: [{ role: 'assistant', text: 'What role are you targeting?' }, { role: 'user', text: 'Frontend engineer at Acme since 2021' }],
    cv: { name: 'Chatty', title: '' },
  }, u.token);
  assert.equal(res.status, 200);
  assert.equal(res.body.reply, 'Great, what did you achieve at Acme?'); // long dash replaced
  assert.equal(res.body.progress, 100);
  assert.deepEqual(res.body.suggestions, ['Led a team', 'Cut costs', 'Shipped app', 'Won award', 'Trained juniors', 'Saved money']);
  assert.deepEqual(res.body.cv.skills, ['Angular', 'TypeScript']);
  assert.equal(res.body.cv.experience.length, 1);
  assert.equal(res.body.cv.extra, undefined);
  // what the model received
  assert.equal(calls.length, 1);
  assert.equal(calls[0].model, 'test-model');
  assert.match(calls[0].input, /Conversation so far:\nAssistant: What role are you targeting\?/);
  assert.match(calls[0].input, /Current CV \(JSON\):\n\{"name":"Chatty"/);
  assert.match(calls[0].input, /Member: Frontend engineer at Acme since 2021$/);
  assert.match(calls[0].system, /NEVER invent facts/);
});

test('cv chat falls back to the second model when the first is overloaded', async () => {
  const u = await registerUser(t.base, 'Fallback');
  calls = [];
  const fb = await startTestApp({
    config: { ai: { geminiApiKey: 'k', geminiModel: 'primary', geminiFallbackModel: 'backup' } },
    cvChatGenerate: async (args) => {
      calls.push(args.model);
      if (args.model === 'primary') throw Object.assign(new Error('high demand'), { status: 503 });
      return JSON.stringify({ reply: 'ok', progress: 10, suggestions: [], cv: {} });
    },
  });
  const v = await registerUser(fb.base, 'Fallback2');
  const res = await api(fb.base, 'POST', '/api/career/cv-chat', { messages: [{ role: 'user', text: 'hi' }] }, v.token);
  assert.equal(res.status, 200);
  assert.deepEqual(calls, ['primary', 'backup']);
  await fb.app.close();
  void u;
});

test('cv chat rejects an empty turn and handles bad model output', async () => {
  const u = await registerUser(t.base, 'Edge');
  assert.equal((await api(t.base, 'POST', '/api/career/cv-chat', { messages: [] }, u.token)).status, 400);
  nextReply = 'not json';
  assert.equal((await api(t.base, 'POST', '/api/career/cv-chat', { messages: [{ role: 'user', text: 'hi' }] }, u.token)).status, 502);
});

test('master prompt: default is used, admins can edit / reset it, members cannot', async () => {
  const member = await registerUser(t.base, 'Member');
  const admin = await registerUser(t.base, 'Admin');
  await t.store.setRole(admin.user.id, 'super_admin');

  assert.equal((await api(t.base, 'GET', '/api/admin/ai/cv-prompt', null, member.token)).status, 403);
  assert.equal((await api(t.base, 'PUT', '/api/admin/ai/cv-prompt', { prompt: 'x'.repeat(60) }, member.token)).status, 403);

  const initial = await api(t.base, 'GET', '/api/admin/ai/cv-prompt', null, admin.token);
  assert.equal(initial.status, 200);
  assert.equal(initial.body.isDefault, true);
  assert.match(initial.body.prompt, /Huddle AI CV Co-Pilot/);
  assert.match(initial.body.fixedRules, /NEVER invent facts/);

  const ask = async () => {
    calls = [];
    nextReply = JSON.stringify({ reply: 'ok', progress: 10, suggestions: ['a', 'b', 'c', 'd', 'e', 'f', 'g'], cv: {} });
    const r = await api(t.base, 'POST', '/api/career/cv-chat', { messages: [{ role: 'user', text: 'hi' }] }, member.token);
    assert.equal(r.status, 200);
    return { system: calls[0].system, chips: r.body.suggestions };
  };
  let turn = await ask();
  assert.match(turn.system, /Huddle AI CV Co-Pilot/);
  assert.match(turn.system, /NEVER invent facts/); // fixed rules always appended
  assert.equal(turn.chips.length, 6); // 4–6 chips

  assert.equal((await api(t.base, 'PUT', '/api/admin/ai/cv-prompt', { prompt: 'too short' }, admin.token)).status, 400);
  const custom = 'You are a cheerful CV coach for nurses. Ask one question at a time and keep it simple.';
  const saved = await api(t.base, 'PUT', '/api/admin/ai/cv-prompt', { prompt: custom }, admin.token);
  assert.equal(saved.status, 200);
  assert.equal(saved.body.isDefault, false);
  assert.equal(saved.body.updatedBy, 'Admin');
  turn = await ask();
  assert.ok(turn.system.startsWith(custom));
  assert.match(turn.system, /NEVER invent facts/);
  assert.doesNotMatch(turn.system, /Huddle AI CV Co-Pilot/);

  const reset = await api(t.base, 'DELETE', '/api/admin/ai/cv-prompt', null, admin.token);
  assert.equal(reset.body.isDefault, true);
  turn = await ask();
  assert.match(turn.system, /Huddle AI CV Co-Pilot/);
});

test('long dashes from the model are replaced before members see them', async () => {
  const u = await registerUser(t.base, 'No Dash');
  nextReply = JSON.stringify({
    reply: 'Great — what did you do there?',
    progress: 20,
    suggestions: ['Led a team — 5 people'],
    cv: { name: 'No Dash', summary: 'Support lead — calm under pressure —.', experience: [{ title: 'Lead', company: 'Acme', start: '', end: '', description: '• Cut wait times — by 30%' }] },
  });
  const res = await api(t.base, 'POST', '/api/career/cv-chat', { messages: [{ role: 'user', text: 'hi' }] }, u.token);
  assert.equal(res.status, 200);
  assert.equal(res.body.reply, 'Great, what did you do there?');
  assert.deepEqual(res.body.suggestions, ['Led a team, 5 people']);
  assert.equal(res.body.cv.summary, 'Support lead, calm under pressure.');
  assert.equal(res.body.cv.experience[0].description, '• Cut wait times, by 30%');
  assert.doesNotMatch(JSON.stringify(res.body), /—/);
});
