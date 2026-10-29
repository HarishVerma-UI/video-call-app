// User persistence. Two interchangeable implementations behind one interface:
//   - MongoDB (official driver) when MONGODB_URI is set — use this for real.
//   - In-memory for tests and quick local tries without a database.
//
// Interface:
//   create({ name, email, passwordHash, role?, provider?, providerId? }) -> user  (throws DuplicateEmailError)
//   findByEmail(email) -> user | null                 (email already lower-cased)
//   findById(id) -> user | null
//   findByProvider(provider, providerId) -> user | null
//   recordLogin(id) -> void
//   updateProfile(id, { name?, email? }) -> user     (throws DuplicateEmailError)
//   adminUpdate(id, { name?, email?, role?, passwordHash? }) -> user  (throws DuplicateEmailError)
//   setPassword(id, passwordHash, { revokeSessions }) -> user  (by default bumps tokenVersion)
//   setRole(id, role) -> user
//   list({ limit?, skip? }) -> user[]                 (newest first; for the admin dashboard)
//   count() -> number
//   remove(id) -> boolean
//   ping() -> void
//   close() -> void
//
// A "user" is { id, name, email, passwordHash, role, provider, providerId,
//               tokenVersion, createdAt, lastLoginAt }.
// passwordHash is null for accounts created via social login only.
// role is 'user' or 'admin'. provider is 'google' | 'github' | null.
// tokenVersion is copied into every JWT; bumping it invalidates older tokens.

import { randomBytes } from 'node:crypto';

export class DuplicateEmailError extends Error {
  constructor() {
    super('An account with this email already exists.');
  }
}

/** Shape sent to clients — never includes the password hash. */
export function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    name: u.name,
    email: u.email ?? '',
    role: u.role ?? 'user',
    hasPassword: !!u.passwordHash,
    provider: u.provider ?? null,
    createdAt: u.createdAt instanceof Date ? u.createdAt.toISOString() : u.createdAt,
    lastLoginAt: u.lastLoginAt instanceof Date ? u.lastLoginAt.toISOString() : (u.lastLoginAt ?? null),
  };
}

// ---------------------------------------------------------------------------
export function createMemoryUserStore() {
  const byId = new Map();
  const byEmail = new Map();
  return {
    kind: 'memory',
    async create({ name, email, passwordHash, role = 'user', provider = null, providerId = null }) {
      if (email && byEmail.has(email)) throw new DuplicateEmailError();
      const now = new Date();
      const user = {
        id: randomBytes(12).toString('hex'),
        name,
        email,
        passwordHash: passwordHash ?? null,
        role,
        provider,
        providerId,
        tokenVersion: 0,
        createdAt: now,
        lastLoginAt: null,
      };
      byId.set(user.id, user);
      if (email) byEmail.set(email, user);
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
    async findByProvider(provider, providerId) {
      for (const u of byId.values()) if (u.provider === provider && u.providerId === providerId) return { ...u };
      return null;
    },
    async recordLogin(id) {
      const u = byId.get(id);
      if (u) u.lastLoginAt = new Date();
    },
    async updateProfile(id, { name, email }) {
      const u = byId.get(id);
      if (!u) return null;
      if (email && email !== u.email) {
        if (byEmail.has(email)) throw new DuplicateEmailError();
        byEmail.delete(u.email);
        u.email = email;
        byEmail.set(email, u);
      }
      if (name) u.name = name;
      return { ...u };
    },
    async adminUpdate(id, { name, email, role, passwordHash }) {
      const u = byId.get(id);
      if (!u) return null;
      if (email && email !== u.email) {
        if (byEmail.has(email)) throw new DuplicateEmailError();
        byEmail.delete(u.email);
        u.email = email;
        byEmail.set(email, u);
      }
      if (name) u.name = name;
      if (role) u.role = role;
      if (passwordHash !== undefined) {
        u.passwordHash = passwordHash;
        u.tokenVersion = (u.tokenVersion ?? 0) + 1; // force re-login on password reset
      }
      return { ...u };
    },
    async setPassword(id, passwordHash, { revokeSessions = true } = {}) {
      const u = byId.get(id);
      if (!u) return null;
      u.passwordHash = passwordHash;
      if (revokeSessions) u.tokenVersion = (u.tokenVersion ?? 0) + 1;
      return { ...u };
    },
    async setRole(id, role) {
      const u = byId.get(id);
      if (!u) return null;
      u.role = role;
      return { ...u };
    },
    async list({ limit = 500, skip = 0 } = {}) {
      return [...byId.values()]
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(skip, skip + limit)
        .map((u) => ({ ...u }));
    },
    async count() {
      return byId.size;
    },
    async remove(id) {
      const u = byId.get(id);
      if (!u) return false;
      byId.delete(id);
      if (u.email) byEmail.delete(u.email);
      return true;
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
      passwordHash: doc.passwordHash ?? null,
      role: doc.role ?? 'user',
      provider: doc.provider ?? null,
      providerId: doc.providerId ?? null,
      tokenVersion: doc.tokenVersion ?? 0,
      createdAt: doc.createdAt,
      lastLoginAt: doc.lastLoginAt ?? null,
    };
  const oid = (id) => (typeof id === 'string' && ObjectId.isValid(id) ? new ObjectId(id) : null);

  return {
    kind: 'mongodb',
    async create({ name, email, passwordHash, role = 'user', provider = null, providerId = null }) {
      const now = new Date();
      const doc = {
        name,
        email,
        passwordHash: passwordHash ?? null,
        role,
        provider,
        providerId,
        tokenVersion: 0,
        createdAt: now,
        updatedAt: now,
        lastLoginAt: null,
      };
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
    async findByProvider(provider, providerId) {
      return toUser(await users.findOne({ provider, providerId }));
    },
    async recordLogin(id) {
      const _id = oid(id);
      if (_id) await users.updateOne({ _id }, { $set: { lastLoginAt: new Date() } });
    },
    async updateProfile(id, { name, email }) {
      const _id = oid(id);
      if (!_id) return null;
      const $set = { updatedAt: new Date() };
      if (name) $set.name = name;
      if (email) $set.email = email;
      try {
        await users.updateOne({ _id }, { $set });
      } catch (err) {
        if (err?.code === 11000) throw new DuplicateEmailError();
        throw err;
      }
      return toUser(await users.findOne({ _id }));
    },
    async adminUpdate(id, { name, email, role, passwordHash }) {
      const _id = oid(id);
      if (!_id) return null;
      const $set = { updatedAt: new Date() };
      const $inc = {};
      if (name) $set.name = name;
      if (email) $set.email = email;
      if (role) $set.role = role;
      if (passwordHash !== undefined) {
        $set.passwordHash = passwordHash;
        $inc.tokenVersion = 1;
      }
      try {
        await users.updateOne({ _id }, { $set, ...(Object.keys($inc).length ? { $inc } : {}) });
      } catch (err) {
        if (err?.code === 11000) throw new DuplicateEmailError();
        throw err;
      }
      return toUser(await users.findOne({ _id }));
    },
    async setPassword(id, passwordHash, { revokeSessions = true } = {}) {
      const _id = oid(id);
      if (!_id) return null;
      await users.updateOne(
        { _id },
        { $set: { passwordHash, updatedAt: new Date() }, ...(revokeSessions ? { $inc: { tokenVersion: 1 } } : {}) },
      );
      return toUser(await users.findOne({ _id }));
    },
    async setRole(id, role) {
      const _id = oid(id);
      if (!_id) return null;
      await users.updateOne({ _id }, { $set: { role, updatedAt: new Date() } });
      return toUser(await users.findOne({ _id }));
    },
    async list({ limit = 500, skip = 0 } = {}) {
      const docs = await users.find({}).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray();
      return docs.map(toUser);
    },
    async count() {
      return users.countDocuments();
    },
    async remove(id) {
      const _id = oid(id);
      if (!_id) return false;
      const res = await users.deleteOne({ _id });
      return res.deletedCount > 0;
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
  // Email is unique but optional (social accounts may share nothing else): a
  // partial index lets several docs omit it while still enforcing uniqueness.
  await users.createIndex({ email: 1 }, { unique: true, name: 'email_unique', partialFilterExpression: { email: { $type: 'string' } } });
  await users.createIndex({ provider: 1, providerId: 1 }, { name: 'provider_lookup', sparse: true });
  log(`MongoDB connected (db="${db.databaseName}")`);
  const store = mongoUserStoreFromCollection(users, ObjectId, {
    ping: () => db.command({ ping: 1 }),
    close: () => client.close(),
  });
  // Shared with the message store so both use one connection.
  return Object.assign(store, { db });
}

/**
 * Make sure an admin account exists (seeded from config). Called once at startup.
 * If the account exists it is promoted to admin; otherwise it is created.
 */
export async function seedAdmin(store, { email, password, name }, hashPassword, log = () => {}) {
  const existing = await store.findByEmail(email);
  if (existing) {
    if (existing.role !== 'admin') {
      await store.setRole(existing.id, 'admin');
      log(`admin  promoted existing account ${email} to admin`);
    }
    return existing;
  }
  const user = await store.create({ name, email, passwordHash: await hashPassword(password), role: 'admin' });
  log(`admin  seeded admin account ${email}`);
  return user;
}
