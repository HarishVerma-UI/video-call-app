// Media uploads via S3 presigned URLs: the browser uploads directly to S3 and
// reads objects back through short-lived presigned GET links, so the bucket can
// stay fully private (no public access, no ACLs). The AWS SDK is imported lazily
// so the rest of the app runs — and tests pass — without S3 configured.

import { randomBytes } from 'node:crypto';

const IMAGE_EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };
const DOC_EXT = { 'application/pdf': '.pdf', 'application/msword': '.doc', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx' };

/** kind → allowed content types. */
const ALLOWED = {
  photo: IMAGE_EXT,
  post: IMAGE_EXT,
  cv: DOC_EXT,
};

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
  const configured = !!(s3.bucket && s3.region);

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
    if (!configured) throw new MediaError('File uploads are not set up on this server yet.', 503);
    const key = keyFor(kind, userId, contentType);
    const client = await getClient(s3);
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
    const uploadUrl = await getSignedUrl(client, new PutObjectCommand({ Bucket: s3.bucket, Key: key, ContentType: contentType }), { expiresIn: 300 });
    return { uploadUrl, key };
  }

  /** A short-lived URL for viewing/downloading an object. null when unset. */
  async function viewUrl(key, { expiresIn = 3600, download } = {}) {
    if (!configured || !key) return null;
    const client = await getClient(s3);
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
    return getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: s3.bucket, Key: key, ...(download ? { ResponseContentDisposition: `attachment; filename="${download}"` } : {}) }),
      { expiresIn },
    );
  }

  return { configured, presignUpload, viewUrl };
}

export class MediaError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
