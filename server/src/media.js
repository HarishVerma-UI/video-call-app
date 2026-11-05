// Production uploads use S3 presigned URLs so the bucket can stay private.
// Development can use signed local file URLs without requiring AWS credentials.

import fs from 'node:fs/promises';
import path from 'node:path';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { HttpError } from './http.js';

const IMAGE_EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };
const DOC_EXT = { 'application/pdf': '.pdf', 'application/msword': '.doc', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx' };

/** kind → allowed content types. */
const ALLOWED = {
  photo: IMAGE_EXT,
  post: IMAGE_EXT,
  cv: DOC_EXT,
};
const MAX_LOCAL_UPLOAD_BYTES = 10 * 1024 * 1024;
const LOCAL_KEY = /^(photo|post|cv)\/[a-f0-9]{24}\/\d+-[a-f0-9]{12}\.(jpg|png|webp|gif|pdf|doc|docx)$/;

let clientPromise = null;
async function getClient(s3) {
  if (!clientPromise) {
    const { S3Client } = await import('@aws-sdk/client-s3');
    clientPromise = Promise.resolve(
      new S3Client({
        region: s3.region,
        credentials: s3.accessKeyId ? { accessKeyId: s3.accessKeyId, secretAccessKey: s3.secretAccessKey } : undefined,
      }),
    );
  }
  return clientPromise;
}

export function createMedia(s3 = {}, log = () => {}) {
  const s3Configured = !!(s3.bucket && s3.region);
  const localDirectory = !s3Configured && typeof s3.localDirectory === 'string' && s3.localDirectory ? path.resolve(s3.localDirectory) : null;
  const localSecret = localDirectory ? randomBytes(32) : null;
  const configured = s3Configured || !!localDirectory;

  function localSignature(method, key, expires, contentType = '', download = '') {
    return createHmac('sha256', localSecret)
      .update(`${method}\n${key}\n${expires}\n${contentType}\n${download}`)
      .digest('hex');
  }

  function validLocalSignature(signature, expected) {
    if (typeof signature !== 'string' || !/^[a-f0-9]{64}$/.test(signature)) return false;
    return timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'));
  }

  /** Validate and build a storage key for a new upload. Throws on bad input. */
  function keyFor(kind, userId, contentType) {
    const map = ALLOWED[kind];
    if (!map) throw new MediaError('Unknown upload type.');
    const ext = map[contentType];
    if (!ext) throw new MediaError('That file type isn’t allowed here.');
    return `${kind}/${userId}/${Date.now()}-${randomBytes(6).toString('hex')}${ext}`;
  }

  /** A short-lived URL the browser PUTs the file to. */
  async function presignUpload({ userId, kind, contentType }) {
    const key = keyFor(kind, userId, contentType);
    if (localDirectory) {
      const expires = Math.floor(Date.now() / 1000) + 300;
      const signature = localSignature('PUT', key, expires, contentType);
      const params = new URLSearchParams({ key, expires: String(expires), contentType, signature });
      return { uploadUrl: `/api/media/local/upload?${params}`, key };
    }
    if (!s3Configured) throw new MediaError('File uploads are not set up on this server yet.', 503);
    const client = await getClient(s3);
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
    const uploadUrl = await getSignedUrl(client, new PutObjectCommand({ Bucket: s3.bucket, Key: key, ContentType: contentType }), { expiresIn: 300 });
    return { uploadUrl, key };
  }

  /** A URL for viewing/downloading an object. null when unset.
   *  Local mode returns a STABLE static path (/media/<key>) that never expires,
   *  so images and files keep working in the UI indefinitely. */
  async function viewUrl(key, { expiresIn = 3600, download } = {}) {
    if (!key) return null;
    if (localDirectory) {
      const base = `/media/${key}`;
      return download ? `${base}?download=${encodeURIComponent(download)}` : base;
    }
    if (!s3Configured) return null;
    const client = await getClient(s3);
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
    return getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: s3.bucket, Key: key, ...(download ? { ResponseContentDisposition: `attachment; filename="${download}"` } : {}) }),
      { expiresIn },
    );
  }

  async function handleLocal(req, res, url) {
    if (!localDirectory) return false;

    // --- Upload: signed PUT to /api/media/local/upload (protects writes) ---
    if (url.pathname === '/api/media/local/upload') {
      const key = url.searchParams.get('key') ?? '';
      const expires = Number(url.searchParams.get('expires'));
      const signature = url.searchParams.get('signature') ?? '';
      const contentType = url.searchParams.get('contentType') ?? '';
      if (!LOCAL_KEY.test(key) || !Number.isSafeInteger(expires) || expires < Math.floor(Date.now() / 1000)) {
        throw new HttpError(403, 'This upload link has expired. Please try again.');
      }
      if (req.method !== 'PUT' || !Object.hasOwn(ALLOWED[key.split('/')[0]], contentType) || req.headers['content-type'] !== contentType) {
        throw new HttpError(400, 'Invalid upload request.');
      }
      if (!validLocalSignature(signature, localSignature('PUT', key, expires, contentType))) {
        throw new HttpError(403, 'This upload link is invalid or expired. Please try again.');
      }

      const chunks = [];
      let size = 0;
      let tooLarge = false;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > MAX_LOCAL_UPLOAD_BYTES) tooLarge = true;
        else if (!tooLarge) chunks.push(chunk);
      }
      if (tooLarge) throw new HttpError(413, 'Files must be 10 MB or smaller.');
      const filePath = path.resolve(localDirectory, key);
      if (!filePath.startsWith(`${localDirectory}${path.sep}`)) throw new HttpError(400, 'Invalid upload path.');
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, Buffer.concat(chunks), { flag: 'wx' });
      res.writeHead(204, { 'Cache-Control': 'no-store' });
      res.end();
      return true;
    }

    // --- View: stable static serving at /media/<key> (no signature, no expiry) ---
    if (url.pathname.startsWith('/media/')) {
      if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Method not allowed');
      const key = decodeURIComponent(url.pathname.slice('/media/'.length));
      if (!LOCAL_KEY.test(key)) throw new HttpError(404, 'Media not found.');
      const extension = path.extname(key).toLowerCase();
      const contentTypeForFile = Object.entries(ALLOWED)
        .flatMap(([, extensions]) => Object.entries(extensions))
        .find(([, ext]) => ext === extension)?.[0];
      if (!contentTypeForFile) throw new HttpError(404, 'Media not found.');

      const filePath = path.resolve(localDirectory, key);
      if (!filePath.startsWith(`${localDirectory}${path.sep}`)) throw new HttpError(404, 'Media not found.');
      let data;
      try {
        data = await fs.readFile(filePath);
      } catch (err) {
        if (err?.code === 'ENOENT') throw new HttpError(404, 'Media not found.');
        throw err;
      }
      const download = url.searchParams.get('download') ?? '';
      res.writeHead(200, {
        'Content-Type': contentTypeForFile,
        'Content-Length': data.length,
        'Content-Disposition': download ? `attachment; filename="${path.basename(download).replace(/["\\\r\n]/g, '_')}"` : 'inline',
        'Cache-Control': 'public, max-age=86400',
        'X-Content-Type-Options': 'nosniff',
      });
      res.end(req.method === 'HEAD' ? undefined : data);
      return true;
    }

    return false;
  }

  /** Delete an uploaded file by its storage key. Best-effort — errors are logged, not thrown. */
  async function deleteFile(key) {
    if (!key) return;
    if (localDirectory) {
      const filePath = path.resolve(localDirectory, key);
      if (!filePath.startsWith(`${localDirectory}${path.sep}`)) return;
      try {
        await fs.unlink(filePath);
        log(`media deleted local file ${key}`);
      } catch (err) {
        if (err?.code !== 'ENOENT') log(`media delete failed ${key}: ${err.message}`);
      }
      return;
    }
    if (!s3Configured) return;
    try {
      const client = await getClient(s3);
      const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
      await client.send(new DeleteObjectCommand({ Bucket: s3.bucket, Key: key }));
      log(`media deleted s3 object ${key}`);
    } catch (err) {
      log(`media s3 delete failed ${key}: ${err.message}`);
    }
  }

  return { configured, presignUpload, viewUrl, deleteFile, handleLocal };
}

export class MediaError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
