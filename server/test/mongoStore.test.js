// Exercises the MongoDB user store against a small fake collection that behaves
// like the driver for the calls we make (insertOne/findOne/updateOne, unique
// email index → error code 11000). Run against a real database with:
//   MONGODB_URI=mongodb://localhost:27017 node --test
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';
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
    Object.entries(q).every(([k, v]) => (k === '_id' ? doc._id.toString() === v.toString() : doc[k] === v));
  return {
    docs,
    async insertOne(doc) {
      if (docs.some((d) => d.email === doc.email)) throw Object.assign(new Error('E11000 duplicate key'), { code: 11000 });
      const _id = new FakeObjectId();
      docs.push({ ...doc, _id });
      return { insertedId: _id };
    },
    async findOne(q) {
      return docs.find((d) => matches(d, q)) ?? null;
    },
    async updateOne(q, update) {
      const d = docs.find((x) => matches(x, q));
      if (d) Object.assign(d, update.$set);
      return { matchedCount: d ? 1 : 0 };
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
}

test('mongo user store: create / find / duplicate / recordLogin (fake collection)', async () => {
  const col = fakeCollection();
  const store = mongoUserStoreFromCollection(col, FakeObjectId);
  await exercise(store, 'fake');
  assert.equal(col.docs.length, 1);
  assert.deepEqual(Object.keys(col.docs[0]).sort(), ['_id', 'createdAt', 'email', 'lastLoginAt', 'name', 'passwordHash', 'updatedAt']);
});

test('mongo user store against a real MongoDB', { skip: !process.env.MONGODB_URI && 'set MONGODB_URI to run' }, async () => {
  const store = await connectMongoUserStore(process.env.MONGODB_URI, `huddle_test_${Date.now()}`);
  try {
    await exercise(store, 'real');
  } finally {
    await store.close();
  }
});
