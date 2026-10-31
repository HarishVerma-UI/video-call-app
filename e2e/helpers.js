// Shared helpers for E2E tests.

let counter = 0;

/** Generate unique user credentials. */
function freshUser(name = 'E2E User') {
  counter++;
  return {
    name: `${name} ${counter}`,
    email: `e2e-${counter}-${Date.now()}@example.com`,
    password: 'test-pass-1234',
  };
}

/** Register a user via the API and return { token, user, creds }. */
async function registerUser(request, name) {
  const creds = freshUser(name);
  const res = await request.post('/api/auth/register', { data: creds });
  if (res.status() !== 201) {
    const body = await res.json().catch(() => null);
    throw new Error(`register failed (${res.status()}): ${JSON.stringify(body)}`);
  }
  const body = await res.json();
  return { ...body, creds };
}

/** Auth header object for the given token. */
function authHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

module.exports = { freshUser, registerUser, authHeaders };
