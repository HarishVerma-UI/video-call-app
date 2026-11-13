// CV parsing: text extraction (docx/txt) and resume-field heuristics,
// plus the /api/profile/cv/parse route.
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { after, before, test } from 'node:test';
import { extractText, parseResume, readZipEntry } from '../src/cv.js';
import { registerUser, startTestApp } from './helpers.js';

const RESUME = `Asha Verma
Senior Angular Developer
Bengaluru, India
asha.verma@example.com | +91 98765 43210

Skills
Angular, TypeScript, RxJS, NgRx, HTML, CSS

Experience
Senior Frontend Engineer - Acme Corp, 2020 - Present
Led the Angular migration and shared component library.

Frontend Developer - Globex, 2017 - 2020
Built internal dashboards.

Education
B.Tech Computer Science - IIT Delhi, 2013 - 2017
`;

// Minimal single-entry ZIP writer (store or raw-deflate), enough for readZipEntry.
function zip(name, data, deflate) {
  const nameBuf = Buffer.from(name, 'utf8');
  const stored = deflate ? zlib.deflateRawSync(data) : data;
  const n = nameBuf.length;
  const lh = Buffer.alloc(30);
  lh.writeUInt32LE(0x04034b50, 0);
  lh.writeUInt16LE(20, 4);
  lh.writeUInt16LE(deflate ? 8 : 0, 8);
  lh.writeUInt32LE(stored.length, 18);
  lh.writeUInt32LE(data.length, 22);
  lh.writeUInt16LE(n, 26);
  const local = Buffer.concat([lh, nameBuf, stored]);
  const cd = Buffer.alloc(46);
  cd.writeUInt32LE(0x02014b50, 0);
  cd.writeUInt16LE(20, 4);
  cd.writeUInt16LE(20, 6);
  cd.writeUInt16LE(deflate ? 8 : 0, 10);
  cd.writeUInt32LE(stored.length, 20);
  cd.writeUInt32LE(data.length, 24);
  cd.writeUInt16LE(n, 28);
  cd.writeUInt32LE(0, 42); // local header offset
  const central = Buffer.concat([cd, nameBuf]);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(central.length, 12);
  eocd.writeUInt32LE(local.length, 16);
  return Buffer.concat([local, central, eocd]);
}

function docx(text, deflate) {
  const paras = text.split('\n').map((t) => `<w:p><w:r><w:t>${t}</w:t></w:r></w:p>`).join('');
  const xml = `<?xml version="1.0"?><w:document><w:body>${paras}</w:body></w:document>`;
  return zip('word/document.xml', Buffer.from(xml, 'utf8'), deflate);
}

test('readZipEntry reads stored and deflated entries', () => {
  const stored = zip('word/document.xml', Buffer.from('hello'), false);
  const deflated = zip('word/document.xml', Buffer.from('hello'), true);
  assert.equal(readZipEntry(stored, 'word/document.xml').toString(), 'hello');
  assert.equal(readZipEntry(deflated, 'word/document.xml').toString(), 'hello');
  assert.equal(readZipEntry(stored, 'missing.xml'), null);
});

test('extractText: plain text passes through; docx is unzipped', () => {
  assert.match(extractText(Buffer.from(RESUME), 'text/plain'), /Angular/);
  const fromDocx = extractText(docx(RESUME, false), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  assert.match(fromDocx, /Angular/);
  assert.match(fromDocx, /Asha Verma/);
  // deflated docx, detected by the ZIP magic bytes even with a generic type
  assert.match(extractText(docx(RESUME, true), 'application/octet-stream'), /TypeScript/);
});

test('parseResume pulls out the key fields', () => {
  const r = parseResume(RESUME);
  assert.equal(r.name, 'Asha Verma');
  assert.equal(r.email, 'asha.verma@example.com');
  assert.match(r.phone, /98765/);
  assert.equal(r.location, 'Bengaluru, India');
  assert.equal(r.headline, 'Senior Angular Developer');
  assert.ok(r.skills.includes('Angular') && r.skills.includes('TypeScript'));
  assert.equal(r.experience.length, 2);
  assert.equal(r.experience[0].title, 'Senior Frontend Engineer');
  assert.equal(r.experience[0].company, 'Acme Corp');
  assert.equal(r.experience[0].end, 'Present');
  assert.ok(r.education.length >= 1);
  assert.equal(r.education[0].year, '2013');
  assert.equal(r.lowConfidence, false);
});

test('parseResume flags low confidence on junk', () => {
  const r = parseResume('....\n\n####');
  assert.equal(r.lowConfidence, true);
});

// --- route ---
let t;
before(async () => (t = await startTestApp()));
after(() => t.app.close());

test('POST /api/profile/cv/parse returns parsed fields', async () => {
  const u = await registerUser(t.base, 'CV User');
  const res = await fetch(`http://${t.base}/api/profile/cv/parse`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain', Authorization: `Bearer ${u.token}` },
    body: RESUME,
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.parsed.email, 'asha.verma@example.com');
  assert.ok(body.parsed.skills.includes('Angular'));
});

test('cv parse requires auth', async () => {
  const res = await fetch(`http://${t.base}/api/profile/cv/parse`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: RESUME });
  assert.equal(res.status, 401);
});
