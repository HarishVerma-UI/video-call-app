// Dependency-free CV/resume parsing.
//
// extractText() pulls plain text out of a DOCX (a ZIP of XML — read with the
// built-in zlib), a simple PDF (best-effort: inflate FlateDecode streams and
// read the text-showing operators), or a plain-text file.
//
// parseResume() then applies light heuristics to pull out name, email, phone,
// location, skills, experience and education. It is deliberately forgiving:
// the web client always lets the member review and edit the result before it
// is saved, so "best effort, never wrong-confident" is the goal.

import zlib from 'node:zlib';

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_RE = /(?:(?:\+|00)\d{1,3}[\s-]?)?(?:\(\d{1,4}\)[\s-]?)?\d(?:[\d\s-]{6,}\d)/;
const YEAR_RE = /\b(?:19|20)\d{2}\b/;
const SECTION_RE = /^(summary|objective|profile|skills|technical skills|core competencies|experience|work experience|professional experience|employment|education|academic|projects|certifications|achievements|interests|languages|references|contact)\b/i;

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

// ---- ZIP (DOCX) ----------------------------------------------------------
/** Read one entry from a ZIP buffer via its central directory. Returns a Buffer or null. */
export function readZipEntry(buf, name) {
  const EOCD = 0x06054b50;
  let eocd = -1;
  const min = Math.max(0, buf.length - 22 - 65536);
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === EOCD) { eocd = i; break; }
  }
  if (eocd < 0) return null;
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < count && off + 46 <= buf.length; n++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) break;
    const comp = buf.readUInt16LE(off + 10);
    const compSize = buf.readUInt32LE(off + 20);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const localOff = buf.readUInt32LE(off + 42);
    const entryName = buf.toString('utf8', off + 46, off + 46 + nameLen);
    if (entryName === name) {
      const lhNameLen = buf.readUInt16LE(localOff + 26);
      const lhExtraLen = buf.readUInt16LE(localOff + 28);
      const dataStart = localOff + 30 + lhNameLen + lhExtraLen;
      const data = buf.subarray(dataStart, dataStart + compSize);
      if (comp === 0) return Buffer.from(data);
      if (comp === 8) { try { return zlib.inflateRawSync(data); } catch { return null; } }
      return null;
    }
    off += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

function docxText(buf) {
  const xml = readZipEntry(buf, 'word/document.xml');
  if (!xml) return '';
  let s = xml.toString('utf8');
  // paragraphs and breaks → newlines, tabs → tabs, then drop every tag
  s = s
    .replace(/<\/w:p>/g, '\n')
    .replace(/<w:tab\b[^>]*\/>/g, '\t')
    .replace(/<w:br\b[^>]*\/?>/g, '\n')
    .replace(/<[^>]+>/g, '');
  return decodeEntities(s);
}

// ---- PDF (best effort) ---------------------------------------------------
function unescapePdf(s) {
  return s
    .replace(/\\n/g, '\n').replace(/\\r/g, '\n').replace(/\\t/g, '\t')
    .replace(/\\([()\\])/g, '$1')
    .replace(/\\(\d{1,3})/g, (_, o) => String.fromCharCode(parseInt(o, 8)));
}

function pdfText(buf) {
  const str = buf.toString('latin1');
  const parts = [];
  const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let m;
  while ((m = re.exec(str))) {
    const raw = Buffer.from(m[1], 'latin1');
    try { parts.push(zlib.inflateSync(raw).toString('latin1')); } catch { parts.push(raw.toString('latin1')); }
  }
  const content = parts.length ? parts.join('\n') : str;
  const chunks = [];
  // text in ( ) before Tj / TJ / ' / "
  const re2 = /\((?:\\.|[^\\()])*\)/g;
  let t;
  while ((t = re2.exec(content))) chunks.push(unescapePdf(t[0].slice(1, -1)));
  return chunks.join(' ').replace(/[ \t]{2,}/g, ' ');
}

// ---- dispatch ------------------------------------------------------------
export function extractText(buf, contentType = '') {
  if (!buf || !buf.length) return '';
  const type = String(contentType).toLowerCase();
  const isZip = buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04;
  const isPdf = buf.length > 4 && buf.subarray(0, 5).toString('latin1') === '%PDF-';
  if (isZip || type.includes('officedocument') || type.includes('msword') || type.includes('word')) {
    const txt = isZip ? docxText(buf) : '';
    if (txt) return txt;
  }
  if (isPdf || type.includes('pdf')) return pdfText(buf);
  return buf.toString('utf8');
}

// ---- resume heuristics ---------------------------------------------------
function splitSkills(text) {
  return text
    .split(/[,;•|·\n\t]|(?:\s{2,})/)
    .map((s) => s.replace(/^[-–•\s]+|[-–•\s]+$/g, '').trim())
    .filter((s) => s && s.length <= 40 && /[A-Za-z]/.test(s) && !/^(and|or|etc\.?)$/i.test(s));
}

/** Collect the lines that belong to a section, from its heading to the next heading. */
function sectionLines(lines, headingRe) {
  const out = [];
  let inSection = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (!inSection) {
      if (headingRe.test(line)) inSection = true;
      continue;
    }
    // stop at the next section heading
    if (line && SECTION_RE.test(line) && !headingRe.test(line)) break;
    out.push(raw);
  }
  return out;
}

function extractSkills(lines) {
  const block = sectionLines(lines, /^(skills|technical skills|core competencies)\b/i)
    .join('\n')
    .trim();
  if (block) return dedupe(splitSkills(block)).slice(0, 40);
  return [];
}

/** Group a section's lines into entries separated by blank lines. */
function entryBlocks(lines) {
  const blocks = [];
  let cur = [];
  for (const raw of lines) {
    if (raw.trim() === '') { if (cur.length) { blocks.push(cur); cur = []; } }
    else cur.push(raw.trim());
  }
  if (cur.length) blocks.push(cur);
  return blocks;
}

function extractExperience(lines) {
  const block = sectionLines(lines, /^(experience|work experience|professional experience|employment)\b/i);
  const out = [];
  for (const b of entryBlocks(block)) {
    if (!b.length) continue;
    const head = b[0];
    const years = head.match(new RegExp(`${YEAR_RE.source}[^]*?(?:${YEAR_RE.source}|present)`, 'i'));
    const seg = head.split(/\s[-–|@]\s|,\s/).map((x) => x.trim()).filter(Boolean);
    const title = seg[0] ?? head;
    const company = seg[1] ?? (b[1] && !YEAR_RE.test(b[1]) ? b[1] : '');
    const yrs = head.match(YEAR_RE) ? head.match(new RegExp(YEAR_RE.source, 'g')) : [];
    out.push({
      title: title.slice(0, 120),
      company: company.slice(0, 120),
      start: years && yrs && yrs[0] ? yrs[0] : '',
      end: years && yrs && yrs[1] ? yrs[1] : /present/i.test(head) ? 'Present' : '',
      description: b.slice(1).join(' ').slice(0, 1000),
    });
    if (out.length >= 10) break;
  }
  return out;
}

function extractEducation(lines) {
  const block = sectionLines(lines, /^(education|academic)\b/i);
  const out = [];
  for (const b of entryBlocks(block)) {
    if (!b.length) continue;
    const head = b[0];
    const year = head.match(YEAR_RE)?.[0] ?? b.join(' ').match(YEAR_RE)?.[0] ?? '';
    const seg = head.split(/\s[-–|@]\s|,\s/).map((x) => x.trim()).filter(Boolean);
    out.push({
      school: (seg[0] ?? head).slice(0, 120),
      degree: (seg[1] ?? (b[1] ?? '')).replace(YEAR_RE, '').trim().slice(0, 120),
      year,
    });
    if (out.length >= 10) break;
  }
  return out;
}

function dedupe(arr) {
  const seen = new Set();
  const out = [];
  for (const x of arr) {
    const k = x.toLowerCase();
    if (!seen.has(k)) { seen.add(k); out.push(x); }
  }
  return out;
}

export function parseResume(text) {
  const clean = String(text || '').replace(/\r/g, '').replace(/ /g, ' ');
  const lines = clean.split('\n');
  const nonEmpty = lines.map((l) => l.trim()).filter(Boolean);

  const email = (clean.match(EMAIL_RE) || [''])[0];
  const phoneM = clean.match(PHONE_RE);
  const phone = phoneM ? phoneM[0].trim().replace(/\s{2,}/g, ' ') : '';

  let name = '';
  for (const l of nonEmpty.slice(0, 8)) {
    if (EMAIL_RE.test(l) || /\d{4,}/.test(l) || SECTION_RE.test(l)) continue;
    if (/^(curriculum vitae|resume|cv)$/i.test(l)) continue;
    const words = l.split(/\s+/);
    if (words.length >= 1 && words.length <= 4 && l.length <= 50 && /^[A-Za-z][A-Za-z.'-]*$/.test(words[0])) { name = l; break; }
  }

  let headline = '';
  const nameIdx = name ? nonEmpty.indexOf(name) : -1;
  if (nameIdx >= 0) {
    for (const l of nonEmpty.slice(nameIdx + 1, nameIdx + 4)) {
      if (EMAIL_RE.test(l) || PHONE_RE.test(l) || SECTION_RE.test(l)) continue;
      if (l.length >= 3 && l.length <= 80) { headline = l; break; }
    }
  }

  // location: a line like "City, Country" near the top, not the name
  let location = '';
  for (const l of nonEmpty.slice(0, 10)) {
    if (l === name || EMAIL_RE.test(l)) continue;
    const mm = l.match(/^([A-Za-z.'-]+(?:\s[A-Za-z.'-]+){0,2}),\s*([A-Za-z.'-]+(?:\s[A-Za-z.'-]+){0,2})$/);
    if (mm && l.length <= 50) { location = l; break; }
  }

  const skills = extractSkills(lines);
  const experience = extractExperience(lines);
  const education = extractEducation(lines);

  const textFound = nonEmpty.length > 2;
  const lowConfidence = !textFound || (!email && !name && skills.length === 0);

  return { name, email, phone, location, headline, skills, experience, education, lowConfidence };
}

/** Convenience: bytes → parsed resume fields. */
export function parseCv(buf, contentType) {
  return parseResume(extractText(buf, contentType));
}
