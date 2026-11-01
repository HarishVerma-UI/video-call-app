import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createOAuth } from '../src/auth/oauth.js';
import { TEST_SECRET } from './helpers.js';

const credentials = {
  google: { clientId: 'google-client', clientSecret: 'google-secret' },
  facebook: { clientId: 'facebook-client', clientSecret: 'facebook-secret' },
};

function harness(oauth = credentials) {
  const users = [];
  const flow = createOAuth({
    oauth,
    appUrl: 'https://huddle.example.test',
    trustProxy: false,
    jwtSecret: TEST_SECRET,
    jwtExpiresInSec: 3600,
    store: {
      async findByProvider(provider, id) {
        return users.find((user) => user.provider === provider && user.providerId === id) ?? null;
      },
      async findByEmail(email) {
        return users.find((user) => user.email === email) ?? null;
      },
      async create(user) {
        const created = { id: String(users.length + 1), ...user };
        users.push(created);
        return created;
      },
      async recordLogin() {},
    },
    issue: () => ({ token: 'test-session-token' }),
  });
  return { flow, users };
}

function response() {
  return {
    status: 0,
    headers: {},
    writeHead(status, headers) {
      this.status = status;
      this.headers = headers;
    },
    end() {},
  };
}

function request(path) {
  return { method: 'GET', url: path, headers: { host: 'huddle.example.test' }, socket: {} };
}

test('OAuth provider discovery reflects configured credentials', () => {
  const { flow } = harness();
  assert.deepEqual(flow.configuredProviders(), { google: true, github: false, facebook: true });
});

test('Facebook authorization uses the registered callback and email permission', async () => {
  const { flow } = harness();
  const res = response();
  await flow.handle(request('/api/auth/oauth/facebook/start?next=%2Fprofile'), res, '/api/auth/oauth/facebook/start');

  assert.equal(res.status, 302);
  const url = new URL(res.headers.Location);
  assert.equal(url.origin, 'https://www.facebook.com');
  assert.equal(url.pathname, '/v26.0/dialog/oauth');
  assert.equal(url.searchParams.get('client_id'), credentials.facebook.clientId);
  assert.equal(url.searchParams.get('redirect_uri'), 'https://huddle.example.test/api/auth/oauth/facebook/callback');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('scope'), 'email,public_profile');
  assert.ok(url.searchParams.get('state'));
});

test('Facebook callback exchanges code with GET and creates a provider account', async () => {
  const { flow, users } = harness();
  const start = response();
  await flow.handle(request('/api/auth/oauth/facebook/start'), start, '/api/auth/oauth/facebook/start');
  const state = new URL(start.headers.Location).searchParams.get('state');
  const originalFetch = globalThis.fetch;
  const calls = [];

  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.toString());
    calls.push({ url, init });
    if (url.pathname.endsWith('/oauth/access_token')) {
      return Response.json({ access_token: 'facebook-access-token' });
    }
    if (url.pathname.endsWith('/me')) {
      return Response.json({ id: 'facebook-user-42', name: 'Facebook User', email: 'person@example.test' });
    }
    throw new Error(`Unexpected OAuth request: ${url}`);
  };

  try {
    const callback = response();
    await flow.handle(
      request(`/api/auth/oauth/facebook/callback?code=auth-code&state=${encodeURIComponent(state)}`),
      callback,
      '/api/auth/oauth/facebook/callback',
    );

    assert.equal(callback.status, 302);
    assert.match(callback.headers.Location, /^https:\/\/huddle\.example\.test\/#auth_token=test-session-token$/);
    assert.equal(calls[0].url.searchParams.get('code'), 'auth-code');
    assert.equal(calls[0].url.searchParams.get('client_id'), credentials.facebook.clientId);
    assert.equal(calls[0].url.searchParams.get('client_secret'), credentials.facebook.clientSecret);
    assert.equal(calls[0].init.method, undefined);
    assert.equal(calls[1].init.headers.Authorization, 'Bearer facebook-access-token');
    assert.deepEqual(users.map(({ provider, providerId, email, name }) => ({ provider, providerId, email, name })), [
      { provider: 'facebook', providerId: 'facebook-user-42', email: 'person@example.test', name: 'Facebook User' },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Google callback verifies the OAuth state and exchanges code with POST', async () => {
  const { flow, users } = harness();
  const start = response();
  await flow.handle(request('/api/auth/oauth/google/start'), start, '/api/auth/oauth/google/start');
  const state = new URL(start.headers.Location).searchParams.get('state');
  const originalFetch = globalThis.fetch;
  const calls = [];

  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.toString());
    calls.push({ url, init });
    if (url.hostname === 'oauth2.googleapis.com') return Response.json({ access_token: 'google-access-token' });
    if (url.hostname === 'openidconnect.googleapis.com') {
      return Response.json({ sub: 'google-user-42', email: 'person@example.test', email_verified: true, name: 'Google User' });
    }
    throw new Error(`Unexpected OAuth request: ${url}`);
  };

  try {
    const callback = response();
    await flow.handle(
      request(`/api/auth/oauth/google/callback?code=auth-code&state=${encodeURIComponent(state)}`),
      callback,
      '/api/auth/oauth/google/callback',
    );

    assert.equal(callback.status, 302);
    assert.match(callback.headers.Location, /^https:\/\/huddle\.example\.test\/#auth_token=test-session-token$/);
    assert.equal(calls[0].init.method, 'POST');
    assert.equal(new URLSearchParams(calls[0].init.body).get('grant_type'), 'authorization_code');
    assert.equal(new URLSearchParams(calls[0].init.body).get('code'), 'auth-code');
    assert.equal(calls[1].init.headers.Authorization, 'Bearer google-access-token');
    assert.equal(users[0].provider, 'google');
    assert.equal(users[0].providerId, 'google-user-42');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
