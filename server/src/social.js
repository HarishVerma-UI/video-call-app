// REST API for the social / mentorship features: profiles, media upload URLs,
// connections (with partial-profile visibility), posts & feed, and direct
// messages. All routes require a signed-in user.

import { HttpError, readJson, sendJson } from './http.js';
import { MediaError } from './media.js';
import { publicAd, publicNotification, publicPost, publicProfile } from './db/socialStore.js';

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const arr = (v, maxItems, maxLen) => (Array.isArray(v) ? v.slice(0, maxItems).map((x) => str(x, maxLen)).filter(Boolean) : []);

/** Normalise the experience / education arrays from the client. */
function entries(v, keys, maxItems = 20) {
  if (!Array.isArray(v)) return [];
  return v.slice(0, maxItems).map((e) => {
    const o = {};
    for (const [k, len] of Object.entries(keys)) o[k] = str(e?.[k], len);
    return o;
  });
}

/**
 * @param {{ profiles, connections, posts, dms, media, requireUser, log? }} deps
 */
export function createSocial(deps) {
  const { profiles, connections, posts, dms, media, requireUser, users, ads, notifications } = deps;
  // Push a live notification to a user (no-op until signaling is attached).
  const notify = deps.notify ?? (() => 0);

  async function emitNotification(recipientId, { kind, actor, postId, roomId, text }) {
    if (!notifications || !recipientId || recipientId === actor.id) return;
    try {
      const n = await notifications.add({ userId: recipientId, kind, actorId: actor.id, actorName: actor.name, postId, roomId, text });
      notify(recipientId, { type: 'notification', notification: publicNotification(n), unread: await notifications.unreadCount(recipientId) });
    } catch (err) {
      log('notification failed', err);
    }
  }
  const log = deps.log ?? (() => {});

  // Some accounts (e.g. the seeded admin) are created directly in the user store
  // and never got a social profile. Make sure a real account has one so other
  // members can find it, connect, and message it.
  async function ensureProfile(userId) {
    const existing = await profiles.get(userId);
    if (existing) return existing;
    const u = users ? await users.findById(userId) : null;
    if (!u) return null;
    return profiles.upsert(userId, { name: u.name });
  }

  // --- visibility helpers ---
  async function connState(me, target) {
    if (me === target) return 'self';
    const c = await connections.between(me, target);
    if (!c) return 'none';
    if (c.status === 'accepted') return 'connected';
    return c.requester === me ? 'pending_outgoing' : 'pending_incoming';
  }
  const canSeeFull = (state) => state === 'self' || state === 'connected';

  async function profileOut(p, { full, state }) {
    const out = publicProfile(p, { full });
    out.connection = state;
    out.photoUrl = p?.photoKey ? await media.viewUrl(p.photoKey) : null;
    if (full && p?.cvKey) out.cvUrl = await media.viewUrl(p.cvKey, { download: p.cvName || 'cv' });
    return out;
  }
  async function postOut(p, me) {
    const out = publicPost(p, { likedBy: me });
    out.imageUrl = p.imageKey ? await media.viewUrl(p.imageKey) : null;
    out.authorPhotoUrl = p.authorPhotoKey ? await media.viewUrl(p.authorPhotoKey) : null;
    return out;
  }
  async function adOut(a) {
    const out = publicAd(a);
    out.imageUrl = a.imageKey ? await media.viewUrl(a.imageKey) : null;
    return out;
  }

  // --- ads (admin-managed promos shown in the feed sidebar) ---
  async function listAds(req, res) {
    await requireUser(req);
    if (!ads) return sendJson(res, 200, { ads: [] });
    const list = await ads.list({ activeOnly: true });
    sendJson(res, 200, { ads: await Promise.all(list.map(adOut)) });
  }

  // --- profiles ---
  async function myProfile(req, res) {
    const user = await requireUser(req);
    const p = (await profiles.get(user.id)) ?? { userId: user.id, name: user.name };
    sendJson(res, 200, { profile: await profileOut(p, { full: true, state: 'self' }) });
  }

  async function saveProfile(req, res) {
    const user = await requireUser(req);
    const b = await readJson(req);
    const patch = {
      name: user.name, // keep display name in sync with the account
      headline: str(b.headline, 200),
      bio: str(b.bio, 2000),
      location: str(b.location, 120),
      mobile: str(b.mobile, 40),
      skills: arr(b.skills, 40, 40),
      focusAreas: arr(b.focusAreas, 20, 40),
      mentor: !!b.mentor,
      mentee: !!b.mentee,
      experience: entries(b.experience, { title: 120, company: 120, start: 20, end: 20, description: 1000 }),
      education: entries(b.education, { school: 120, degree: 120, year: 20 }),
    };
    if (typeof b.photoKey === 'string') patch.photoKey = b.photoKey.slice(0, 300);
    if (typeof b.cvKey === 'string') { patch.cvKey = b.cvKey.slice(0, 300); patch.cvName = str(b.cvName, 200); }
    const saved = await profiles.upsert(user.id, patch);
    log(`social profile saved ${user.id}`);
    sendJson(res, 200, { profile: await profileOut(saved, { full: true, state: 'self' }) });
  }

  async function viewProfile(req, res, userId) {
    const me = await requireUser(req);
    const p = await ensureProfile(userId);
    if (!p) throw new HttpError(404, 'No profile yet.');
    const state = await connState(me.id, userId);
    const [profile, userPosts] = await Promise.all([
      profileOut(p, { full: canSeeFull(state), state }),
      posts.feed([userId], { limit: 10 }),
    ]);
    sendJson(res, 200, { profile, posts: await Promise.all(userPosts.map((x) => postOut(x, me.id))) });
  }

  async function people(req, res, url) {
    const me = await requireUser(req);
    const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
    const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit')) || 20));
    const skip = (page - 1) * limit;
    const { items: found, total } = await profiles.search({ q: url.searchParams.get('q') ?? '', role: url.searchParams.get('role') ?? '', exclude: me.id, limit, skip });

    // Exclude users who already have a pending connection request with the current user
    const withState = await Promise.all(
      found.map(async (p) => {
        const state = await connState(me.id, p.userId);
        return { profile: p, state };
      }),
    );
    const filtered = withState.filter(({ state }) => state !== 'pending_outgoing' && state !== 'pending_incoming');
    const out = await Promise.all(
      filtered.map(({ profile: p, state }) => profileOut(p, { full: false, state })),
    );
    sendJson(res, 200, { people: out, page, limit, total });
  }

  // --- media ---
  async function uploadUrl(req, res) {
    const user = await requireUser(req);
    const b = await readJson(req);
    const kind = b.kind;
    if (!['photo', 'cv', 'post'].includes(kind)) throw new HttpError(400, 'Unknown upload type.');
    try {
      const out = await media.presignUpload({ userId: user.id, kind, contentType: str(b.contentType, 120) });
      sendJson(res, 200, out);
    } catch (err) {
      if (err instanceof MediaError) throw new HttpError(err.status, err.message);
      throw err;
    }
  }

  // --- connections ---
  async function requestConn(req, res, target) {
    const me = await requireUser(req);
    if (me.id === target) throw new HttpError(400, 'You can’t connect with yourself.');
    if (!(await ensureProfile(target))) throw new HttpError(404, 'No such person.');
    const existing = await connections.between(me.id, target);
    if (existing?.status === 'accepted') throw new HttpError(409, 'You’re already connected.');
    if (existing?.status === 'pending' && existing.requester !== me.id) {
      // They already asked you — accept instead of a second request.
      await connections.accept(me.id, target);
      sendJson(res, 200, { status: 'connected' });
      return;
    }
    await connections.request(me.id, target);
    log(`social connect request ${me.id} -> ${target}`);
    sendJson(res, 200, { status: 'pending_outgoing' });
  }

  async function respondConn(req, res, target, accept) {
    const me = await requireUser(req);
    const c = await connections.between(me.id, target);
    if (!c || c.status !== 'pending' || c.requester === me.id) throw new HttpError(404, 'No pending request from this person.');
    if (accept) {
      await connections.accept(me.id, target);
      sendJson(res, 200, { status: 'connected' });
    } else {
      await connections.remove(me.id, target);
      sendJson(res, 200, { status: 'none' });
    }
  }

  async function removeConn(req, res, target) {
    const me = await requireUser(req);
    await connections.remove(me.id, target);
    sendJson(res, 200, { status: 'none' });
  }

  async function listConnections(req, res, url) {
    const me = await requireUser(req);
    const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
    const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit')) || 20));
    const accepted = await connections.listFor(me.id, 'accepted');
    const total = accepted.length;
    const paged = accepted.slice((page - 1) * limit, page * limit);
    const ids = paged.map((c) => c.users.find((u) => u !== me.id));
    const profs = await profiles.getMany(ids);
    sendJson(res, 200, { connections: await Promise.all(profs.map((p) => profileOut(p, { full: true, state: 'connected' }))), page, limit, total });
  }

  async function listRequests(req, res) {
    const me = await requireUser(req);
    const all = await connections.listFor(me.id, 'pending');
    const incoming = all.filter((c) => c.requester !== me.id);
    const ids = incoming.map((c) => c.requester);
    const profs = await profiles.getMany(ids);
    sendJson(res, 200, { requests: await Promise.all(profs.map((p) => profileOut(p, { full: false, state: 'pending_incoming' }))) });
  }

  // --- posts & feed ---
  async function createPost(req, res) {
    const user = await requireUser(req);
    const b = await readJson(req);
    const text = str(b.text, 5000);
    if (text.length > 5000) throw new HttpError(400, 'Post text must be 5000 characters or fewer.');
    const imageKey = typeof b.imageKey === 'string' ? b.imageKey.slice(0, 300) : null;
    if (!text && !imageKey) throw new HttpError(400, 'Write something or add a photo.');
    const myProf = await profiles.get(user.id);
    const post = await posts.create({ authorId: user.id, authorName: user.name, authorPhotoKey: myProf?.photoKey ?? null, text, imageKey });
    sendJson(res, 201, { post: await postOut(post, user.id) });
  }

  async function feed(req, res, url) {
    const me = await requireUser(req);
    const before = url.searchParams.has('before') ? Number(url.searchParams.get('before')) : undefined;
    const list = await posts.feed(null, { before, limit: 20 });
    sendJson(res, 200, { posts: await Promise.all(list.map((p) => postOut(p, me.id))) });
  }

  async function likePost(req, res, id) {
    const me = await requireUser(req);
    const post = await posts.toggleLike(id, me.id);
    if (!post) throw new HttpError(404, 'Post not found.');
    // Only notify on a new like (not an un-like), and never for liking your own post.
    if ((post.likes ?? []).includes(me.id)) {
      void emitNotification(post.authorId, { kind: 'like', actor: me, postId: post.id, text: post.text?.slice(0, 80) ?? '' });
    }
    sendJson(res, 200, { post: await postOut(post, me.id) });
  }

  async function commentPost(req, res, id) {
    const me = await requireUser(req);
    const text = str((await readJson(req)).text, 2000);
    if (!text) throw new HttpError(400, 'Write a comment first.');
    const post = await posts.addComment(id, { userId: me.id, name: me.name, text });
    if (!post) throw new HttpError(404, 'Post not found.');
    void emitNotification(post.authorId, { kind: 'comment', actor: me, postId: post.id, text: text.slice(0, 80) });
    sendJson(res, 200, { post: await postOut(post, me.id) });
  }

  async function listNotifications(req, res) {
    const me = await requireUser(req);
    if (!notifications) return sendJson(res, 200, { notifications: [], unread: 0 });
    const [list, unread] = await Promise.all([notifications.list(me.id, { limit: 30 }), notifications.unreadCount(me.id)]);
    sendJson(res, 200, { notifications: list.map(publicNotification), unread });
  }

  async function readNotifications(req, res) {
    const me = await requireUser(req);
    if (notifications) await notifications.markAllRead(me.id);
    sendJson(res, 200, { ok: true });
  }

  async function deletePost(req, res, id) {
    const me = await requireUser(req);
    const post = await posts.byId(id);
    if (!post) throw new HttpError(404, 'Post not found.');
    if (post.authorId !== me.id && me.role !== 'admin') throw new HttpError(403, 'You can only delete your own posts.');
    await posts.remove(id);
    if (post.imageKey) media.deleteFile(post.imageKey).catch(() => {});
    sendJson(res, 200, { ok: true });
  }

  async function editPost(req, res, id) {
    const me = await requireUser(req);
    const post = await posts.byId(id);
    if (!post) throw new HttpError(404, 'Post not found.');
    if (post.authorId !== me.id) throw new HttpError(403, 'You can only edit your own posts.');
    const b = await readJson(req);
    const text = str(b.text, 5000);
    if (!text) throw new HttpError(400, 'Post text cannot be empty.');
    const updated = await posts.update(id, { text });
    if (!updated) throw new HttpError(404, 'Post not found.');
    sendJson(res, 200, { post: await postOut(updated, me.id) });
  }

  async function deleteComment(req, res, postId, commentId) {
    const me = await requireUser(req);
    const post = await posts.byId(postId);
    if (!post) throw new HttpError(404, 'Post not found.');
    const comment = post.comments.find((c) => c.id === commentId);
    if (!comment) throw new HttpError(404, 'Comment not found.');
    if (comment.userId !== me.id && post.authorId !== me.id && me.role !== 'admin') {
      throw new HttpError(403, 'You can only delete your own comments or comments on your posts.');
    }
    const updated = await posts.removeComment(postId, commentId);
    sendJson(res, 200, { post: await postOut(updated, me.id) });
  }

  async function searchPosts(req, res, url) {
    const me = await requireUser(req);
    const q = (url.searchParams.get('q') ?? '').trim();
    if (!q) throw new HttpError(400, 'Search query is required.');
    const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
    const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit')) || 20));
    const before = url.searchParams.has('before') ? Number(url.searchParams.get('before')) : undefined;
    const list = await posts.searchText(q, { before, limit });
    sendJson(res, 200, { posts: await Promise.all(list.map((p) => postOut(p, me.id))), page, limit });
  }

  // --- direct messages (connected users only) ---
  async function dmThread(req, res, other, url) {
    const me = await requireUser(req);
    if (!(await connections.areConnected(me.id, other))) throw new HttpError(403, 'You can only message your connections.');
    const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 20));
    const before = url.searchParams.has('before') ? Number(url.searchParams.get('before')) : undefined;
    const msgs = await dms.thread(me.id, other, { before, limit });
    sendJson(res, 200, { messages: msgs, page, limit });
  }

  async function dmSend(req, res, other) {
    const me = await requireUser(req);
    if (!(await connections.areConnected(me.id, other))) throw new HttpError(403, 'You can only message your connections.');
    const text = str((await readJson(req)).text, 5000);
    if (!text) throw new HttpError(400, 'Write a message first.');
    const m = await dms.send({ from: me.id, fromName: me.name, to: other, text });
    sendJson(res, 201, { message: m });
  }

  // Start a call with a connection: drop a "call" message (with the room) into the
  // DM thread and push a live notification, so they know even if they missed the ring.
  async function startCall(req, res, other) {
    const me = await requireUser(req);
    if (me.id === other) throw new HttpError(400, 'You can’t call yourself.');
    if (!(await connections.areConnected(me.id, other))) throw new HttpError(403, 'You can only call your connections.');
    const roomId = str((await readJson(req)).roomId, 64);
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(roomId)) throw new HttpError(400, 'Invalid room.');
    const message = await dms.send({ from: me.id, fromName: me.name, to: other, text: '📞 Started a video call', roomId });
    void emitNotification(other, { kind: 'call', actor: me, roomId, text: '' });
    sendJson(res, 201, { ok: true, message });
  }

  async function conversations(req, res) {
    const me = await requireUser(req);
    const convs = await dms.conversations(me.id);
    const profs = await profiles.getMany(convs.map((c) => c.other));
    const byId = new Map(profs.map((p) => [p.userId, p]));
    const out = await Promise.all(
      convs.map(async (c) => ({
        other: c.other,
        profile: byId.get(c.other) ? await profileOut(byId.get(c.other), { full: false, state: 'connected' }) : { userId: c.other, name: 'Member' },
        last: c.last,
      })),
    );
    sendJson(res, 200, { conversations: out });
  }

  // --- router ---
  async function handle(req, res, pathname, url) {
    if (!pathname.startsWith('/api/')) return false;
    const m = req.method;

    if (pathname === '/api/profile/me' && m === 'GET') return (await myProfile(req, res), true);
    if (pathname === '/api/profile' && m === 'PUT') return (await saveProfile(req, res), true);
    if (pathname === '/api/people' && m === 'GET') return (await people(req, res, url), true);
    if (pathname === '/api/media/upload-url' && m === 'POST') return (await uploadUrl(req, res), true);
    if (pathname === '/api/connections' && m === 'GET') return (await listConnections(req, res, url), true);
    if (pathname === '/api/connections/requests' && m === 'GET') return (await listRequests(req, res), true);
    if (pathname === '/api/posts' && m === 'POST') return (await createPost(req, res), true);
    if (pathname === '/api/posts/search' && m === 'GET') return (await searchPosts(req, res, url), true);
    if (pathname === '/api/feed' && m === 'GET') return (await feed(req, res, url), true);
    if (pathname === '/api/ads' && m === 'GET') return (await listAds(req, res), true);
    if (pathname === '/api/notifications' && m === 'GET') return (await listNotifications(req, res), true);
    if (pathname === '/api/notifications/read' && m === 'POST') return (await readNotifications(req, res), true);
    if (pathname === '/api/dm' && m === 'GET') return (await conversations(req, res), true);

    let mm;
    if ((mm = pathname.match(/^\/api\/profile\/([^/]+)$/)) && m === 'GET') return (await viewProfile(req, res, decodeURIComponent(mm[1])), true);
    if ((mm = pathname.match(/^\/api\/connections\/([^/]+)\/request$/)) && m === 'POST') return (await requestConn(req, res, decodeURIComponent(mm[1])), true);
    if ((mm = pathname.match(/^\/api\/connections\/([^/]+)\/accept$/)) && m === 'POST') return (await respondConn(req, res, decodeURIComponent(mm[1]), true), true);
    if ((mm = pathname.match(/^\/api\/connections\/([^/]+)\/decline$/)) && m === 'POST') return (await respondConn(req, res, decodeURIComponent(mm[1]), false), true);
    if ((mm = pathname.match(/^\/api\/connections\/([^/]+)$/)) && m === 'DELETE') return (await removeConn(req, res, decodeURIComponent(mm[1])), true);
    if ((mm = pathname.match(/^\/api\/posts\/([^/]+)\/like$/)) && m === 'POST') return (await likePost(req, res, decodeURIComponent(mm[1])), true);
    if ((mm = pathname.match(/^\/api\/posts\/([^/]+)\/comments$/)) && m === 'POST') return (await commentPost(req, res, decodeURIComponent(mm[1])), true);
    if ((mm = pathname.match(/^\/api\/posts\/([^/]+)\/comments\/([^/]+)$/)) && m === 'DELETE') return (await deleteComment(req, res, decodeURIComponent(mm[1]), decodeURIComponent(mm[2])), true);
    if ((mm = pathname.match(/^\/api\/posts\/([^/]+)$/)) && m === 'PATCH') return (await editPost(req, res, decodeURIComponent(mm[1])), true);
    if ((mm = pathname.match(/^\/api\/posts\/([^/]+)$/)) && m === 'DELETE') return (await deletePost(req, res, decodeURIComponent(mm[1])), true);
    if ((mm = pathname.match(/^\/api\/dm\/([^/]+)$/)) && m === 'GET') return (await dmThread(req, res, decodeURIComponent(mm[1]), url), true);
    if ((mm = pathname.match(/^\/api\/dm\/([^/]+)$/)) && m === 'POST') return (await dmSend(req, res, decodeURIComponent(mm[1])), true);
    if ((mm = pathname.match(/^\/api\/call\/([^/]+)\/invite$/)) && m === 'POST') return (await startCall(req, res, decodeURIComponent(mm[1])), true);

    return false;
  }

  return { handle };
}
