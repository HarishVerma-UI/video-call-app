// Job fit analysis: compares a job (its skill tags AND the skills named in its
// description / requirements) with the viewer's current profile (skills list,
// headline, bio, focus areas and work experience). Runs on the client so the
// score updates the moment the profile changes.
import type { Experience, Job, JobExperience, Profile } from './api';

/** Alias → canonical skill key. Keys and values are lowercase. */
const ALIASES: Record<string, string> = {
  js: 'javascript', es6: 'javascript', ecmascript: 'javascript',
  ts: 'typescript',
  'react.js': 'react', reactjs: 'react',
  'angular 2+': 'angular', 'angular2': 'angular',
  'vue.js': 'vue', vuejs: 'vue',
  'next.js': 'nextjs', next: 'nextjs',
  node: 'node.js', nodejs: 'node.js',
  'express.js': 'express', expressjs: 'express',
  k8s: 'kubernetes',
  postgres: 'postgresql',
  mongo: 'mongodb',
  'amazon web services': 'aws',
  'google cloud': 'gcp', 'google cloud platform': 'gcp',
  'microsoft azure': 'azure',
  cicd: 'ci/cd', 'ci cd': 'ci/cd',
  restful: 'rest', 'rest api': 'rest', 'rest apis': 'rest',
  html5: 'html', css3: 'css', sass: 'scss',
  'golang': 'go',
  'ml': 'machine learning', 'dl': 'deep learning',
  'nlp': 'natural language processing',
  'ux design': 'ux', 'ui design': 'ui',
  'ms excel': 'excel', 'microsoft excel': 'excel',
  'people management': 'team leadership', 'team lead': 'team leadership',
};

/** Skills we look for in free text (job descriptions and the viewer's experience). */
const VOCAB = [
  'javascript', 'typescript', 'react', 'angular', 'vue', 'nextjs', 'svelte', 'redux', 'ngrx', 'rxjs',
  'html', 'css', 'scss', 'tailwind', 'webpack', 'vite', 'storybook', 'jest', 'cypress', 'playwright',
  'node.js', 'express', 'nestjs', 'graphql', 'rest', 'microservices',
  'python', 'django', 'flask', 'fastapi', 'java', 'spring', 'kotlin', 'swift', 'go', 'rust', 'c#', '.net', 'c++', 'php', 'laravel', 'ruby', 'rails',
  'sql', 'postgresql', 'mysql', 'mongodb', 'redis', 'elasticsearch', 'kafka',
  'aws', 'azure', 'gcp', 'docker', 'kubernetes', 'terraform', 'ci/cd', 'jenkins', 'git', 'linux',
  'machine learning', 'deep learning', 'natural language processing', 'pytorch', 'tensorflow', 'pandas', 'data analysis', 'power bi', 'tableau', 'excel',
  'figma', 'ux', 'ui', 'accessibility', 'agile', 'scrum', 'jira',
  'android', 'ios', 'react native', 'flutter',
  'seo', 'content marketing', 'sales', 'customer success', 'recruiting', 'accounting', 'project management', 'product management',
  'team leadership', 'communication', 'stakeholder management', 'mentoring',
];

const DISPLAY: Record<string, string> = {
  javascript: 'JavaScript', typescript: 'TypeScript', nextjs: 'Next.js', 'node.js': 'Node.js', rxjs: 'RxJS', ngrx: 'NgRx',
  html: 'HTML', css: 'CSS', scss: 'SCSS', graphql: 'GraphQL', rest: 'REST APIs', sql: 'SQL', postgresql: 'PostgreSQL', mysql: 'MySQL',
  mongodb: 'MongoDB', aws: 'AWS', gcp: 'GCP', 'ci/cd': 'CI/CD', 'c#': 'C#', '.net': '.NET', 'c++': 'C++', php: 'PHP', ux: 'UX', ui: 'UI',
  ios: 'iOS', seo: 'SEO', 'power bi': 'Power BI', nestjs: 'NestJS', fastapi: 'FastAPI', pytorch: 'PyTorch', tensorflow: 'TensorFlow',
};

export const canonicalSkill = (s: string): string => {
  const k = s.trim().toLowerCase().replace(/\s+/g, ' ');
  return ALIASES[k] ?? k;
};
const titleCase = (s: string) => s.replace(/\b[a-z]/g, (c) => c.toUpperCase());
const displaySkill = (key: string) => DISPLAY[key] ?? titleCase(key);

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
/** All spellings (canonical + aliases) of a skill. */
function spellings(key: string): string[] {
  return [key, ...Object.entries(ALIASES).filter(([, v]) => v === key).map(([a]) => a)];
}
const patternCache = new Map<string, RegExp>();
/** Whole-word match that also works for skills like "C++", ".NET" and "Node.js". */
function skillPattern(key: string): RegExp {
  let re = patternCache.get(key);
  if (!re) {
    re = new RegExp(`(?<![a-z0-9+#.])(?:${spellings(key).map(escape).join('|')})(?![a-z0-9+#])`, 'gi');
    patternCache.set(key, re);
  }
  re.lastIndex = 0;
  return re;
}
const countIn = (text: string, key: string) => (text.match(skillPattern(key)) ?? []).length;

const LEVEL_MIN_YEARS: Record<JobExperience, number> = { entry: 0, mid: 2, senior: 5, lead: 8 };

/** Rough total years from experience date strings ("2019", "Jan 2021", "Present"). */
export function experienceYears(items: Experience[] | undefined, now = new Date()): number | null {
  const ranges: [number, number][] = [];
  for (const x of items ?? []) {
    const start = Number((x.start ?? '').match(/(19|20)\d{2}/)?.[0]);
    if (!start) continue;
    const endText = (x.end ?? '').trim();
    const end = /present|current|now|today/i.test(endText) || !endText ? now.getFullYear() : Number(endText.match(/(19|20)\d{2}/)?.[0]);
    if (!end || end < start) continue;
    ranges.push([start, end]);
  }
  if (!ranges.length) return null;
  // Merge overlapping roles so parallel jobs aren't double-counted.
  ranges.sort((a, b) => a[0] - b[0]);
  let total = 0;
  let [cs, ce] = ranges[0];
  for (const [s, e] of ranges.slice(1)) {
    if (s <= ce) ce = Math.max(ce, e);
    else { total += ce - cs; [cs, ce] = [s, e]; }
  }
  total += ce - cs;
  return Math.max(0, total);
}

export interface JobFit {
  /**
   * Weighted % of the job's skills shown on the profile. Credit: on the skills list = 1,
   * only mentioned in headline/bio/experience = 0.5. Weight: tagged by the recruiter = 1,
   * only named in the description = 0.5. null when the job names no skills.
   */
  score: number | null;
  required: string[];
  /** On the profile's skills list. */
  matched: string[];
  /** Mentioned in headline / bio / experience, but not on the skills list. */
  partial: string[];
  /** Not on the profile at all — ordered by how much the job stresses them. */
  missing: string[];
  /** Required skills found in the job description rather than its skill tags. */
  fromDescription: string[];
  years: number | null;
  minYears: number;
  levelGap: boolean;
}

export function analyzeJobFit(
  job: Pick<Job, 'skills' | 'description' | 'requirements' | 'experience' | 'title'>,
  profile: Pick<Profile, 'skills' | 'headline' | 'focusAreas'> & { bio?: string; experience?: Experience[] } | null | undefined,
): JobFit {
  const jdText = [job.title, job.description, ...(job.requirements ?? [])].join('\n');

  // Required skills: the job's tags, plus vocabulary skills named in the description.
  const weight = new Map<string, number>();
  const tagged = new Set<string>();
  for (const s of job.skills ?? []) {
    const key = canonicalSkill(s);
    if (!key) continue;
    tagged.add(key);
    weight.set(key, (weight.get(key) ?? 0) + 2 + countIn(jdText, key));
  }
  const fromDescription: string[] = [];
  for (const key of VOCAB) {
    if (tagged.has(key)) continue;
    const n = countIn(jdText, key);
    if (n > 0) { weight.set(key, n); fromDescription.push(key); }
  }
  // Keep description-only skills from swamping the tagged ones.
  const descKeep = new Set(fromDescription.sort((a, b) => (weight.get(b) ?? 0) - (weight.get(a) ?? 0)).slice(0, 8));
  const required = [...weight.keys()].filter((k) => tagged.has(k) || descKeep.has(k));

  const have = new Set((profile?.skills ?? []).map(canonicalSkill));
  const evidence = [
    profile?.headline, profile?.bio, ...(profile?.focusAreas ?? []),
    ...(profile?.experience ?? []).flatMap((x) => [x.title, x.description]),
  ].filter(Boolean).join('\n');

  const matched: string[] = [];
  const partial: string[] = [];
  const missing: string[] = [];
  for (const key of required) {
    if (have.has(key)) matched.push(key);
    else if (evidence && countIn(evidence, key) > 0) partial.push(key);
    else missing.push(key);
  }
  missing.sort((a, b) => (weight.get(b) ?? 0) - (weight.get(a) ?? 0));

  const w = (k: string) => (tagged.has(k) ? 1 : 0.5);
  const total = required.reduce((n, k) => n + w(k), 0);
  const earned = matched.reduce((n, k) => n + w(k), 0) + partial.reduce((n, k) => n + w(k) * 0.5, 0);
  const score = total ? Math.round((earned / total) * 100) : null;
  const years = experienceYears(profile?.experience);
  const minYears = LEVEL_MIN_YEARS[job.experience] ?? 0;

  return {
    score,
    required: required.map(displaySkill),
    matched: matched.map(displaySkill),
    partial: partial.map(displaySkill),
    missing: missing.map(displaySkill),
    fromDescription: [...descKeep].map(displaySkill),
    years,
    minYears,
    levelGap: years !== null && years < minYears,
  };
}
