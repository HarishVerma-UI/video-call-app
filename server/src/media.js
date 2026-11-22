// Production uploads use S3 presigned URLs so the bucket can stay private.
// Development can use signed local file URLs without requiring AWS credentials.

import fs from 'node:fs/promises';
import path from 'node:path';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { HttpError, readRaw } from './http.js';
import { readZipEntry } from './cv.js';

const IMAGE_EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };
const DOC_EXT = { 'application/pdf': '.pdf', 'application/msword': '.doc', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx', 'text/plain': '.txt' };

/** kind → allowed content types. */
const ALLOWED = {
  photo: IMAGE_EXT,
  post: IMAGE_EXT,
  cv: DOC_EXT,
};
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const MEDIA_KEY = /^(photo|post|cv)\/[a-f0-9]{24}\/\d+-[a-f0-9]{12}\.(jpg|png|webp|gif|pdf|doc|docx|txt)$/;

/** A .txt CV: valid UTF-8 with no binary control bytes (NUL etc.). */
function isPlainText(data) {
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x08\x0e-\x1f]/.test(data.toString('latin1'))) return false;
  try { new TextDecoder('utf-8', { fatal: true }).decode(data); return true; } catch { return false; }
}

export function validateUploadBuffer(kind, contentType, data) {
  const map = ALLOWED[kind];
  if (!map || !Object.hasOwn(map, contentType)) throw new MediaError('That file type isn’t allowed here.');
  if (!Buffer.isBuffer(data) || data.length === 0) throw new MediaError('The selected file is empty or malformed.');
  if (data.length > MAX_UPLOAD_BYTES) throw new MediaError('Files must be 5 MB or smaller.', 413);

  const valid = contentType === 'image/png'
    ? data.length >= 24 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) && data.toString('ascii', 12, 16) === 'IHDR' && data.readUInt32BE(16) > 0 && data.readUInt32BE(20) > 0
    : contentType === 'image/jpeg'
      ? data.length >= 4 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff && data[data.length - 2] === 0xff && data[data.length - 1] === 0xd9
      : contentType === 'image/webp'
        ? data.length >= 12 && data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP'
        : contentType === 'image/gif'
          ? data.length >= 14 && ['GIF87a', 'GIF89a'].includes(data.toString('ascii', 0, 6)) && data[data.length - 1] === 0x3b
          : contentType === 'application/pdf'
            ? data.length >= 12 && data.subarray(0, 5).toString('ascii') === '%PDF-' && data.subarray(-2048).includes(Buffer.from('%%EOF'))
            : contentType === 'text/plain'
              ? isPlainText(data)
            : contentType === 'application/msword'
              ? data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))
              : data.length >= 4 && data.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])) && !!readZipEntry(data, 'word/document.xml');
  if (!valid) throw new MediaError('This file appears to be invalid or malformed.');
  return data;
}

export function isOwnedMediaKey(kind, userId, key) {
  return typeof key === 'string' && MEDIA_KEY.test(key) && key.startsWith(`${kind}/${userId}/`);
}

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
  const uploadSecret = randomBytes(32);
  const configured = s3Configured || !!localDirectory;

  function localSignature(method, key, expires, contentType = '', download = '') {
    return createHmac('sha256', uploadSecret)
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
    if (!/^[a-f0-9]{24}$/.test(userId)) throw new MediaError('Invalid account for upload.');
    return `${kind}/${userId}/${Date.now()}-${randomBytes(6).toString('hex')}${ext}`;
  }

  /** A short-lived URL the browser PUTs the file to. */
  async function presignUpload({ userId, kind, contentType }) {
    const key = keyFor(kind, userId, contentType);
    if (!configured) throw new MediaError('File uploads are not set up on this server yet.', 503);
    const expires = Math.floor(Date.now() / 1000) + 300;
    const signature = localSignature('PUT', key, expires, contentType);
    const params = new URLSearchParams({ key, expires: String(expires), contentType, signature });
    return { uploadUrl: `/api/media/upload?${params}`, key };
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
      new GetObjectCommand({ Bucket: s3.bucket, Key: key, ...(download ? { ResponseContentDisposition: `attachment; filename="${path.basename(download).replace(/["\\\r\n]/g, '_')}"` } : {}) }),
      { expiresIn },
    );
  }

  async function hasFile(key) {
    if (!MEDIA_KEY.test(key)) return false;
    if (localDirectory) {
      try {
        return (await fs.stat(path.resolve(localDirectory, key))).isFile();
      } catch (err) {
        if (err?.code === 'ENOENT') return false;
        throw err;
      }
    }
    if (!s3Configured) return false;
    const client = await getClient(s3);
    const { HeadObjectCommand } = await import('@aws-sdk/client-s3');
    try {
      await client.send(new HeadObjectCommand({ Bucket: s3.bucket, Key: key }));
      return true;
    } catch (err) {
      if (err?.$metadata?.httpStatusCode === 404 || err?.name === 'NotFound' || err?.name === 'NoSuchKey') return false;
      throw err;
    }
  }

  async function handleLocal(req, res, url) {
    if (url.pathname === '/api/media/upload') {
      if (!configured) throw new HttpError(503, 'File uploads are not set up on this server yet.');
      const key = url.searchParams.get('key') ?? '';
      const expires = Number(url.searchParams.get('expires'));
      const signature = url.searchParams.get('signature') ?? '';
      const contentType = url.searchParams.get('contentType') ?? '';
      if (!MEDIA_KEY.test(key) || !Number.isSafeInteger(expires) || expires < Math.floor(Date.now() / 1000)) {
        throw new HttpError(403, 'This upload link has expired. Please try again.');
      }
      if (req.method !== 'PUT' || !Object.hasOwn(ALLOWED[key.split('/')[0]], contentType) || req.headers['content-type'] !== contentType) {
        throw new HttpError(400, 'Invalid upload request.');
      }
      if (!validLocalSignature(signature, localSignature('PUT', key, expires, contentType))) {
        throw new HttpError(403, 'This upload link is invalid or expired. Please try again.');
      }

      const data = validateUploadBuffer(key.split('/')[0], contentType, await readRaw(req, MAX_UPLOAD_BYTES));
      if (localDirectory) {
        const filePath = path.resolve(localDirectory, key);
        if (!filePath.startsWith(`${localDirectory}${path.sep}`)) throw new HttpError(400, 'Invalid upload path.');
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, data, { flag: 'wx' });
      } else {
        const client = await getClient(s3);
        const { PutObjectCommand } = await import('@aws-sdk/client-s3');
        await client.send(new PutObjectCommand({ Bucket: s3.bucket, Key: key, Body: data, ContentType: contentType }));
      }
      res.writeHead(204, { 'Cache-Control': 'no-store' });
      res.end();
      return true;
    }

    // --- View: stable static serving at /media/<key> (no signature, no expiry) ---
    if (!localDirectory) return false;
    if (url.pathname.startsWith('/media/')) {
      if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Method not allowed');
      const key = decodeURIComponent(url.pathname.slice('/media/'.length));
      if (!MEDIA_KEY.test(key)) throw new HttpError(404, 'Media not found.');
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

  return { configured, presignUpload, viewUrl, deleteFile, hasFile, handleLocal };
}

export class MediaError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
