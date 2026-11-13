// Pure helpers for importing real jobs from public job APIs into our Job shape.
// Kept free of any network/IO so they can be unit-tested; scripts/import-jobs.js
// does the fetching and insertion.

export function stripHtml(html) {
  return String(html || '')
    .replace(/<\s*(br|\/p|\/div|\/li|\/h[1-6])\s*\/?>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

const TECH_RE = /\b(developer|engineer|programmer|software|frontend|front-end|backend|back-end|full[- ]?stack|devops|data|ml|ai|machine learning|qa|sre|architect|ios|android|mobile|web|cloud|security|react|angular|vue|node|python|java|golang|rust|typescript|php|ruby|\.net|sql)\b/i;
export function categorize(title, tags = []) {
  return TECH_RE.test(`${title} ${(tags || []).join(' ')}`) ? 'tech' : 'non-tech';
}

export function classifyType(s) {
  const t = String(s || '').toLowerCase();
  if (t.includes('part')) return 'part-time';
  if (t.includes('contract') || t.includes('freelance') || t.includes('temporary')) return 'contract';
  if (t.includes('intern')) return 'internship';
  return 'full-time';
}

export function classifyExperience(title = '', level = '') {
  const h = `${title} ${level}`.toLowerCase();
  if (/\b(lead|principal|staff|head|director|vp|chief)\b/.test(h)) return 'lead';
  if (/\b(senior|sr\.?)\b/.test(h)) return 'senior';
  if (/\b(junior|jr\.?|entry|intern|graduate|trainee)\b/.test(h)) return 'entry';
  return 'mid';
}

function cleanSkills(tags = []) {
  return [...new Set((tags || []).map((t) => String(t).trim()).filter((t) => t && t.length <= 30))].slice(0, 12);
}
function salaryNum(v) {
  if (v == null) return null;
  const n = Number(String(v).replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

// ---- per-source normalizers → { ...JobInput, _date } --------------------
export function fromRemotive(j) {
  return {
    title: j.title ?? '',
    company: j.company_name ?? '',
    category: categorize(j.title, j.tags),
    country: j.candidate_required_location || 'Remote',
    type: classifyType(j.job_type),
    experience: classifyExperience(j.title),
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: 'USD',
    remote: true,
    description: stripHtml(j.description),
    requirements: [],
    skills: cleanSkills(j.tags),
    active: true,
    applyUrl: j.url ?? '',
    source: 'Remotive',
    _date: j.publication_date ?? null,
  };
}

export function fromArbeitnow(j) {
  return {
    title: j.title ?? '',
    company: j.company_name ?? '',
    category: categorize(j.title, j.tags),
    country: j.location || (j.remote ? 'Remote' : ''),
    type: classifyType((j.job_types || [])[0]),
    experience: classifyExperience(j.title),
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: 'EUR',
    remote: !!j.remote,
    description: stripHtml(j.description),
    requirements: [],
    skills: cleanSkills(j.tags),
    active: true,
    applyUrl: j.url ?? '',
    source: 'Arbeitnow',
    _date: typeof j.created_at === 'number' ? new Date(j.created_at * 1000).toISOString() : (j.created_at ?? null),
  };
}

export function fromJobicy(j) {
  return {
    title: j.jobTitle ?? '',
    company: j.companyName ?? '',
    category: categorize(j.jobTitle, j.jobIndustry),
    country: j.jobGeo || 'Anywhere',
    type: classifyType((j.jobType || [])[0]),
    experience: classifyExperience(j.jobTitle, j.jobLevel),
    salaryMin: salaryNum(j.annualSalaryMin),
    salaryMax: salaryNum(j.annualSalaryMax),
    salaryCurrency: j.salaryCurrency || 'USD',
    remote: true,
    description: stripHtml(j.jobDescription || j.jobExcerpt),
    requirements: [],
    skills: cleanSkills(j.jobIndustry),
    active: true,
    applyUrl: j.url ?? '',
    source: 'Jobicy',
    _date: j.pubDate ? `${String(j.pubDate).replace(' ', 'T')}Z` : null,
  };
}

// ---- pipeline -----------------------------------------------------------
/** Keep only jobs published within the last `days` days (undated jobs are dropped). */
export function filterRecent(jobs, days = 10) {
  const cutoff = Date.now() - days * 86400000;
  return jobs.filter((j) => {
    if (!j._date) return false;
    const t = new Date(j._date).getTime();
    return Number.isFinite(t) && t >= cutoff;
  });
}

/** Drop duplicates (by apply URL, then title+company) and sort newest first. */
export function dedupeJobs(jobs) {
  const seenUrl = new Set();
  const seenKey = new Set();
  const out = [];
  for (const j of jobs) {
    if (!j.title || !j.company || !j.applyUrl) continue;
    const u = j.applyUrl.toLowerCase();
    const k = `${j.title.toLowerCase()}@@${j.company.toLowerCase()}`;
    if (seenUrl.has(u) || seenKey.has(k)) continue;
    seenUrl.add(u);
    seenKey.add(k);
    out.push(j);
  }
  return out.sort((a, b) => new Date(b._date).getTime() - new Date(a._date).getTime());
}

/** Strip the internal _date marker and cap description length, ready to POST. */
export function finalize(jobs) {
  return jobs.map(({ _date, ...j }) => ({ ...j, description: (j.description || '').slice(0, 6000) }));
}

// ---- CSV import (a spreadsheet of jobs) ---------------------------------
/** Minimal RFC-4180 CSV parser → array of row objects keyed by header. */
export function parseCsv(text) {
  const rows = [];
  let field = '';
  let row = [];
  let inQuotes = false;
  const s = String(text ?? '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
      continue;
    }
    if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); field = ''; row = []; }
    else if (c !== '\r') field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim());
  return rows
    .slice(1)
    .filter((r) => r.some((x) => x && x.trim()))
    .map((r) => {
      const o = {};
      header.forEach((h, i) => { o[h] = (r[i] ?? '').trim(); });
      return o;
    });
}

/** "₹35,00,000 - ₹55,00,000" → { min: 3500000, max: 5500000 }. */
export function parseSalaryRange(s) {
  const nums = String(s ?? '').match(/\d[\d,]*/g);
  if (!nums) return { min: null, max: null };
  const toN = (x) => { const n = Number(x.replace(/,/g, '')); return Number.isFinite(n) && n > 0 ? n : null; };
  return { min: toN(nums[0]), max: nums[1] ? toN(nums[1]) : null };
}

/** "5-8 Years" (+ the title) → one of entry/mid/senior/lead. */
export function expFromRange(level, title = '') {
  const byTitle = classifyExperience(title);
  if (byTitle !== 'mid') return byTitle;
  const m = String(level ?? '').match(/\d+/);
  const min = m ? Number(m[0]) : null;
  if (min == null) return 'mid';
  if (min >= 7) return 'lead';
  if (min >= 4) return 'senior';
  if (min >= 2) return 'mid';
  return 'entry';
}

/** Map one CSV row (the "real_it_jobs_with_contacts" shape) to a JobInput. */
export function fromCsvRow(row) {
  const get = (k) => (row[k] ?? '').trim();
  const location = get('Location');
  const stack = get('Tech Stack');
  const salary = get('Salary Range');
  const { min, max } = parseSalaryRange(salary);
  const email = get('Recruitment Email');
  const description = [get('Description'), email ? `Contact: ${email}` : ''].filter(Boolean).join('\n\n');
  const category = /^non-?tech$/i.test(get('Category')) ? 'non-tech' : categorize(`${get('Job Title')} ${stack}`);
  return {
    title: get('Job Title'),
    company: get('Company'),
    category,
    country: location,
    type: classifyType(get('Job Type')),
    experience: expFromRange(get('Experience Level'), get('Job Title')),
    salaryMin: min,
    salaryMax: max,
    salaryCurrency: /₹|\bINR\b|\bRs\b/i.test(salary) ? 'INR' : 'USD',
    remote: /remote/i.test(location),
    description: description.slice(0, 6000),
    requirements: [],
    skills: cleanSkills(stack.split(',')),
    active: true,
    applyUrl: get('Company Website'),
    source: get('Company') || 'Imported',
  };
}

/** Full pipeline over raw source arrays: { remotive, arbeitnow, jobicy } → JobInput[] */
export function buildImport({ remotive = [], arbeitnow = [], jobicy = [] } = {}, { days = 10, limit = 100 } = {}) {
  const all = [...remotive.map(fromRemotive), ...arbeitnow.map(fromArbeitnow), ...jobicy.map(fromJobicy)];
  return finalize(dedupeJobs(filterRecent(all, days))).slice(0, limit);
}
