import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { createMedia } from '../src/media.js';

let media;
let directory;
before(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'huddle-media-test-'));
  media = createMedia({ localDirectory: directory });
});
after(async () => {
  await rm(directory, { recursive: true, force: true });
});

function request(method, contentType, body = []) {
  const req = Readable.from(body);
  req.method = method;
  req.headers = contentType ? { 'content-type': contentType } : {};
  return req;
}

function response() {
  return {
    status: 0,
    headers: {},
    body: null,
    writeHead(status, headers) {
      this.status = status;
      this.headers = headers;
    },
    end(body) {
      this.body = body;
    },
  };
}

test('local upload is saved and returned as a readable photo URL', async () => {
  const image = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
  const upload = await media.presignUpload({ userId: '0123456789abcdef01234567', kind: 'photo', contentType: 'image/png' });
  const uploadRes = response();
  await media.handleLocal(
    request('PUT', 'image/png', [image]),
    uploadRes,
    new URL(upload.uploadUrl, 'http://localhost'),
  );
  assert.equal(uploadRes.status, 204);

  const photoUrl = await media.viewUrl(upload.key);
  const photoRes = response();
  await media.handleLocal(request('GET'), photoRes, new URL(photoUrl, 'http://localhost'));
  assert.equal(photoRes.status, 200);
  assert.equal(photoRes.headers['Content-Type'], 'image/png');
  assert.deepEqual(photoRes.body, image);
});

test('local upload rejects a tampered signed URL', async () => {
  const upload = await media.presignUpload({ userId: '0123456789abcdef01234567', kind: 'photo', contentType: 'image/png' });
  const url = new URL(upload.uploadUrl, 'http://localhost');
  url.searchParams.set('key', 'photo/000000000000000000000000/1-000000000000.png');
  await assert.rejects(
    media.handleLocal(request('PUT', 'image/png', [Buffer.from([1])]), response(), url),
    (err) => err.status === 403,
  );
});

test('local upload rejects a mismatched content type', async () => {
  const upload = await media.presignUpload({ userId: '0123456789abcdef01234567', kind: 'photo', contentType: 'image/png' });
  const url = new URL(upload.uploadUrl, 'http://localhost');
  await assert.rejects(
    media.handleLocal(request('PUT', 'image/jpeg', [Buffer.from([1])]), response(), url),
    (err) => err.status === 400,
  );
});

test('local upload rejects files larger than 10 MB', async () => {
  const upload = await media.presignUpload({ userId: '0123456789abcdef01234567', kind: 'post', contentType: 'image/png' });
  const responseValue = response();
  await assert.rejects(
    media.handleLocal(request('PUT', 'image/png', [Buffer.alloc(10 * 1024 * 1024 + 1)]), responseValue, new URL(upload.uploadUrl, 'http://localhost')),
    (err) => err.status === 413,
  );
});
