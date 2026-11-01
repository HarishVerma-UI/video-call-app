// Social login (Google & GitHub) with no third-party library — just the OAuth 2.0
// authorization-code flow over fetch.
//
//   GET /api/auth/oauth/:provider/start     → redirects the browser to the provider
//   GET /api/auth/oauth/:provider/callback  → provider redirects back here; we swap
//                                             the code for a profile, find-or-create
//                                             the account, and hand the SPA a token.
//
// A provider is only active when its client id AND secret are set in the env, so the
// app runs fine with social login switched off; the sign-in page hides the buttons.
//
// CSRF is covered by a short-lived signed `state` token (an HS256 JWT). The returned
// session token is passed back to the SPA in the URL hash (`#auth_token=…`), which
// browsers don't send to servers or put in the Referer header.

import { signToken, verifyToken, TokenError } from './jwt.js';

const STATE_AUDIENCE = 'huddle-oauth';

const PROVIDERS = {
  google: {
    label: 'Google',
    scope: 'openid email profile',
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    extraAuthParams: { access_type: 'online', prompt: 'select_account' },
    async profile(accessToken) {
      const r = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!r.ok) throw new Error('Could not read your Google profile.');
      const p = await r.json();
      return {
        id: String(p.sub),
        email: p.email_verified && p.email ? String(p.email).toLowerCase() : null,
        name: p.name || p.given_name || (p.email ? String(p.email).split('@')[0] : 'Google user'),
      };
    },
  },
  github: {
    label: 'GitHub',
    scope: 'read:user user:email',
    authorizeUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    extraAuthParams: {},
    async profile(accessToken) {
      const headers = { Authorization: `Bearer ${accessToken}`, 'User-Agent': 'huddle-app', Accept: 'application/vnd.github+json' };
      const ur = await fetch('https://api.github.com/user', { headers });
      if (!ur.ok) throw new Error('Could not read your GitHub profile.');
      const u = await ur.json();
      let email = u.email ? String(u.email).toLowerCase() : null;
      if (!email) {
        const er = await fetch('https://api.github.com/user/emails', { headers });
        if (er.ok) {
          const list = await er.json();
          const pick = list.find((e) => e.primary && e.verified) || list.find((e) => e.verified);
          email = pick ? String(pick.email).toLowerCase() : null;
        }
      }
      return { id: String(u.id), email, name: u.name || u.login || 'GitHub user' };
    },
  },
};

/** A safe in-app path to return to after login (prevents open redirects). */
function safeNext(raw) {
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.startsWith('//')) return '/';
  return raw;
}

/**
 * @param {{ oauth: object, appUrl: string, trustProxy: boolean, jwtSecret: string,
 *           jwtExpiresInSec: number, store: any, issue: (user)=>{token:string}, log?: Function }} opts
 */
export function createOAuth(opts) {
  const stateOpts = { secret: opts.jwtSecret, issuer: 'huddle', audience: STATE_AUDIENCE };

  const providerCfg = (name) => opts.oauth?.[name];
  const isConfigured = (name) => {
    const c = providerCfg(name);
    return !!(c && c.clientId && c.clientSecret);
  };

  /** Which providers the sign-in page should offer. */
  function configuredProviders() {
    return Object.fromEntries(Object.keys(PROVIDERS).map((name) => [name, isConfigured(name)]));
  }

  function baseUrl(req) {
    if (opts.appUrl) return opts.appUrl;
    const proto = opts.trustProxy && req.headers['x-forwarded-proto'] ? String(req.headers['x-forwarded-proto']).split(',')[0].trim() : req.socket.encrypted ? 'https' : 'http';
    const host = (opts.trustProxy && req.headers['x-forwarded-host']) || req.headers.host || 'localhost';
    return `${proto}://${host}`;
  }

  const redirect = (res, location) => {
    res.writeHead(302, { Location: location, 'Cache-Control': 'no-store' });
    res.end();
  };
  const fail = (res, base, message) => redirect(res, `${base}/login?oauth_error=${encodeURIComponent(message)}`);

  async function exchangeCode(spec, cfg, code, redirectUri) {
    const r = await fetch(spec.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        redirect_uri: redirectUri,
      }).toString(),
    });
    const data = await r.json().catch(() => null);
    if (!r.ok || !data || data.error || !data.access_token) {
      throw new Error(data?.error_description || data?.error || 'Sign-in with the provider failed.');
    }
    return data.access_token;
  }

  /** Find the matching account, linking by verified email, or create a new one. */
  async function resolveUser(provider, profile) {
    let user = await opts.store.findByProvider(provider, profile.id);
    if (user) return user;
    if (profile.email) {
      const byEmail = await opts.store.findByEmail(profile.email);
      if (byEmail) return byEmail; // same verified email = same person
    }
    const newUser = await opts.store.create({ name: profile.name, email: profile.email || null, provider, providerId: profile.id });
    if (opts.onRegister) await opts.onRegister(newUser);
    return newUser;
  }

  /** Returns true if the request was an OAuth route (and has been answered). */
  async function handle(req, res, pathname) {
    const m = pathname.match(/^\/api\/auth\/oauth\/(google|github)\/(start|callback)$/);
    if (!m || req.method !== 'GET') return false;
    const [, provider, action] = m;
    const spec = PROVIDERS[provider];
    const cfg = providerCfg(provider);
    const base = baseUrl(req);

    if (!isConfigured(provider)) {
      fail(res, base, `${spec.label} sign-in isn’t set up on this server.`);
      return true;
    }
    const redirectUri = `${base}/api/auth/oauth/${provider}/callback`;
    const url = new URL(req.url ?? '/', base);

    if (action === 'start') {
      const state = signToken(
        { p: provider, next: safeNext(url.searchParams.get('next')) },
        { ...stateOpts, expiresInSec: 600 },
      );
      const authUrl = new URL(spec.authorizeUrl);
      authUrl.search = new URLSearchParams({
        client_id: cfg.clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: spec.scope,
        state,
        ...spec.extraAuthParams,
      }).toString();
      redirect(res, authUrl.toString());
      return true;
    }

    // callback
    try {
      const err = url.searchParams.get('error');
      if (err) return (fail(res, base, err === 'access_denied' ? 'Sign-in was cancelled.' : err), true);
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');
      if (!code || !state) return (fail(res, base, 'Sign-in response was incomplete.'), true);

      let claims;
      try {
        claims = verifyToken(state, stateOpts);
      } catch (e) {
        if (e instanceof TokenError) return (fail(res, base, 'Sign-in link expired. Please try again.'), true);
        throw e;
      }
      if (claims.p !== provider) return (fail(res, base, 'Sign-in state mismatch.'), true);

      const accessToken = await exchangeCode(spec, cfg, code, redirectUri);
      const profile = await spec.profile(accessToken);
      const user = await resolveUser(provider, profile);
      await opts.store.recordLogin(user.id);
      opts.log?.(`auth   ${provider} login ${user.email || user.id}`);
      const { token } = opts.issue(user);
      redirect(res, `${base}${safeNext(claims.next)}#auth_token=${encodeURIComponent(token)}`);
    } catch (e) {
      opts.log?.(`auth   ${provider} oauth error: ${e.message}`);
      fail(res, base, e.message || 'Social sign-in failed.');
    }
    return true;
  }

  return { handle, configuredProviders };
}
