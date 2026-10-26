// Small HTTP helpers (we use Node's http module directly, no framework).

export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

export function sendJson(res, status, body, headers = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(JSON.stringify(body));
}

/** Read and parse a JSON request body with a size cap. */
export function readJson(req, limitBytes = 16 * 1024) {
  return new Promise((resolve, reject) => {
    const type = req.headers['content-type'] ?? '';
    if (!type.includes('application/json')) {
      reject(new HttpError(415, 'Expected application/json'));
      return;
    }
    let size = 0;
    let tooBig = false;
    const chunks = [];
    req.on('data', (c) => {
      if (tooBig) return; // discard the rest; the error response closes the connection
      size += c.length;
      if (size > limitBytes) {
        tooBig = true;
        chunks.length = 0;
        reject(new HttpError(413, 'Request body too large', { closeConnection: true }));
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (tooBig) return;
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        reject(new HttpError(400, 'Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

export function clientIp(req, trustProxy) {
  if (trustProxy) {
    const fwd = req.headers['x-forwarded-for'];
    if (typeof fwd === 'string' && fwd) return fwd.split(',')[0].trim();
  }
  return req.socket.remoteAddress ?? 'unknown';
}

export function bearerToken(req) {
  const h = req.headers.authorization;
  if (typeof h !== 'string') return null;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}
