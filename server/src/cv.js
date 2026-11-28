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
const BULLET_RE = /^[•\-*·–—○▪●◦‣◆▶»]/;
// All the headings a "skills" section goes by in the wild. Longest/most-specific
// first so a line like "Core Technical Skills" matches that, not bare "skills".
const SKILLS_HEAD = 'core technical skills|technical skills|core competencies|key skills|technical proficiencies|technical expertise|areas of expertise|core technologies|technologies|technology stack|tech stack|tools (?:&|and) technologies|skills (?:&|and) (?:tools|expertise|interests)|competencies|proficiencies|expertise|skills';
const EXP_HEAD = 'experience|work experience|professional experience|employment|employment history|work history|career history';
const EDU_HEAD = 'education|academic|academics|academic background|educational background|educational qualifications|qualifications|education (?:&|and) (?:training|certifications)';
const SECTION_RE = new RegExp(`^(?:summary|objective|profile|${SKILLS_HEAD}|${EXP_HEAD}|${EDU_HEAD}|projects|certifications|achievements|interests|languages|references|contact)\\b`, 'i');

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
    .split(/[,;•|·\n\t]|\s{2,}|\s\/\s/)
    .map((s) => s.replace(/^[-–•\s]+|[-–•\s]+$/g, '').trim())
    // drop a leading category label ("Frontend: Angular" → "Angular")
    .map((s) => s.replace(/^[A-Za-z][\w .&+#-]{0,24}:\s*/, '').trim())
    .filter((s) => s && s.length <= 40 && /[A-Za-z]/.test(s) && !/^(and|or|etc\.?|e\.?g\.?|including|such as)$/i.test(s));
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

const SUMMARY_HEAD = 'professional summary|career summary|summary|career objective|objective|professional profile|profile|about me|about';
/** The "Summary / Profile / About" section as one paragraph — becomes the profile bio. */
function extractSummary(lines) {
  const inline = new RegExp(`^(?:${SUMMARY_HEAD})\\s*[:\\-–]\\s*(.+)$`, 'i');
  for (const raw of lines) {
    const m = raw.trim().match(inline);
    if (m && m[1].length >= 40 && !/https?:\/\//i.test(m[1])) return m[1].trim().slice(0, 1200);
  }
  const body = sectionLines(lines, new RegExp(`^(?:${SUMMARY_HEAD})\\s*:?$`, 'i'))
    .map((l) => l.trim().replace(/^[•\-*]\s*/, ''))
    .filter(Boolean);
  return body.join(' ').replace(/\s+/g, ' ').trim().slice(0, 1200);
}

/**
 * Fallback summary: the first substantial paragraph at the top of the CV, before
 * any section heading — many resumes open with a profile blurb and no "Summary"
 * label. Skips the name, headline, and contact lines.
 */
function firstParagraphSummary(nonEmpty, name, headline) {
  const out = [];
  for (const l of nonEmpty.slice(0, 25)) {
    if (SECTION_RE.test(l)) break; // reached a real section — stop
    if (l === name || l === headline) continue;
    if (EMAIL_RE.test(l) || PHONE_RE.test(l)) continue;
    if (/^https?:\/\//i.test(l) || /linkedin\.com|github\.com/i.test(l)) continue;
    if (out.length === 0 && l.length < 40) continue; // skip short label/location lines before the blurb
    out.push(l);
    if (out.join(' ').length > 400) break;
  }
  const text = out.join(' ').replace(/\s+/g, ' ').trim();
  return text.length >= 60 ? text.slice(0, 1200) : '';
}

const SKILLS_HEAD_RE = new RegExp(`^(?:${SKILLS_HEAD})\\b`, 'i');
const SKILLS_INLINE_RE = new RegExp(`^(?:${SKILLS_HEAD})\\s*[:\\-–]\\s*(.+)$`, 'i');
// Well-known skills/tools grouped by professional domain, so that skills
// mentioned ANYWHERE in the CV (a summary line, an experience bullet) are picked
// up, not only the ones under a "Skills" heading — AND so a CV can be classified
// into a domain instead of everything being treated as technical. Canonical
// spellings; matched case-insensitively. Overlap between domains is fine (Excel
// is both data and finance); the classifier weighs the totals.
const SKILL_DOMAINS = {
  tech: [
    'JavaScript', 'TypeScript', 'Angular', 'AngularJS', 'React', 'React Native', 'Vue', 'Vue.js', 'Svelte', 'Next.js', 'Nuxt', 'Node.js', 'Express', 'NestJS', 'Deno',
    'RxJS', 'NgRx', 'Redux', 'MobX', 'Zustand', 'jQuery', 'HTML5', 'HTML', 'CSS3', 'CSS', 'SCSS', 'SASS', 'LESS', 'Tailwind', 'Tailwind CSS', 'Bootstrap', 'Material UI', 'Styled Components',
    'Webpack', 'Vite', 'Rollup', 'Babel', 'ESLint', 'Prettier', 'Storybook', 'Nx',
    'Jest', 'Vitest', 'Cypress', 'Playwright', 'Mocha', 'Chai', 'Jasmine', 'Karma', 'Testing Library', 'TDD', 'BDD', 'Unit Testing', 'Selenium', 'Appium',
    'Git', 'GitHub', 'GitLab', 'Bitbucket', 'CI/CD', 'Jenkins', 'GitHub Actions', 'Docker', 'Kubernetes', 'Terraform', 'Nginx', 'Ansible',
    'AWS', 'Azure', 'GCP', 'Firebase', 'Vercel', 'Netlify', 'Serverless',
    'REST', 'REST APIs', 'RESTful APIs', 'GraphQL', 'gRPC', 'WebSocket', 'WebSockets', 'WebRTC', 'JSON', 'XML', 'OAuth', 'JWT',
    'Java', 'Spring', 'Spring Boot', 'Hibernate', 'Kotlin', 'Python', 'Django', 'Flask', 'FastAPI', 'C#', '.NET', 'ASP.NET', 'PHP', 'Laravel', 'Ruby', 'Rails', 'Go', 'Golang', 'Rust', 'Scala', 'Swift', 'Objective-C', 'C++', 'C',
    'Accessibility', 'WCAG', 'Responsive Design', 'Micro Frontends', 'PWA', 'Performance Optimization', 'SSR', 'Web Components', 'i18n',
  ],
  data: [
    'SQL', 'MySQL', 'PostgreSQL', 'SQLite', 'MongoDB', 'Redis', 'Elasticsearch', 'DynamoDB', 'Oracle', 'Cassandra', 'Snowflake', 'BigQuery', 'Redshift',
    'Python', 'R', 'Pandas', 'NumPy', 'Spark', 'Hadoop', 'Airflow', 'dbt', 'ETL', 'Data Warehousing',
    'Tableau', 'Power BI', 'Looker', 'Excel', 'Data Analysis', 'Data Visualization', 'Statistics', 'A/B Testing',
    'Machine Learning', 'Deep Learning', 'TensorFlow', 'PyTorch', 'scikit-learn', 'NLP', 'Data Modeling',
  ],
  design: [
    'Figma', 'Sketch', 'Adobe XD', 'Photoshop', 'Illustrator', 'InDesign', 'After Effects', 'Framer', 'InVision', 'Zeplin',
    'UI Design', 'UX Design', 'UI/UX', 'Wireframing', 'Prototyping', 'User Research', 'Usability Testing', 'Design Systems',
    'Typography', 'Interaction Design', 'Visual Design', 'Motion Design', 'Branding', 'Accessibility',
  ],
  product: [
    'Product Management', 'Product Strategy', 'Roadmap', 'Roadmapping', 'Agile', 'Scrum', 'Kanban', 'Scrum Master',
    'Jira', 'Confluence', 'Trello', 'Asana', 'Monday.com', 'Notion', 'Stakeholder Management', 'User Stories', 'Backlog',
    'Prioritization', 'Project Management', 'PMP', 'Risk Management', 'Go-to-Market', 'PRD', 'Product Analytics',
  ],
  sales: [
    'Lead Generation', 'Prospecting', 'Cold Calling', 'Cold Outreach', 'CRM', 'Salesforce', 'HubSpot', 'Pipeline Management',
    'Account Management', 'Key Account Management', 'Negotiation', 'Closing', 'Upselling', 'Cross-selling', 'B2B', 'B2C',
    'Business Development', 'Territory Management', 'Quota Attainment', 'Revenue Growth', 'Client Relationship Management', 'Lead Qualification', 'Solution Selling',
  ],
  marketing: [
    'Digital Marketing', 'SEO', 'SEM', 'Google Ads', 'Google Analytics', 'Content Marketing', 'Content Strategy', 'Email Marketing',
    'Social Media Marketing', 'Social Media', 'Campaign Management', 'Brand Management', 'Copywriting', 'Market Research', 'PPC',
    'Marketing Automation', 'Mailchimp', 'Marketo', 'HubSpot', 'Canva', 'Influencer Marketing', 'Growth Marketing', 'Public Relations',
  ],
  hr: [
    'Recruitment', 'Recruiting', 'Talent Acquisition', 'Sourcing', 'Onboarding', 'Employee Relations', 'Employee Engagement',
    'HRIS', 'Payroll', 'Performance Management', 'Benefits Administration', 'Workday', 'SuccessFactors', 'BambooHR',
    'Compensation', 'HR Operations', 'Training & Development', 'Learning & Development', 'Succession Planning', 'Workforce Planning', 'Grievance Handling',
  ],
  finance: [
    'Accounting', 'Bookkeeping', 'Financial Analysis', 'Financial Reporting', 'Budgeting', 'Forecasting', 'GAAP', 'IFRS',
    'Reconciliation', 'Accounts Payable', 'Accounts Receivable', 'Auditing', 'Internal Audit', 'Taxation', 'Tax Planning',
    'QuickBooks', 'Tally', 'SAP FICO', 'Financial Modeling', 'Variance Analysis', 'Cost Accounting', 'Treasury', 'Invoicing',
  ],
  operations: [
    'Operations Management', 'Supply Chain', 'Logistics', 'Inventory Management', 'Procurement', 'Vendor Management',
    'Process Improvement', 'Six Sigma', 'Lean', 'Warehouse Management', 'Fulfillment', 'Demand Planning', 'SOP',
    'Operational Excellence', 'ERP', 'Scheduling', 'Continuous Improvement',
  ],
  support: [
    'Customer Support', 'Customer Service', 'Customer Success', 'Technical Support', 'Help Desk', 'Zendesk', 'Freshdesk',
    'Intercom', 'Ticketing', 'SLA Management', 'Escalation Management', 'Customer Retention', 'Call Center', 'Live Chat', 'Troubleshooting',
  ],
};

// Role/title words that hint at a domain, weighted more heavily than a lone skill
// mention because a job title is a strong signal of what someone actually does.
const DOMAIN_KEYWORDS = {
  tech: ['developer', 'engineer', 'programmer', 'software', 'sde', 'full stack', 'full-stack', 'frontend', 'front-end', 'backend', 'back-end', 'devops', 'architect', 'web', 'mobile', 'qa', 'sdet'],
  data: ['data analyst', 'data scientist', 'data engineer', 'analytics', 'business intelligence', 'bi developer', 'machine learning', 'ml engineer'],
  design: ['designer', 'ux', 'ui', 'product designer', 'graphic', 'visual designer', 'creative'],
  product: ['product manager', 'product owner', 'scrum master', 'project manager', 'program manager', 'delivery manager', 'product lead'],
  sales: ['sales', 'account executive', 'business development', 'bdm', 'inside sales', 'sales executive', 'relationship manager', 'account manager'],
  marketing: ['marketing', 'growth', 'brand manager', 'content', 'social media', 'seo specialist', 'digital marketer'],
  hr: ['hr', 'human resources', 'recruiter', 'talent', 'people operations', 'hrbp', 'hr manager'],
  finance: ['finance', 'accountant', 'accounting', 'financial', 'auditor', 'tax', 'bookkeeper', 'controller', 'analyst'],
  operations: ['operations', 'supply chain', 'logistics', 'procurement', 'warehouse', 'ops manager'],
  support: ['customer support', 'customer success', 'customer service', 'help desk', 'service desk', 'support engineer', 'support specialist'],
};

const DOMAIN_SCANNERS = Object.fromEntries(
  Object.entries(SKILL_DOMAINS).map(([domain, skills]) => [
    domain,
    skills.map((s) => [s, new RegExp(`(?<![\\w])${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w])`, 'i')]),
  ]),
);

/**
 * Classify the CV into a domain and return the skills to inject from the text.
 * Scoring: one point per distinct skill a domain matches anywhere, plus two per
 * role-keyword hit in the headline/titles (a strong signal). The top domain is
 * the category; scanned skills are injected ONLY from domains that are clearly
 * present, so a sales or HR CV is never tagged with developer skills just because
 * it mentions a tool in passing.
 */
function classifyCv(fullText, roleText) {
  const matched = {};   // domain -> [skills found in the whole text]
  const score = {};     // domain -> weighted score
  for (const [domain, scanners] of Object.entries(DOMAIN_SCANNERS)) {
    const found = [];
    for (const [skill, re] of scanners) if (re.test(fullText)) found.push(skill);
    matched[domain] = found;
    score[domain] = found.length;
  }
  const role = String(roleText || '').toLowerCase();
  for (const [domain, words] of Object.entries(DOMAIN_KEYWORDS)) {
    for (const w of words) if (role.includes(w)) score[domain] += 2;
  }
  const ranked = Object.keys(SKILL_DOMAINS).sort((a, b) => score[b] - score[a]);
  const top = ranked[0];
  const topScore = score[top] || 0;
  if (topScore === 0) return { category: '', skills: [] };
  // Domains that are genuinely present: at least 2 points and at least half the
  // leader. Inject scanned skills only from those.
  const threshold = Math.max(2, Math.ceil(topScore / 2));
  const active = ranked.filter((d) => score[d] >= threshold);
  const skills = [];
  for (const d of active) for (const s of matched[d]) skills.push(s);
  return { category: top, skills };
}

/** Merge extracted + scanned skills, case-insensitively, keeping the first spelling. */
function mergeSkills(primary, extra) {
  const seen = new Set(primary.map((s) => s.toLowerCase()));
  const out = [...primary];
  for (const s of extra) {
    const k = s.toLowerCase();
    if (!seen.has(k)) { seen.add(k); out.push(s); }
  }
  return out.slice(0, 40);
}

function extractSkills(lines) {
  // 1) a heading with the list on the SAME line: "Core Technologies: Angular, React"
  for (const raw of lines) {
    const m = raw.trim().match(SKILLS_INLINE_RE);
    if (m && m[1]) {
      const inline = dedupe(splitSkills(m[1])).slice(0, 40);
      if (inline.length) return inline;
    }
  }
  // 2) a heading with the list on the lines beneath it
  const block = sectionLines(lines, SKILLS_HEAD_RE).join('\n').trim();
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

/**
 * Split an experience section into one block per role. Many exports (especially
 * DOCX) have no blank line between jobs, so also start a new block at a dated
 * header line once the current block already carries a date — this recovers
 * multiple roles that would otherwise be merged into one.
 */
function experienceBlocks(lines) {
  const blocks = [];
  let cur = [];
  const flush = () => { if (cur.length) { blocks.push(cur); cur = []; } };
  const dated = (l) => YEAR_RE.test(l) || /\b(present|current)\b/i.test(l);
  for (const raw of lines) {
    const line = raw.trim();
    if (line === '') { flush(); continue; }
    const nonBullet = !BULLET_RE.test(line) && !/^[a-z]/.test(line) && line.length <= 100;
    const hasDate = cur.some(dated);
    // Start a new role when: a dated header appears after we already have a date,
    // OR a non-bullet line follows the previous role's bullet list.
    const newDated = nonBullet && dated(line) && hasDate;
    const afterBullets = nonBullet && hasDate && cur.length > 0 && BULLET_RE.test(cur[cur.length - 1]);
    if (newDated || afterBullets) flush();
    cur.push(line);
  }
  flush();
  return blocks;
}

function extractExperience(lines) {
  const block = sectionLines(lines, new RegExp(`^(?:${EXP_HEAD})\\b`, 'i'));
  const out = [];
  for (const b of experienceBlocks(block)) {
    if (!b.length) continue;
    const head = b[0];
    // The dates may sit on the title line or on the line just below it.
    const dateLine = (YEAR_RE.test(head) || /present|current/i.test(head)) ? head
      : (b[1] && (YEAR_RE.test(b[1]) || /present|current/i.test(b[1]))) ? b[1] : head;
    const yrs = dateLine.match(new RegExp(YEAR_RE.source, 'g')) || [];
    const seg = head.split(/\s[-–|@]\s|,\s/).map((x) => x.trim()).filter(Boolean);
    const title = (seg[0] ?? head).slice(0, 120);
    let company = seg[1] ?? '';
    // If the dates live on line 2, that line isn't description.
    let descStart = dateLine === b[1] ? 2 : 1;
    if (!company && dateLine === b[1]) {
      // title on line 1, "Company … dates" on line 2 → strip the date tail off line 2
      company = b[1]
        .replace(new RegExp(`[-–|,(]?\\s*(?:${YEAR_RE.source}|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[^]*$`, 'i'), '')
        .replace(/\b(present|current)\b.*$/i, '').replace(/[-–|,(]\s*$/, '').trim().slice(0, 120);
    } else if (!company && b[1] && !YEAR_RE.test(b[1]) && !BULLET_RE.test(b[1])) {
      company = b[1].slice(0, 120);
      descStart = 2;
    }
    out.push({
      title,
      company: company.slice(0, 120),
      start: yrs[0] ?? '',
      end: yrs[1] ?? (/present|current/i.test(dateLine) ? 'Present' : ''),
      description: b.slice(descStart).join(' ').slice(0, 1000),
    });
    if (out.length >= 12) break;
  }
  return out;
}

function extractEducation(lines) {
  const block = sectionLines(lines, new RegExp(`^(?:${EDU_HEAD})\\b`, 'i'));
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

  let summary = extractSummary(lines);
  // Fallback: no "Summary" heading, but a substantial paragraph sits up top before
  // the first section — treat that as the summary so the section still renders.
  if (!summary) summary = firstParagraphSummary(nonEmpty, name, headline);
  const experience = extractExperience(lines);
  const education = extractEducation(lines);

  // Classify the CV's domain from the headline, role titles and full text, then
  // take skills from a dedicated section PLUS any well-known skills mentioned
  // anywhere — but only from the detected domain(s), so a sales/HR/finance CV is
  // never force-fitted with developer skills.
  const roleText = [headline, ...experience.map((e) => e.title)].join(' ');
  const { category, skills: scanned } = classifyCv(clean, roleText);
  const skills = mergeSkills(extractSkills(lines), scanned);

  const textFound = nonEmpty.length > 2;
  const lowConfidence = !textFound || (!email && !name && skills.length === 0);

  return { name, email, phone, location, headline, summary, skills, experience, education, category, lowConfidence };
}

/** Convenience: bytes → parsed resume fields. */
export function parseCv(buf, contentType) {
  return parseResume(extractText(buf, contentType));
}
