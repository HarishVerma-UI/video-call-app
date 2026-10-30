// REST API for the social / mentorship features: profiles, media upload URLs,
// connections (with partial-profile visibility), posts & feed, and direct
// messages. All routes require a signed-in user.

import { HttpError, readJson, sendJson } from './http.js';
import { MediaError } from './media.js';
import { publicPost, publicProfile } from './db/socialStore.js';

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
  const { profiles, connections, posts, dms, media, requireUser } = deps;
  const log = deps.log ?? (() => {});

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
      headline: str(b.headline, 120),
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
    const p = await profiles.get(userId);
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
    const found = await profiles.search({ q: url.searchParams.get('q') ?? '', role: url.searchParams.get('role') ?? '', exclude: me.id, limit: 40 });
    const out = await Promise.all(
      found.map(async (p) => {
        const state = await connState(me.id, p.userId);
        return profileOut(p, { full: false, state });
      }),
    );
    sendJson(res, 200, { people: out });
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
    if (!(await profiles.get(target))) throw new HttpError(404, 'No such person.');
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

  async function listConnections(req, res) {
    const me = await requireUser(req);
    const accepted = await connections.listFor(me.id, 'accepted');
    const ids = accepted.map((c) => c.users.find((u) => u !== me.id));
    const profs = await profiles.getMany(ids);
    sendJson(res, 200, { connections: await Promise.all(profs.map((p) => profileOut(p, { full: true, state: 'connected' }))) });
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
    const text = str(b.text, 3000);
    const imageKey = typeof b.imageKey === 'string' ? b.imageKey.slice(0, 300) : null;
    if (!text && !imageKey) throw new HttpError(400, 'Write something or add a photo.');
    const myProf = await profiles.get(user.id);
    const post = await posts.create({ authorId: user.id, authorName: user.name, authorPhotoKey: myProf?.photoKey ?? null, text, imageKey });
    sendJson(res, 201, { post: await postOut(post, user.id) });
  }

  async function feed(req, res, url) {
    const me = await requireUser(req);
    const accepted = await connections.listFor(me.id, 'accepted');
    const authorIds = [me.id, ...accepted.map((c) => c.users.find((u) => u !== me.id))];
    const before = url.searchParams.has('before') ? Number(url.searchParams.get('before')) : undefined;
    const list = await posts.feed(authorIds, { before, limit: 20 });
    sendJson(res, 200, { posts: await Promise.all(list.map((p) => postOut(p, me.id))) });
  }

  async function likePost(req, res, id) {
    const me = await requireUser(req);
    const post = await posts.toggleLike(id, me.id);
    if (!post) throw new HttpError(404, 'Post not found.');
    sendJson(res, 200, { post: await postOut(post, me.id) });
  }

  async function commentPost(req, res, id) {
    const me = await requireUser(req);
    const text = str((await readJson(req)).text, 1000);
    if (!text) throw new HttpError(400, 'Write a comment first.');
    const post = await posts.addComment(id, { userId: me.id, name: me.name, text });
    if (!post) throw new HttpError(404, 'Post not found.');
    sendJson(res, 200, { post: await postOut(post, me.id) });
  }

  async function deletePost(req, res, id) {
    const me = await requireUser(req);
    const post = await posts.byId(id);
    if (!post) throw new HttpError(404, 'Post not found.');
    if (post.authorId !== me.id && me.role !== 'admin') throw new HttpError(403, 'You can only delete your own posts.');
    await posts.remove(id);
    sendJson(res, 200, { ok: true });
  }

  // --- direct messages (connected users only) ---
  async function dmThread(req, res, other) {
    const me = await requireUser(req);
    if (!(await connections.areConnected(me.id, other))) throw new HttpError(403, 'You can only message your connections.');
    const before = undefined;
    const msgs = await dms.thread(me.id, other, { before });
    sendJson(res, 200, { messages: msgs });
  }

  async function dmSend(req, res, other) {
    const me = await requireUser(req);
    if (!(await connections.areConnected(me.id, other))) throw new HttpError(403, 'You can only message your connections.');
    const text = str((await readJson(req)).text, 2000);
    if (!text) throw new HttpError(400, 'Write a message first.');
    const m = await dms.send({ from: me.id, fromName: me.name, to: other, text });
    sendJson(res, 201, { message: m });
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
    if (pathname === '/api/connections' && m === 'GET') return (await listConnections(req, res), true);
    if (pathname === '/api/connections/requests' && m === 'GET') return (await listRequests(req, res), true);
    if (pathname === '/api/posts' && m === 'POST') return (await createPost(req, res), true);
    if (pathname === '/api/feed' && m === 'GET') return (await feed(req, res, url), true);
    if (pathname === '/api/dm' && m === 'GET') return (await conversations(req, res), true);

    let mm;
    if ((mm = pathname.match(/^\/api\/profile\/([^/]+)$/)) && m === 'GET') return (await viewProfile(req, res, decodeURIComponent(mm[1])), true);
    if ((mm = pathname.match(/^\/api\/connections\/([^/]+)\/request$/)) && m === 'POST') return (await requestConn(req, res, decodeURIComponent(mm[1])), true);
    if ((mm = pathname.match(/^\/api\/connections\/([^/]+)\/accept$/)) && m === 'POST') return (await respondConn(req, res, decodeURIComponent(mm[1]), true), true);
    if ((mm = pathname.match(/^\/api\/connections\/([^/]+)\/decline$/)) && m === 'POST') return (await respondConn(req, res, decodeURIComponent(mm[1]), false), true);
    if ((mm = pathname.match(/^\/api\/connections\/([^/]+)$/)) && m === 'DELETE') return (await removeConn(req, res, decodeURIComponent(mm[1])), true);
    if ((mm = pathname.match(/^\/api\/posts\/([^/]+)\/like$/)) && m === 'POST') return (await likePost(req, res, decodeURIComponent(mm[1])), true);
    if ((mm = pathname.match(/^\/api\/posts\/([^/]+)\/comments$/)) && m === 'POST') return (await commentPost(req, res, decodeURIComponent(mm[1])), true);
    if ((mm = pathname.match(/^\/api\/posts\/([^/]+)$/)) && m === 'DELETE') return (await deletePost(req, res, decodeURIComponent(mm[1])), true);
    if ((mm = pathname.match(/^\/api\/dm\/([^/]+)$/)) && m === 'GET') return (await dmThread(req, res, decodeURIComponent(mm[1])), true);
    if ((mm = pathname.match(/^\/api\/dm\/([^/]+)$/)) && m === 'POST') return (await dmSend(req, res, decodeURIComponent(mm[1])), true);

    return false;
  }

  return { handle };
}
