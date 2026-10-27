// Saved call chat. Messages belong to a room code and are kept for a limited
// time (CHAT_RETENTION_DAYS, default 30), so anyone who joins the room later
// sees what was said.
//
// Interface:
//   add({ roomId, userId, name, text }) -> message
//   recent(roomId, { limit, before? }) -> { messages (oldest first), hasMore }
//   close()
//
// A message is { id, roomId, userId, name, text, ts } with ts in milliseconds.

import { randomBytes } from 'node:crypto';

const MAX_PAGE = 100;

// ---------------------------------------------------------------------------
export function createMemoryMessageStore({ retentionDays = 30, perRoomCap = 500 } = {}) {
  /** @type {Map<string, any[]>} roomId -> messages, oldest first */
  const rooms = new Map();
  const maxAge = retentionDays * 86400_000;

  return {
    kind: 'memory',
    async add({ roomId, userId, name, text }) {
      const list = rooms.get(roomId) ?? [];
      // Strictly increasing per room, so paging by timestamp never skips a message.
      const ts = Math.max(Date.now(), (list.at(-1)?.ts ?? 0) + 1);
      const msg = { id: randomBytes(12).toString('hex'), roomId, userId, name, text, ts };
      list.push(msg);
      if (list.length > perRoomCap) list.splice(0, list.length - perRoomCap);
      rooms.set(roomId, list);
      return { ...msg };
    },
    async recent(roomId, { limit = 50, before } = {}) {
      const cutoff = Date.now() - maxAge;
      const all = (rooms.get(roomId) ?? []).filter((m) => m.ts >= cutoff && (before === undefined || m.ts < before));
      const n = Math.min(Math.max(1, limit), MAX_PAGE);
      return { messages: all.slice(-n).map((m) => ({ ...m })), hasMore: all.length > n };
    },
    async close() {},
  };
}

// ---------------------------------------------------------------------------
/**
 * Wraps a MongoDB collection (tests pass a fake one).
 * @param {import('mongodb').Collection} messages
 */
export function mongoMessageStoreFromCollection(messages) {
  const toMsg = (d) => ({
    id: d._id.toString(),
    roomId: d.roomId,
    userId: d.userId,
    name: d.name,
    text: d.text,
    ts: d.createdAt instanceof Date ? d.createdAt.getTime() : d.createdAt,
  });
  return {
    kind: 'mongodb',
    async add({ roomId, userId, name, text }) {
      const doc = { roomId, userId, name, text, createdAt: new Date() };
      const res = await messages.insertOne(doc);
      return toMsg({ ...doc, _id: res.insertedId });
    },
    async recent(roomId, { limit = 50, before } = {}) {
      const n = Math.min(Math.max(1, limit), MAX_PAGE);
      const filter = before === undefined ? { roomId } : { roomId, createdAt: { $lt: new Date(before) } };
      // Newest n+1 (to know if there are more), then return oldest first.
      const docs = await messages.find(filter).sort({ createdAt: -1 }).limit(n + 1).toArray();
      const hasMore = docs.length > n;
      return { messages: docs.slice(0, n).reverse().map(toMsg), hasMore };
    },
    async close() {},
  };
}

/** Uses the same MongoClient as the user store. */
export async function mongoMessageStore(db, { retentionDays = 30 } = {}) {
  const messages = db.collection('messages');
  await messages.createIndex({ roomId: 1, createdAt: -1 }, { name: 'room_recent' });
  // MongoDB deletes messages automatically once they're older than the retention window.
  await messages
    .createIndex({ createdAt: 1 }, { name: 'retention', expireAfterSeconds: Math.round(retentionDays * 86400) })
    .catch(async (err) => {
      // Retention changed since last start: update the TTL in place.
      if (err?.code === 85 || err?.codeName === 'IndexOptionsConflict') {
        await db.command({ collMod: 'messages', index: { name: 'retention', expireAfterSeconds: Math.round(retentionDays * 86400) } });
      } else throw err;
    });
  return mongoMessageStoreFromCollection(messages);
}
