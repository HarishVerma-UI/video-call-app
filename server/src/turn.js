// ICE servers for WebRTC, sent to each person when they join a meeting.
//
// STUN lets two devices find a direct path. When there isn't one (strict office
// or mobile-carrier networks), media is relayed through TURN. We run coturn with
// `use-auth-secret`: instead of a fixed TURN password, the server hands out
// credentials that expire (the "TURN REST API" scheme):
//   username   = "<unix expiry>:<user id>"
//   credential = base64(HMAC-SHA1(TURN_SECRET, username))
// coturn recomputes the HMAC with the same secret, so nothing is stored.

import { createHmac } from 'node:crypto';

/**
 * @param {{ stunUrls: string[], turnUrls: string[], turnSecret: string, turnTtlSec: number }} config
 * @param {string} userId
 * @returns {RTCIceServer[]}
 */
export function iceServersFor(config, userId, now = Date.now()) {
  const servers = [];
  if (config.stunUrls.length) servers.push({ urls: config.stunUrls });
  if (config.turnUrls.length && config.turnSecret) {
    const username = `${Math.floor(now / 1000) + config.turnTtlSec}:${userId}`;
    const credential = createHmac('sha1', config.turnSecret).update(username).digest('base64');
    servers.push({ urls: config.turnUrls, username, credential });
  }
  return servers;
}
