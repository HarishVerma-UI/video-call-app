// Social data: profiles, connections, posts and direct messages.
// Each has a memory implementation (tests / no-DB dev) and a MongoDB one, behind
// one interface, mirroring userStore.js. connectSocialStores() wires the Mongo
// versions onto a shared db and creates indexes.

import { randomBytes } from 'node:crypto';

const now = () => new Date();
const id12 = () => randomBytes(12).toString('hex');
const iso = (d) => (d instanceof Date ? d.toISOString() : d ?? null);
const pairKey = (a, b) => [String(a), String(b)].sort().join(':');

// --- shaping -------------------------------------------------------------
/** Profile for clients. `full` = viewer may see private fields (self or accepted connection). */
export function publicProfile(p, { full = false } = {}) {
  if (!p) return null;
  const base = {
    userId: p.userId,
    name: p.name ?? '',
    headline: p.headline ?? '',
    location: p.location ?? '',
    skills: p.skills ?? [],
    mentor: !!p.mentor,
    mentee: !!p.mentee,
    focusAreas: p.focusAreas ?? [],
    hasPhoto: !!p.photoKey,
    updatedAt: iso(p.updatedAt),
  };
  if (!full) return base;
  return {
    ...base,
    bio: p.bio ?? '',
    mobile: p.mobile ?? '',
    experience: p.experience ?? [],
    education: p.education ?? [],
    hasCv: !!p.cvKey,
    cvName: p.cvName ?? '',
  };
}

const PROFILE_FIELDS = ['name', 'headline', 'bio', 'location', 'mobile', 'photoKey', 'cvKey', 'cvName', 'skills', 'experience', 'education', 'mentor', 'mentee', 'focusAreas'];
function cleanPatch(patch) {
  const out = {};
  for (const k of PROFILE_FIELDS) if (patch[k] !== undefined) out[k] = patch[k];
  return out;
}

export function publicPost(p, { likedBy } = {}) {
  if (!p) return null;
  return {
    id: p.id,
    authorId: p.authorId,
    authorName: p.authorName ?? '',
    authorPhotoKey: p.authorPhotoKey ?? null,
    text: p.text ?? '',
    imageKey: p.imageKey ?? null,
    likeCount: (p.likes ?? []).length,
    likedByMe: likedBy ? (p.likes ?? []).includes(likedBy) : false,
    comments: (p.comments ?? []).map((c) => ({ id: c.id, userId: c.userId, name: c.name, text: c.text, ts: c.ts })),
    createdAt: iso(p.createdAt),
  };
}

// ===================== PROFILES =====================
export function createMemoryProfileStore() {
  const byUser = new Map();
  return {
    kind: 'memory',
    async get(userId) {
      const p = byUser.get(userId);
      return p ? { ...p } : null;
    },
    async upsert(userId, patch) {
      const prev = byUser.get(userId) ?? { userId, createdAt: now() };
      const next = { ...prev, ...cleanPatch(patch), userId, updatedAt: now() };
      byUser.set(userId, next);
      return { ...next };
    },
    async getMany(userIds) {
      return userIds.map((u) => byUser.get(u)).filter(Boolean).map((p) => ({ ...p }));
    },
    async search({ q = '', role = '', limit = 30, exclude } = {}) {
      const needle = q.trim().toLowerCase();
      let list = [...byUser.values()];
      if (exclude) list = list.filter((p) => p.userId !== exclude);
      if (role === 'mentor') list = list.filter((p) => p.mentor);
      if (role === 'mentee') list = list.filter((p) => p.mentee);
      if (needle)
        list = list.filter((p) =>
          [p.name, p.headline, p.location, ...(p.skills ?? [])].join(' ').toLowerCase().includes(needle),
        );
      return list.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).slice(0, limit).map((p) => ({ ...p }));
    },
  };
}

function mongoProfileStore(col) {
  const toP = (d) => d && { ...d, userId: d._id };
  return {
    kind: 'mongodb',
    async get(userId) {
      return toP(await col.findOne({ _id: userId }));
    },
    async upsert(userId, patch) {
      const set = { ...cleanPatch(patch), updatedAt: now() };
      await col.updateOne({ _id: userId }, { $set: set, $setOnInsert: { createdAt: now() } }, { upsert: true });
      return toP(await col.findOne({ _id: userId }));
    },
    async getMany(userIds) {
      return (await col.find({ _id: { $in: userIds } }).toArray()).map(toP);
    },
    async search({ q = '', role = '', limit = 30, exclude } = {}) {
      const filter = {};
      if (exclude) filter._id = { $ne: exclude };
      if (role === 'mentor') filter.mentor = true;
      if (role === 'mentee') filter.mentee = true;
      const needle = q.trim();
      if (needle) {
        const rx = new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        filter.$or = [{ name: rx }, { headline: rx }, { location: rx }, { skills: rx }];
      }
      return (await col.find(filter).sort({ updatedAt: -1 }).limit(limit).toArray()).map(toP);
    },
  };
}

// ===================== CONNECTIONS =====================
export function createMemoryConnectionStore() {
  const byPair = new Map();
  const shape = (c) => ({ ...c, users: [...c.users] });
  return {
    kind: 'memory',
    async between(a, b) {
      const c = byPair.get(pairKey(a, b));
      return c ? shape(c) : null;
    },
    async request(from, to) {
      const key = pairKey(from, to);
      let c = byPair.get(key);
      if (!c) {
        c = { pair: key, users: [from, to], requester: from, status: 'pending', createdAt: now(), updatedAt: now() };
        byPair.set(key, c);
      }
      return shape(c);
    },
    async accept(a, b) {
      const c = byPair.get(pairKey(a, b));
      if (!c) return null;
      c.status = 'accepted';
      c.updatedAt = now();
      return shape(c);
    },
    async remove(a, b) {
      return byPair.delete(pairKey(a, b));
    },
    async listFor(userId, status) {
      return [...byPair.values()].filter((c) => c.users.includes(userId) && (!status || c.status === status)).map(shape);
    },
    async areConnected(a, b) {
      const c = byPair.get(pairKey(a, b));
      return !!c && c.status === 'accepted';
    },
  };
}

function mongoConnectionStore(col) {
  const shape = (d) => d && { pair: d._id, users: d.users, requester: d.requester, status: d.status, createdAt: d.createdAt, updatedAt: d.updatedAt };
  return {
    kind: 'mongodb',
    async between(a, b) {
      return shape(await col.findOne({ _id: pairKey(a, b) }));
    },
    async request(from, to) {
      const key = pairKey(from, to);
      await col.updateOne(
        { _id: key },
        { $setOnInsert: { users: [from, to], requester: from, status: 'pending', createdAt: now() }, $set: { updatedAt: now() } },
        { upsert: true },
      );
      return shape(await col.findOne({ _id: key }));
    },
    async accept(a, b) {
      const key = pairKey(a, b);
      await col.updateOne({ _id: key }, { $set: { status: 'accepted', updatedAt: now() } });
      return shape(await col.findOne({ _id: key }));
    },
    async remove(a, b) {
      const res = await col.deleteOne({ _id: pairKey(a, b) });
      return res.deletedCount > 0;
    },
    async listFor(userId, status) {
      const filter = { users: userId };
      if (status) filter.status = status;
      return (await col.find(filter).toArray()).map(shape);
    },
    async areConnected(a, b) {
      return !!(await col.findOne({ _id: pairKey(a, b), status: 'accepted' }));
    },
  };
}

// ===================== POSTS =====================
export function createMemoryPostStore() {
  const byId = new Map();
  return {
    kind: 'memory',
    async create({ authorId, authorName, authorPhotoKey, text, imageKey }) {
      const post = { id: id12(), authorId, authorName, authorPhotoKey: authorPhotoKey ?? null, text: text ?? '', imageKey: imageKey ?? null, likes: [], comments: [], createdAt: now() };
      byId.set(post.id, post);
      return { ...post };
    },
    async byId(id) {
      const p = byId.get(id);
      return p ? { ...p } : null;
    },
    async feed(authorIds, { before, limit = 20 } = {}) {
      const set = new Set(authorIds);
      let list = [...byId.values()].filter((p) => set.has(p.authorId));
      if (before) list = list.filter((p) => new Date(p.createdAt).getTime() < before);
      return list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, limit).map((p) => ({ ...p }));
    },
    async toggleLike(id, userId) {
      const p = byId.get(id);
      if (!p) return null;
      p.likes = p.likes.includes(userId) ? p.likes.filter((u) => u !== userId) : [...p.likes, userId];
      return { ...p };
    },
    async addComment(id, { userId, name, text }) {
      const p = byId.get(id);
      if (!p) return null;
      p.comments.push({ id: id12(), userId, name, text, ts: Date.now() });
      return { ...p };
    },
    async remove(id) {
      return byId.delete(id);
    },
  };
}

function mongoPostStore(col, ObjectId) {
  const oid = (id) => (typeof id === 'string' && ObjectId.isValid(id) ? new ObjectId(id) : null);
  const toPost = (d) => d && { id: d._id.toString(), authorId: d.authorId, authorName: d.authorName, authorPhotoKey: d.authorPhotoKey ?? null, text: d.text, imageKey: d.imageKey ?? null, likes: d.likes ?? [], comments: d.comments ?? [], createdAt: d.createdAt };
  return {
    kind: 'mongodb',
    async create({ authorId, authorName, authorPhotoKey, text, imageKey }) {
      const doc = { authorId, authorName, authorPhotoKey: authorPhotoKey ?? null, text: text ?? '', imageKey: imageKey ?? null, likes: [], comments: [], createdAt: now() };
      const res = await col.insertOne(doc);
      return toPost({ ...doc, _id: res.insertedId });
    },
    async byId(id) {
      const _id = oid(id);
      return _id ? toPost(await col.findOne({ _id })) : null;
    },
    async feed(authorIds, { before, limit = 20 } = {}) {
      const filter = { authorId: { $in: authorIds } };
      if (before) filter.createdAt = { $lt: new Date(before) };
      return (await col.find(filter).sort({ createdAt: -1 }).limit(limit).toArray()).map(toPost);
    },
    async toggleLike(id, userId) {
      const _id = oid(id);
      if (!_id) return null;
      const doc = await col.findOne({ _id });
      if (!doc) return null;
      const has = (doc.likes ?? []).includes(userId);
      await col.updateOne({ _id }, has ? { $pull: { likes: userId } } : { $addToSet: { likes: userId } });
      return toPost(await col.findOne({ _id }));
    },
    async addComment(id, { userId, name, text }) {
      const _id = oid(id);
      if (!_id) return null;
      await col.updateOne({ _id }, { $push: { comments: { id: id12(), userId, name, text, ts: Date.now() } } });
      return toPost(await col.findOne({ _id }));
    },
    async remove(id) {
      const _id = oid(id);
      if (!_id) return false;
      const res = await col.deleteOne({ _id });
      return res.deletedCount > 0;
    },
  };
}

// ===================== DIRECT MESSAGES =====================
export function createMemoryDmStore() {
  const byConv = new Map();
  return {
    kind: 'memory',
    async send({ from, fromName, to, text }) {
      const convId = pairKey(from, to);
      const m = { id: id12(), convId, from, fromName, to, text, ts: Date.now() };
      const arr = byConv.get(convId) ?? [];
      arr.push(m);
      byConv.set(convId, arr);
      return { ...m };
    },
    async thread(a, b, { before, limit = 50 } = {}) {
      let arr = [...(byConv.get(pairKey(a, b)) ?? [])];
      if (before) arr = arr.filter((m) => m.ts < before);
      return arr.slice(-limit);
    },
    async conversations(userId) {
      const out = [];
      for (const arr of byConv.values()) {
        const last = arr[arr.length - 1];
        if (!last || (last.from !== userId && last.to !== userId)) continue;
        out.push({ other: last.from === userId ? last.to : last.from, last });
      }
      return out.sort((x, y) => y.last.ts - x.last.ts);
    },
  };
}

function mongoDmStore(col) {
  const toM = (d) => d && { id: d._id.toString(), convId: d.convId, from: d.from, fromName: d.fromName, to: d.to, text: d.text, ts: d.ts };
  return {
    kind: 'mongodb',
    async send({ from, fromName, to, text }) {
      const doc = { convId: pairKey(from, to), from, fromName, to, text, ts: Date.now() };
      const res = await col.insertOne(doc);
      return toM({ ...doc, _id: res.insertedId });
    },
    async thread(a, b, { before, limit = 50 } = {}) {
      const filter = { convId: pairKey(a, b) };
      if (before) filter.ts = { $lt: before };
      const docs = await col.find(filter).sort({ ts: -1 }).limit(limit).toArray();
      return docs.reverse().map(toM);
    },
    async conversations(userId) {
      const docs = await col
        .aggregate([
          { $match: { $or: [{ from: userId }, { to: userId }] } },
          { $sort: { ts: -1 } },
          { $group: { _id: '$convId', last: { $first: '$$ROOT' } } },
          { $sort: { 'last.ts': -1 } },
          { $limit: 50 },
        ])
        .toArray();
      return docs.map((d) => ({ other: d.last.from === userId ? d.last.to : d.last.from, last: toM(d.last) }));
    },
  };
}

// ===================== wiring =====================
export async function connectSocialStores(db, log = () => {}) {
  const { ObjectId } = await import('mongodb');
  const profiles = mongoProfileStore(db.collection('profiles'));
  const connections = mongoConnectionStore(db.collection('connections'));
  const posts = mongoPostStore(db.collection('posts'), ObjectId);
  const dms = mongoDmStore(db.collection('dms'));
  await db.collection('profiles').createIndex({ updatedAt: -1 }, { name: 'profiles_recent' });
  await db.collection('connections').createIndex({ users: 1 }, { name: 'connections_users' });
  await db.collection('posts').createIndex({ authorId: 1, createdAt: -1 }, { name: 'posts_author' });
  await db.collection('dms').createIndex({ convId: 1, ts: -1 }, { name: 'dms_conv' });
  log('social stores ready (profiles, connections, posts, dms)');
  return { profiles, connections, posts, dms };
}

export function createMemorySocialStores() {
  return {
    profiles: createMemoryProfileStore(),
    connections: createMemoryConnectionStore(),
    posts: createMemoryPostStore(),
    dms: createMemoryDmStore(),
  };
}
