// Exercises the MongoDB user store against a small fake collection that behaves
// like the driver for the calls we make (insertOne/findOne/updateOne, unique
// email index → error code 11000). Run against a real database with:
//   MONGODB_URI=mongodb://localhost:27017 node --test
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';
import { mongoMessageStoreFromCollection } from '../src/db/messageStore.js';
import { mongoActivityStoreFromCollections } from '../src/db/activityStore.js';
import { DuplicateEmailError, connectMongoUserStore, mongoUserStoreFromCollection } from '../src/db/userStore.js';

class FakeObjectId {
  constructor(hex = randomBytes(12).toString('hex')) {
    this.hex = hex;
  }
  static isValid(v) {
    return typeof v === 'string' && /^[0-9a-f]{24}$/i.test(v);
  }
  toString() {
    return this.hex;
  }
}

function fakeCollection() {
  const docs = [];
  const matches = (doc, q) =>
    Object.entries(q).every(([k, v]) => {
      if (k === '_id') return doc._id.toString() === v.toString();
      if (v && typeof v === 'object' && '$lt' in v) return doc[k] < v.$lt;
      return doc[k] === v;
    });
  return {
    docs,
    async insertOne(doc) {
      if (doc.email && docs.some((d) => d.email === doc.email)) throw Object.assign(new Error('E11000 duplicate key'), { code: 11000 });
      if (doc._id !== undefined && docs.some((d) => d._id.toString() === doc._id.toString()))
        throw Object.assign(new Error('E11000 duplicate key'), { code: 11000 });
      const _id = doc._id ?? new FakeObjectId();
      docs.push({ ...doc, _id });
      return { insertedId: _id };
    },
    async findOne(q) {
      return docs.find((d) => matches(d, q)) ?? null;
    },
    async deleteOne(q) {
      const i = docs.findIndex((x) => matches(x, q));
      if (i >= 0) docs.splice(i, 1);
      return { deletedCount: i >= 0 ? 1 : 0 };
    },
    async updateOne(q, update, options = {}) {
      if (options.upsert && !docs.some((x) => matches(x, q))) docs.push({ ...q, _id: new FakeObjectId() });
      const d = docs.find((x) => matches(x, q));
      if (d && update.$set?.email && docs.some((x) => x !== d && x.email === update.$set.email))
        throw Object.assign(new Error('E11000 duplicate key'), { code: 11000 });
      if (d) {
        Object.assign(d, update.$set);
        for (const [k, n] of Object.entries(update.$inc ?? {})) d[k] = (d[k] ?? 0) + n;
      }
      return { matchedCount: d ? 1 : 0 };
    },
    find(q) {
      let out = docs.filter((d) => matches(d, q));
      const cursor = {
        sort(spec) {
          const [[k, dir]] = Object.entries(spec);
          out = [...out].sort((a, b) => (a[k] < b[k] ? -dir : a[k] > b[k] ? dir : 0));
          return cursor;
        },
        limit(n) {
          out = out.slice(0, n);
          return cursor;
        },
        async toArray() {
          return out;
        },
      };
      return cursor;
    },
  };
}

async function exercise(store, label) {
  const email = `mongo-${randomBytes(4).toString('hex')}@example.com`;
  const u = await store.create({ name: 'Mongo User', email, passwordHash: 'scrypt$x' });
  assert.match(u.id, /^[0-9a-f]{24}$/, `${label}: id is the ObjectId as a string`);
  assert.ok(u.createdAt instanceof Date);

  assert.equal((await store.findByEmail(email)).id, u.id);
  assert.equal((await store.findById(u.id)).email, email);
  assert.equal(await store.findById('not-an-object-id'), null, 'invalid ids are not sent to Mongo');
  assert.equal(await store.findById('0123456789abcdef01234567'), null);

  await assert.rejects(store.create({ name: 'Dup', email, passwordHash: 'x' }), DuplicateEmailError);

  await store.recordLogin(u.id);
  assert.ok((await store.findById(u.id)).lastLoginAt instanceof Date);

  // Profile edits
  const renamed = await store.updateProfile(u.id, { name: 'New Name' });
  assert.equal(renamed.name, 'New Name');
  const other = await store.create({ name: 'Other', email: `other-${email}`, passwordHash: 'x' });
  await assert.rejects(store.updateProfile(u.id, { email: other.email }), DuplicateEmailError, 'cannot take another account’s email');
  const moved = await store.updateProfile(u.id, { email: `moved-${email}` });
  assert.equal(moved.email, `moved-${email}`);
  assert.equal((await store.findByEmail(`moved-${email}`)).id, u.id);

  // Password change bumps tokenVersion
  assert.equal(u.tokenVersion, 0);
  const pw = await store.setPassword(u.id, 'scrypt$new');
  assert.equal(pw.passwordHash, 'scrypt$new');
  assert.equal(pw.tokenVersion, 1);
}

test('mongo user store: create / find / duplicate / recordLogin (fake collection)', async () => {
  const col = fakeCollection();
  const store = mongoUserStoreFromCollection(col, FakeObjectId);
  await exercise(store, 'fake');
  assert.equal(col.docs.length, 2);
  assert.deepEqual(Object.keys(col.docs[0]).sort(), ['_id', 'createdAt', 'email', 'lastLoginAt', 'name', 'passwordHash', 'tokenVersion', 'updatedAt']);
});

test('mongo user store against a real MongoDB', { skip: !process.env.MONGODB_URI && 'set MONGODB_URI to run' }, async () => {
  const store = await connectMongoUserStore(process.env.MONGODB_URI, `huddle_test_${Date.now()}`);
  try {
    await exercise(store, 'real');
  } finally {
    await store.close();
  }
});

test('mongo message store: save, newest page oldest-first, paging with before', async () => {
  const col = fakeCollection();
  const store = mongoMessageStoreFromCollection(col);
  const base = Date.now() - 10_000;
  for (let i = 0; i < 7; i++) {
    const m = await store.add({ roomId: 'r1', userId: 'u1', name: 'Asha', text: `m${i}` });
    col.docs[col.docs.length - 1].createdAt = new Date(base + i * 1000); // spread timestamps
    assert.equal(m.text, `m${i}`);
  }
  await store.add({ roomId: 'other', userId: 'u2', name: 'Bala', text: 'elsewhere' });

  const page1 = await store.recent('r1', { limit: 3 });
  assert.deepEqual(page1.messages.map((m) => m.text), ['m4', 'm5', 'm6'], 'newest three, oldest first');
  assert.equal(page1.hasMore, true);
  const page2 = await store.recent('r1', { limit: 3, before: page1.messages[0].ts });
  assert.deepEqual(page2.messages.map((m) => m.text), ['m1', 'm2', 'm3']);
  const page3 = await store.recent('r1', { limit: 3, before: page2.messages[0].ts });
  assert.deepEqual(page3.messages.map((m) => m.text), ['m0']);
  assert.equal(page3.hasMore, false);
  assert.ok(page1.messages.every((m) => typeof m.ts === 'number' && m.userId === 'u1'));
});

test('MongoDB activity store: calls and recent rooms (fake collections)', async () => {
  const store = mongoActivityStoreFromCollections(fakeCollection(), fakeCollection());
  const t0 = new Date(Date.now() - 600_000);
  await store.recordCall({ userId: 'u1', roomId: 'standup', startedAt: t0, endedAt: new Date(t0.getTime() + 125_000), with: ['Bala'] });
  await store.recordCall({ userId: 'u1', roomId: 'design', startedAt: new Date(), endedAt: new Date(Date.now() + 1000), with: [] });
  const calls = await store.recentCalls('u1', 10);
  assert.deepEqual(calls.map((c) => c.roomId), ['design', 'standup']);
  assert.equal(calls[1].durationSec, 125);
  await store.touchRoom('u1', 'standup');
  await new Promise((r) => setTimeout(r, 5));
  await store.touchRoom('u1', 'design');
  await new Promise((r) => setTimeout(r, 5));
  await store.touchRoom('u1', 'standup');
  const rooms = await store.recentRooms('u1', 10);
  assert.deepEqual(rooms.map((r) => r.roomId), ['standup', 'design'], 'upserted, most recent first');
  assert.deepEqual(await store.recentRooms('u2', 10), []);
});
