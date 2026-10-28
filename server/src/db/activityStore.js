// Per-user activity for the Calls and Chat tabs.
//   calls:        one record each time you leave a call (who was there, how long)
//   room_members: rooms you've joined or messaged in, most recent first
//
// Interface:
//   recordCall({ userId, roomId, startedAt, endedAt, with }) -> void
//   recentCalls(userId, limit) -> [{ id, roomId, startedAt, endedAt, durationSec, with }]
//   touchRoom(userId, roomId) -> void
//   recentRooms(userId, limit) -> [{ roomId, lastActiveAt }]

import { randomBytes } from 'node:crypto';

const MAX = 100;
const clamp = (n) => Math.min(Math.max(1, Number(n) || 30), MAX);
const toCall = (c) => ({
  id: String(c.id ?? c._id),
  roomId: c.roomId,
  startedAt: new Date(c.startedAt).toISOString(),
  endedAt: new Date(c.endedAt).toISOString(),
  durationSec: Math.max(0, Math.round((new Date(c.endedAt) - new Date(c.startedAt)) / 1000)),
  with: c.with ?? [],
});

export function createMemoryActivityStore() {
  const calls = [];
  const rooms = new Map(); // `${userId}\n${roomId}` -> { userId, roomId, lastActiveAt }
  return {
    async recordCall({ userId, roomId, startedAt, endedAt, with: others }) {
      calls.push({ id: randomBytes(12).toString('hex'), userId, roomId, startedAt, endedAt, with: others });
      if (calls.length > 10_000) calls.shift();
    },
    async recentCalls(userId, limit) {
      return calls
        .filter((c) => c.userId === userId)
        .sort((a, b) => b.endedAt - a.endedAt)
        .slice(0, clamp(limit))
        .map(toCall);
    },
    async touchRoom(userId, roomId) {
      rooms.set(`${userId}\n${roomId}`, { userId, roomId, lastActiveAt: new Date() });
    },
    async recentRooms(userId, limit) {
      return [...rooms.values()]
        .filter((r) => r.userId === userId)
        .sort((a, b) => b.lastActiveAt - a.lastActiveAt)
        .slice(0, clamp(limit))
        .map((r) => ({ roomId: r.roomId, lastActiveAt: r.lastActiveAt.toISOString() }));
    },
  };
}

export function mongoActivityStoreFromCollections(callsCol, roomsCol) {
  return {
    async recordCall({ userId, roomId, startedAt, endedAt, with: others }) {
      await callsCol.insertOne({ userId, roomId, startedAt, endedAt, with: others });
    },
    async recentCalls(userId, limit) {
      return (await callsCol.find({ userId }).sort({ endedAt: -1 }).limit(clamp(limit)).toArray()).map(toCall);
    },
    async touchRoom(userId, roomId) {
      await roomsCol.updateOne({ userId, roomId }, { $set: { lastActiveAt: new Date() } }, { upsert: true });
    },
    async recentRooms(userId, limit) {
      const docs = await roomsCol.find({ userId }).sort({ lastActiveAt: -1 }).limit(clamp(limit)).toArray();
      return docs.map((d) => ({ roomId: d.roomId, lastActiveAt: new Date(d.lastActiveAt).toISOString() }));
    },
  };
}

export async function mongoActivityStore(db, { retentionDays = 90 } = {}) {
  const callsCol = db.collection('calls');
  const roomsCol = db.collection('room_members');
  await callsCol.createIndex({ userId: 1, endedAt: -1 }, { name: 'by_user' });
  await callsCol.createIndex({ endedAt: 1 }, { name: 'retention', expireAfterSeconds: retentionDays * 86400 }).catch(() => {});
  await roomsCol.createIndex({ userId: 1, roomId: 1 }, { unique: true, name: 'member' });
  await roomsCol.createIndex({ userId: 1, lastActiveAt: -1 }, { name: 'by_user_recent' });
  return mongoActivityStoreFromCollections(callsCol, roomsCol);
}
