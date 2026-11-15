import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMemoryUserStore, publicUser } from '../src/db/userStore.js';

test('recruiter application and approval persist on the account', async () => {
  const store = createMemoryUserStore();
  const application = {
    status: 'pending',
    company: 'Northstar',
    website: 'https://northstar.example',
    reason: 'Hiring support for candidates.',
    requestedAt: new Date().toISOString(),
  };
  const user = await store.create({
    name: 'Applicant',
    email: 'applicant@example.com',
    recruiterApplication: application,
  });

  assert.equal((await store.findById(user.id)).recruiterApplication.status, 'pending');
  const approved = await store.adminUpdate(user.id, {
    role: 'recruiter',
    recruiterApplication: { ...application, status: 'approved' },
  });

  assert.equal(publicUser(approved).role, 'recruiter');
  assert.equal(publicUser(approved).recruiterApplication.status, 'approved');
});

test('memory user store searches and paginates without returning the full directory', async () => {
  const store = createMemoryUserStore();
  await store.create({ name: 'Directory Candidate One', email: 'one@example.com' });
  await store.create({ name: 'Directory Candidate Two', email: 'two@example.com' });
  await store.create({ name: 'Unrelated Member', email: 'other@example.com' });

  const firstPage = await store.list({ search: 'DIRECTORY', limit: 1 });
  const secondPage = await store.list({ search: 'directory', limit: 1, skip: 1 });

  assert.equal(await store.count({ search: 'Directory' }), 2);
  assert.equal(firstPage.length, 1);
  assert.equal(secondPage.length, 1);
  assert.notEqual(firstPage[0].id, secondPage[0].id);
  assert.match(firstPage[0].name, /Directory Candidate/);
  assert.match(secondPage[0].name, /Directory Candidate/);
});
