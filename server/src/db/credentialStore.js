// Face sign-in credentials, one per device:
//   kind "passkey": WebAuthn public key (web browsers, and phones through the browser)
//   kind "device":  the mobile app's key, kept in the phone's keychain behind Face ID /
//                   fingerprint; we store only its SHA-256 hash
//
// Interface:
//   add(cred) -> cred
//   findById(id) -> cred | null
//   listByUser(userId) -> cred[] (newest first)
//   touch(id, { signCount? }) -> void        (records lastUsedAt)
//   remove(userId, id) -> boolean
//
// cred = { id, userId, kind, name, publicKey?, alg?, signCount?, userHandle?, transports?,
//          secretHash?, synced?, createdAt, lastUsedAt }

export function publicCredential(c) {
  const iso = (d) => (d instanceof Date ? d.toISOString() : d ?? null);
  return { id: c.id, kind: c.kind, name: c.name, synced: !!c.synced, createdAt: iso(c.createdAt), lastUsedAt: iso(c.lastUsedAt) };
}

export function createMemoryCredentialStore() {
  const byId = new Map();
  return {
    async add(cred) {
      if (byId.has(cred.id)) throw Object.assign(new Error('Credential already registered.'), { code: 'duplicate' });
      const c = { ...cred, createdAt: new Date(), lastUsedAt: null };
      byId.set(c.id, c);
      return { ...c };
    },
    async findById(id) {
      const c = byId.get(id);
      return c ? { ...c } : null;
    },
    async listByUser(userId) {
      return [...byId.values()].filter((c) => c.userId === userId).sort((a, b) => b.createdAt - a.createdAt).map((c) => ({ ...c }));
    },
    async touch(id, { signCount } = {}) {
      const c = byId.get(id);
      if (!c) return;
      c.lastUsedAt = new Date();
      if (signCount !== undefined) c.signCount = signCount;
    },
    async remove(userId, id) {
      const c = byId.get(id);
      if (!c || c.userId !== userId) return false;
      byId.delete(id);
      return true;
    },
  };
}

/** @param {import('mongodb').Collection} col  documents use the credential id as _id */
export function mongoCredentialStoreFromCollection(col) {
  const toCred = (d) => d && { ...d, id: d._id, _id: undefined };
  return {
    async add(cred) {
      const { id, ...rest } = cred;
      const doc = { _id: id, ...rest, createdAt: new Date(), lastUsedAt: null };
      try {
        await col.insertOne(doc);
      } catch (err) {
        if (err?.code === 11000) throw Object.assign(new Error('Credential already registered.'), { code: 'duplicate' });
        throw err;
      }
      return toCred(doc);
    },
    async findById(id) {
      return typeof id === 'string' ? toCred(await col.findOne({ _id: id })) : null;
    },
    async listByUser(userId) {
      return (await col.find({ userId }).sort({ createdAt: -1 }).limit(50).toArray()).map(toCred);
    },
    async touch(id, { signCount } = {}) {
      await col.updateOne({ _id: id }, { $set: { lastUsedAt: new Date(), ...(signCount !== undefined ? { signCount } : {}) } });
    },
    async remove(userId, id) {
      const res = await col.deleteOne({ _id: id, userId });
      return res.deletedCount === 1;
    },
  };
}

export async function mongoCredentialStore(db) {
  const col = db.collection('credentials');
  await col.createIndex({ userId: 1, createdAt: -1 }, { name: 'by_user' });
  return mongoCredentialStoreFromCollection(col);
}
