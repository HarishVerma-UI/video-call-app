// Public CV links at /<mobile number>: publish, read without sign-in, ownership, unpublish.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { phoneSlug } from '../src/publicCv.js';
import { api, registerUser, startTestApp } from './helpers.js';

let t;
before(async () => { t = await startTestApp(); });
after(async () => { await t.app.close(); });

const cv = (phone, extra = {}) => ({ name: 'Asha Rao', title: 'Product Manager', phone, skills: ['SQL'], experience: [{ title: 'PM', company: 'Acme', start: '2021', end: 'Present', description: '• Shipped X' }], ...extra });

test('phoneSlug keeps digits only and needs 7–15 of them', () => {
  assert.equal(phoneSlug('+91 98765-43210'), '919876543210');
  assert.equal(phoneSlug('12345'), null);
  assert.equal(phoneSlug(''), null);
  assert.equal(phoneSlug('1'.repeat(16)), null);
});

test('publishing needs sign-in and a valid number', async () => {
  assert.equal((await api(t.base, 'PUT', '/api/career/public-cv', { cv: cv('9876543210') })).status, 401);
  const u = await registerUser(t.base, 'No Phone');
  const res = await api(t.base, 'PUT', '/api/career/public-cv', { cv: cv('') }, u.token);
  assert.equal(res.status, 400);
  assert.match(res.body.error, /mobile number/);
});

test('publish → anyone can read it at the number → unpublish removes it', async () => {
  const u = await registerUser(t.base, 'Asha');
  const pub = await api(t.base, 'PUT', '/api/career/public-cv', { cv: cv('+91 98765 00001', { secret: 'x' }), template: 'ats-pro' }, u.token);
  assert.equal(pub.status, 200);
  assert.equal(pub.body.published.slug, '919876500001');
  assert.equal(pub.body.published.template, 'ats-pro');
  assert.deepEqual((await api(t.base, 'GET', '/api/career/public-cv', null, u.token)).body.published.slug, '919876500001');

  const read = await api(t.base, 'GET', '/api/public/cv/919876500001'); // no token
  assert.equal(read.status, 200);
  assert.equal(read.body.cv.name, 'Asha Rao');
  assert.equal(read.body.cv.secret, undefined);
  assert.equal(read.body.template, 'ats-pro');

  // Changing the number moves the link; the old one stops working.
  await api(t.base, 'PUT', '/api/career/public-cv', { cv: cv('9876500002'), template: 'nope' }, u.token);
  assert.equal((await api(t.base, 'GET', '/api/public/cv/919876500001')).status, 404);
  const moved = await api(t.base, 'GET', '/api/public/cv/9876500002');
  assert.equal(moved.body.template, 'modern-tech'); // unknown template → default

  assert.equal((await api(t.base, 'DELETE', '/api/career/public-cv', null, u.token)).status, 200);
  assert.equal((await api(t.base, 'GET', '/api/public/cv/9876500002')).status, 404);
});

test('a number already published by someone else is refused', async () => {
  const a = await registerUser(t.base, 'First');
  const b = await registerUser(t.base, 'Second');
  assert.equal((await api(t.base, 'PUT', '/api/career/public-cv', { cv: cv('5550001111') }, a.token)).status, 200);
  const res = await api(t.base, 'PUT', '/api/career/public-cv', { cv: cv('5550001111') }, b.token);
  assert.equal(res.status, 409);
});
