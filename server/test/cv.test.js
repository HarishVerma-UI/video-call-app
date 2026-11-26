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

test('parseResume reads the summary section (heading or inline) as the bio', () => {
  const block = parseResume('Asha Verma\nPune, India\n\nPROFESSIONAL SUMMARY\nFrontend engineer with 8 years building Angular apps.\nMentors teams.\n\nSkills\nAngular');
  assert.equal(block.summary, 'Frontend engineer with 8 years building Angular apps. Mentors teams.');
  const inline = parseResume('Raj\nSummary: Data analyst who turns messy data into clear decisions.\nSkills\nSQL');
  assert.equal(inline.summary, 'Data analyst who turns messy data into clear decisions.');
  // a "Profile:" link is not a summary
  assert.equal(parseResume('Raj\nProfile: https://linkedin.com/in/raj-some-very-long-handle\nSkills\nSQL').summary, '');
});

test('parseResume reads skills under varied headings and category labels', () => {
  // "Core Technical Skills" with "Label: a, b" lines (not the bare "Skills" heading)
  const r = parseResume('Ravi K\nFront-End Developer\n\nCORE TECHNICAL SKILLS\nFrontend: Angular, React, TypeScript\nTools: Git, CI/CD, REST APIs\n\nExperience\nEngineer - Acme, 2021 - Present\nBuilt things.');
  assert.ok(r.skills.includes('Angular'), 'Angular');
  assert.ok(r.skills.includes('React') && r.skills.includes('TypeScript'));
  assert.ok(r.skills.includes('CI/CD'), 'CI/CD kept intact, not split on the slash');
  assert.ok(!r.skills.some((s) => /^Frontend:|^Tools:/.test(s)), 'category label stripped');
  // inline "Technologies: a | b | c"
  const inline = parseResume('Sara\nTechnologies: Java | Spring Boot | SQL\nExperience\nDev - X, 2020 - 2022\nWork.');
  assert.ok(inline.skills.includes('Java') && inline.skills.includes('Spring Boot') && inline.skills.includes('SQL'));
});

test('parseResume splits multiple roles that have no blank line between them', () => {
  const r = parseResume([
    'Harish V', 'Front-End Developer', '',
    'EXPERIENCE',
    'UI / Front-End Developer',
    'Eurofins Jun 2023 - Present',
    '• Architected Angular frontends',
    'UI Developer | Deloitte',
    'Jun 2021 - 2023',
    '• Built web apps',
    '', 'EDUCATION', 'B.E. CS - Pune University, 2013',
  ].join('\n'));
  assert.equal(r.experience.length, 2);
  assert.equal(r.experience[0].title, 'UI / Front-End Developer');
  assert.equal(r.experience[0].end, 'Present');
  assert.equal(r.experience[1].title, 'UI Developer');
  assert.equal(r.experience[1].company, 'Deloitte');
  assert.ok(!/Deloitte/.test(r.experience[0].description), 'next role does not leak into the previous description');
});

test('parseResume captures skills mentioned anywhere, not only under a heading', () => {
  const r = parseResume('Ada Lane\nFront-End Engineer\nada@x.com\n\nBuilt large apps with Angular and TypeScript; used RxJS, Docker and CI/CD daily.\n\nExperience\nDev - Acme, 2021 - Present\nShipped React components with Jest tests.');
  for (const s of ['Angular', 'TypeScript', 'RxJS', 'Docker', 'CI/CD', 'React', 'Jest']) {
    assert.ok(r.skills.includes(s), `expected skill ${s}`);
  }
});

test('parseResume fills a summary from the opening paragraph when there is no Summary heading', () => {
  const r = parseResume('Ravi Kumar\nSenior Developer\nravi@x.com\n\nSeasoned engineer with a decade of experience delivering reliable, well-tested web products for global teams.\n\nExperience\nLead - Globex, 2019 - 2024\nDid the work.');
  assert.ok(r.summary.length > 40, 'summary filled');
  assert.match(r.summary, /Seasoned engineer/);
});

test('parseResume reads education under "Qualifications"', () => {
  const r = parseResume('Sam Roy\nDesigner\nsam@x.com\n\nQualifications\nB.Des Visual Communication - NID, 2015');
  assert.equal(r.education.length, 1);
  assert.equal(r.education[0].year, '2015');
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
    headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', Authorization: `Bearer ${u.token}` },
    body: docx(RESUME, true),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.parsed.email, 'asha.verma@example.com');
  assert.ok(body.parsed.skills.includes('Angular'));
});

test('cv parse accepts plain-text CVs and rejects other file types', async () => {
  const u = await registerUser(t.base, 'CV Text User');
  const txt = await fetch(`http://${t.base}/api/profile/cv/parse`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain', Authorization: `Bearer ${u.token}` },
    body: RESUME,
  });
  assert.equal(txt.status, 200);
  assert.ok((await txt.json()).parsed.skills.length > 0);
  const png = await fetch(`http://${t.base}/api/profile/cv/parse`, {
    method: 'POST',
    headers: { 'Content-Type': 'image/png', Authorization: `Bearer ${u.token}` },
    body: RESUME,
  });
  assert.equal(png.status, 400);
});

test('cv parse requires auth', async () => {
  const res = await fetch(`http://${t.base}/api/profile/cv/parse`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: RESUME });
  assert.equal(res.status, 401);
});
