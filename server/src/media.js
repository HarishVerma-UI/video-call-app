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
const LOCAL_URL_TTL_SEC = 3600;
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

  /** A short-lived URL for viewing/downloading an object. null when unset. */
  async function viewUrl(key, { expiresIn = 3600, download } = {}) {
    if (!key) return null;
    if (localDirectory) {
      const expires = Math.floor(Date.now() / 1000) + Math.min(expiresIn, LOCAL_URL_TTL_SEC);
      const filename = download ?? '';
      const signature = localSignature('GET', key, expires, '', filename);
      const params = new URLSearchParams({ key, expires: String(expires), download: filename, signature });
      return `/api/media/local/view?${params}`;
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
    const operation = url.pathname.match(/^\/api\/media\/local\/(upload|view)$/)?.[1];
    if (!operation || !localDirectory) return false;

    const key = url.searchParams.get('key') ?? '';
    const expires = Number(url.searchParams.get('expires'));
    const signature = url.searchParams.get('signature') ?? '';
    const contentType = url.searchParams.get('contentType') ?? '';
    const download = url.searchParams.get('download') ?? '';
    if (!LOCAL_KEY.test(key) || !Number.isSafeInteger(expires) || expires < Math.floor(Date.now() / 1000)) {
      throw new HttpError(403, 'This upload or media link has expired. Please try again.');
    }

    if (operation === 'upload') {
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

    if (req.method !== 'GET' || !validLocalSignature(signature, localSignature('GET', key, expires, '', download))) {
      throw new HttpError(403, 'This media link is invalid or expired.');
    }
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
    res.writeHead(200, {
      'Content-Type': contentTypeForFile,
      'Content-Length': data.length,
      'Content-Disposition': download ? `attachment; filename="${path.basename(download).replace(/["\\\r\n]/g, '_')}"` : 'inline',
      'Cache-Control': 'private, max-age=300',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(data);
    return true;
  }

  return { configured, presignUpload, viewUrl, handleLocal };
}

export class MediaError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
