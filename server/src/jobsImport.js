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

/** Full pipeline over raw source arrays: { remotive, arbeitnow, jobicy } → JobInput[] */
export function buildImport({ remotive = [], arbeitnow = [], jobicy = [] } = {}, { days = 10, limit = 100 } = {}) {
  const all = [...remotive.map(fromRemotive), ...arbeitnow.map(fromArbeitnow), ...jobicy.map(fromJobicy)];
  return finalize(dedupeJobs(filterRecent(all, days))).slice(0, limit);
}
