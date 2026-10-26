// User persistence. Two interchangeable implementations behind one interface:
//   - MongoDB (official driver) when MONGODB_URI is set — use this for real.
//   - In-memory for tests and quick local tries without a database.
//
// Interface:
//   create({ name, email, passwordHash }) -> user   (throws DuplicateEmailError)
//   findByEmail(email) -> user | null                 (email already lower-cased)
//   findById(id) -> user | null
//   recordLogin(id) -> void
//   ping() -> void
//   close() -> void
//
// A "user" is { id, name, email, passwordHash, createdAt, lastLoginAt }.

import { randomBytes } from 'node:crypto';

export class DuplicateEmailError extends Error {
  constructor() {
    super('An account with this email already exists.');
  }
}

/** Shape sent to clients — never includes the password hash. */
export function publicUser(u) {
  return { id: u.id, name: u.name, email: u.email, createdAt: u.createdAt instanceof Date ? u.createdAt.toISOString() : u.createdAt };
}

// ---------------------------------------------------------------------------
export function createMemoryUserStore() {
  const byId = new Map();
  const byEmail = new Map();
  return {
    kind: 'memory',
    async create({ name, email, passwordHash }) {
      if (byEmail.has(email)) throw new DuplicateEmailError();
      const now = new Date();
      const user = { id: randomBytes(12).toString('hex'), name, email, passwordHash, createdAt: now, lastLoginAt: null };
      byId.set(user.id, user);
      byEmail.set(email, user);
      return { ...user };
    },
    async findByEmail(email) {
      const u = byEmail.get(email);
      return u ? { ...u } : null;
    },
    async findById(id) {
      const u = byId.get(id);
      return u ? { ...u } : null;
    },
    async recordLogin(id) {
      const u = byId.get(id);
      if (u) u.lastLoginAt = new Date();
    },
    async ping() {},
    async close() {},
  };
}

// ---------------------------------------------------------------------------
/**
 * Wraps a MongoDB collection. Exported separately so tests can pass a fake
 * collection; production code uses connectMongoUserStore().
 * @param {import('mongodb').Collection} users
 * @param {typeof import('mongodb').ObjectId} ObjectId
 */
export function mongoUserStoreFromCollection(users, ObjectId, extra = {}) {
  const toUser = (doc) =>
    doc && {
      id: doc._id.toString(),
      name: doc.name,
      email: doc.email,
      passwordHash: doc.passwordHash,
      createdAt: doc.createdAt,
      lastLoginAt: doc.lastLoginAt ?? null,
    };
  const oid = (id) => (typeof id === 'string' && ObjectId.isValid(id) ? new ObjectId(id) : null);

  return {
    kind: 'mongodb',
    async create({ name, email, passwordHash }) {
      const now = new Date();
      const doc = { name, email, passwordHash, createdAt: now, updatedAt: now, lastLoginAt: null };
      try {
        const res = await users.insertOne(doc);
        return toUser({ ...doc, _id: res.insertedId });
      } catch (err) {
        if (err?.code === 11000) throw new DuplicateEmailError(); // unique index on email
        throw err;
      }
    },
    async findByEmail(email) {
      return toUser(await users.findOne({ email }));
    },
    async findById(id) {
      const _id = oid(id);
      return _id ? toUser(await users.findOne({ _id })) : null;
    },
    async recordLogin(id) {
      const _id = oid(id);
      if (_id) await users.updateOne({ _id }, { $set: { lastLoginAt: new Date() } });
    },
    ping: extra.ping ?? (async () => {}),
    close: extra.close ?? (async () => {}),
  };
}

/** Connect to MongoDB and make sure indexes exist. */
export async function connectMongoUserStore(uri, dbName, log = () => {}) {
  // Imported lazily so tests and memory mode don't need the driver loaded.
  const { MongoClient, ObjectId } = await import('mongodb');
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000, appName: 'huddle-server' });
  await client.connect();
  const db = client.db(dbName);
  const users = db.collection('users');
  await users.createIndex({ email: 1 }, { unique: true, name: 'email_unique' });
  log(`MongoDB connected (db="${db.databaseName}")`);
  return mongoUserStoreFromCollection(users, ObjectId, {
    ping: () => db.command({ ping: 1 }),
    close: () => client.close(),
  });
}
