// API-level end-to-end tests for the social features.
// These hit the real running server over HTTP — no mocks.

const { test, expect } = require('@playwright/test');
const { registerUser, authHeaders } = require('./helpers.js');

test.describe('Feed visibility', () => {
  test('User B sees User A post without being connected', async ({ request }) => {
    // Register two independent users
    const alice = await registerUser(request, 'Alice');
    const bob = await registerUser(request, 'Bob');

    // Alice creates a post
    const postRes = await request.post('/api/posts', {
      headers: authHeaders(alice.token),
      data: { text: 'Hello from Alice!' },
    });
    expect(postRes.status()).toBe(201);
    const { post } = await postRes.json();
    expect(post.text).toBe('Hello from Alice!');

    // Bob fetches the feed — should see Alice's post (no connection needed)
    const feedRes = await request.get('/api/feed', {
      headers: authHeaders(bob.token),
    });
    expect(feedRes.status()).toBe(200);
    const { posts } = await feedRes.json();
    const alicePost = posts.find((p) => p.authorId === alice.user.id);
    expect(alicePost).toBeTruthy();
    expect(alicePost.text).toBe('Hello from Alice!');
  });

  test('feed shows posts from multiple unconnected users', async ({ request }) => {
    const user1 = await registerUser(request, 'Poster1');
    const user2 = await registerUser(request, 'Poster2');
    const viewer = await registerUser(request, 'Viewer');

    // Both users post
    await request.post('/api/posts', {
      headers: authHeaders(user1.token),
      data: { text: 'Post from user1' },
    });
    await request.post('/api/posts', {
      headers: authHeaders(user2.token),
      data: { text: 'Post from user2' },
    });

    // Viewer sees both posts
    const feedRes = await request.get('/api/feed', {
      headers: authHeaders(viewer.token),
    });
    const { posts } = await feedRes.json();
    const texts = posts.map((p) => p.text);
    expect(texts).toContain('Post from user1');
    expect(texts).toContain('Post from user2');
  });

  test('feed paginates with before param', async ({ request }) => {
    const user = await registerUser(request, 'Paginator');

    // Create two posts
    const r1 = await request.post('/api/posts', {
      headers: authHeaders(user.token),
      data: { text: 'Older post' },
    });
    const { post: older } = await r1.json();

    // Small delay so timestamps differ
    await new Promise((r) => setTimeout(r, 50));

    await request.post('/api/posts', {
      headers: authHeaders(user.token),
      data: { text: 'Newer post' },
    });

    // Paginate: posts before the newer one should include the older
    const ts = Date.now();
    const feedRes = await request.get(`/api/feed?before=${ts}`, {
      headers: authHeaders(user.token),
    });
    const { posts } = await feedRes.json();
    expect(posts.length).toBeGreaterThanOrEqual(2);
  });
});

test.describe('People search and listing', () => {
  test('newly registered user appears in People tab', async ({ request }) => {
    const newUser = await registerUser(request, 'Findable');
    const searcher = await registerUser(request, 'Searcher');

    // Search with no query — should list all people
    const res = await request.get('/api/people', {
      headers: authHeaders(searcher.token),
    });
    expect(res.status()).toBe(200);
    const { people } = await res.json();
    const found = people.find((p) => p.userId === newUser.user.id);
    expect(found).toBeTruthy();
    expect(found.name).toBe(newUser.user.name);
  });

  test('user is searchable by name right after registration', async ({ request }) => {
    const target = await registerUser(request, 'Unique Zebra');
    const searcher = await registerUser(request, 'SearcherB');

    const res = await request.get(`/api/people?q=Zebra`, {
      headers: authHeaders(searcher.token),
    });
    expect(res.status()).toBe(200);
    const { people } = await res.json();
    const found = people.find((p) => p.userId === target.user.id);
    expect(found).toBeTruthy();
    expect(found.name).toContain('Zebra');
  });

  test('search filters by role (mentor/mentee)', async ({ request }) => {
    const user = await registerUser(request, 'MentorUser');

    // Update profile to be a mentor
    await request.put('/api/profile', {
      headers: authHeaders(user.token),
      data: { mentor: true, headline: 'I mentor people' },
    });

    const searcher = await registerUser(request, 'RoleSearcher');

    // Search for mentors
    const mentorRes = await request.get('/api/people?role=mentor', {
      headers: authHeaders(searcher.token),
    });
    const { people: mentors } = await mentorRes.json();
    const found = mentors.find((p) => p.userId === user.user.id);
    expect(found).toBeTruthy();

    // Search for mentees — should NOT find this user
    const menteeRes = await request.get('/api/people?role=mentee', {
      headers: authHeaders(searcher.token),
    });
    const { people: mentees } = await menteeRes.json();
    const notFound = mentees.find((p) => p.userId === user.user.id);
    expect(notFound).toBeFalsy();
  });
});

test.describe('Auth flow', () => {
  test('register → login → me', async ({ request }) => {
    const creds = {
      name: 'Auth Test',
      email: `authtest-${Date.now()}@example.com`,
      password: 'secure-pass-123',
    };

    // Register
    const regRes = await request.post('/api/auth/register', { data: creds });
    expect(regRes.status()).toBe(201);
    const { token, user } = await regRes.json();
    expect(user.name).toBe('Auth Test');
    expect(token).toBeTruthy();

    // Login with same credentials
    const loginRes = await request.post('/api/auth/login', {
      data: { email: creds.email, password: creds.password },
    });
    expect(loginRes.status()).toBe(200);
    const loginBody = await loginRes.json();
    expect(loginBody.token).toBeTruthy();

    // /me returns the user
    const meRes = await request.get('/api/auth/me', {
      headers: authHeaders(loginBody.token),
    });
    expect(meRes.status()).toBe(200);
    const meBody = await meRes.json();
    expect(meBody.user.name).toBe('Auth Test');
  });

  test('duplicate email rejected', async ({ request }) => {
    const email = `dup-${Date.now()}@example.com`;
    await request.post('/api/auth/register', {
      data: { name: 'First', email, password: 'pass-word-123' },
    });
    const res = await request.post('/api/auth/register', {
      data: { name: 'Second', email, password: 'pass-word-456' },
    });
    expect(res.status()).toBe(409);
  });

  test('unauthenticated requests return 401', async ({ request }) => {
    const res = await request.get('/api/feed');
    expect(res.status()).toBe(401);
  });
});

test.describe('Posts', () => {
  test('create, like, comment, delete', async ({ request }) => {
    const user = await registerUser(request, 'PostAuthor');
    const h = authHeaders(user.token);

    // Create
    const createRes = await request.post('/api/posts', {
      headers: h,
      data: { text: 'My first post!' },
    });
    expect(createRes.status()).toBe(201);
    const { post } = await createRes.json();
    expect(post.text).toBe('My first post!');
    expect(post.likeCount).toBe(0);

    // Like
    const likeRes = await request.post(`/api/posts/${post.id}/like`, { headers: h });
    expect(likeRes.status()).toBe(200);
    const liked = await likeRes.json();
    expect(liked.post.likedByMe).toBe(true);
    expect(liked.post.likeCount).toBe(1);

    // Comment
    const commentRes = await request.post(`/api/posts/${post.id}/comments`, {
      headers: h,
      data: { text: 'Nice post!' },
    });
    expect(commentRes.status()).toBe(200);
    const commented = await commentRes.json();
    expect(commented.post.comments).toHaveLength(1);
    expect(commented.post.comments[0].text).toBe('Nice post!');

    // Delete
    const delRes = await request.delete(`/api/posts/${post.id}`, { headers: h });
    expect(delRes.status()).toBe(200);
  });

  test('cannot delete another user post', async ({ request }) => {
    const author = await registerUser(request, 'RealAuthor');
    const other = await registerUser(request, 'NotAuthor');

    const createRes = await request.post('/api/posts', {
      headers: authHeaders(author.token),
      data: { text: 'Protected post' },
    });
    const { post } = await createRes.json();

    const delRes = await request.delete(`/api/posts/${post.id}`, {
      headers: authHeaders(other.token),
    });
    expect(delRes.status()).toBe(403);
  });
});

test.describe('Connections and DMs', () => {
  test('connect two users and exchange messages', async ({ request }) => {
    const alice = await registerUser(request, 'ConnAlice');
    const bob = await registerUser(request, 'ConnBob');
    const aH = authHeaders(alice.token);
    const bH = authHeaders(bob.token);

    // Alice requests connection with Bob
    const reqRes = await request.post(`/api/connections/${bob.user.id}/request`, { headers: aH });
    expect(reqRes.status()).toBe(200);
    const reqBody = await reqRes.json();
    expect(reqBody.status).toBe('pending_outgoing');

    // Bob sees the pending request
    const pendingRes = await request.get('/api/connections/requests', { headers: bH });
    expect(pendingRes.status()).toBe(200);
    const { requests } = await pendingRes.json();
    expect(requests.some((r) => r.userId === alice.user.id)).toBe(true);

    // Bob accepts
    const acceptRes = await request.post(`/api/connections/${alice.user.id}/accept`, { headers: bH });
    expect(acceptRes.status()).toBe(200);
    expect((await acceptRes.json()).status).toBe('connected');

    // Both see each other in connections list
    const aliceConns = await (await request.get('/api/connections', { headers: aH })).json();
    expect(aliceConns.connections.some((c) => c.userId === bob.user.id)).toBe(true);

    // Alice sends a DM to Bob
    const dmRes = await request.post(`/api/dm/${bob.user.id}`, {
      headers: aH,
      data: { text: 'Hey Bob!' },
    });
    expect(dmRes.status()).toBe(201);

    // Bob reads the thread
    const threadRes = await request.get(`/api/dm/${alice.user.id}`, { headers: bH });
    expect(threadRes.status()).toBe(200);
    const { messages } = await threadRes.json();
    expect(messages).toHaveLength(1);
    expect(messages[0].text).toBe('Hey Bob!');

    // Both see conversation in conversations list
    const convRes = await request.get('/api/dm', { headers: bH });
    expect(convRes.status()).toBe(200);
    const { conversations } = await convRes.json();
    expect(conversations.some((c) => c.other === alice.user.id)).toBe(true);
  });

  test('cannot DM without connection', async ({ request }) => {
    const alice = await registerUser(request, 'NoConnAlice');
    const bob = await registerUser(request, 'NoConnBob');

    const res = await request.post(`/api/dm/${bob.user.id}`, {
      headers: authHeaders(alice.token),
      data: { text: 'Should fail' },
    });
    expect(res.status()).toBe(403);
  });
});

test.describe('Profile', () => {
  test('auto-created profile is returned on /api/profile/me', async ({ request }) => {
    const user = await registerUser(request, 'ProfileTest');

    const res = await request.get('/api/profile/me', {
      headers: authHeaders(user.token),
    });
    expect(res.status()).toBe(200);
    const { profile } = await res.json();
    expect(profile.name).toBe(user.user.name);
    expect(profile.connection).toBe('self');
  });

  test('update profile and view it', async ({ request }) => {
    const user = await registerUser(request, 'UpdateMe');
    const h = authHeaders(user.token);

    // Update
    await request.put('/api/profile', {
      headers: h,
      data: {
        headline: 'Full-stack dev',
        bio: 'I build things.',
        location: 'Mumbai',
        skills: ['React', 'Node.js'],
        mentor: true,
      },
    });

    // View own profile
    const res = await request.get('/api/profile/me', { headers: h });
    const { profile } = await res.json();
    expect(profile.headline).toBe('Full-stack dev');
    expect(profile.location).toBe('Mumbai');
    expect(profile.skills).toContain('React');
    expect(profile.mentor).toBe(true);
  });

  test('view another user profile', async ({ request }) => {
    const target = await registerUser(request, 'ViewTarget');
    const viewer = await registerUser(request, 'ProfileViewer');

    // Update target's profile
    await request.put('/api/profile', {
      headers: authHeaders(target.token),
      data: { headline: 'Designer', location: 'Delhi' },
    });

    // Viewer sees limited profile (not connected)
    const res = await request.get(`/api/profile/${target.user.id}`, {
      headers: authHeaders(viewer.token),
    });
    expect(res.status()).toBe(200);
    const { profile } = await res.json();
    expect(profile.name).toBe(target.user.name);
    expect(profile.headline).toBe('Designer');
    expect(profile.connection).toBe('none');
    // Full fields should not be present for non-connected user
    expect(profile.bio).toBeUndefined();
  });
});
