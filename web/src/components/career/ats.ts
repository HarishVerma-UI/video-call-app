// Real-time ATS score (0–100) for the master CV — pure and instant, so every
// screen (status bar, dashboard analyzer, generator, AI builder, booking modal)
// shows the same number the moment a skill or bullet changes.
//
//   Role keywords   35  share of the target role's keywords found (full at ~85%)
//   Skills depth    15  number of distinct skills (8+ = full)
//   Summary         15  a real 2–4 line professional summary
//   Impact          20  experience bullets with real numbers (%, ₹, counts, time)
//   Structure       10  contact details, experience and education present
//   CV file          5  a CV file uploaded and attached to the profile
import type { CvData } from './CvPaper';

export interface RoleProfile { id: string; label: string; match: RegExp; keywords: string[] }

/** Target roles and the keywords recruiters' ATS filters look for. */
export const ROLES: RoleProfile[] = [
  { id: 'fullstack', label: 'Full-Stack Developer', match: /full.?stack|mern|mean/i, keywords: ['JavaScript', 'TypeScript', 'React', 'Node.js', 'REST APIs', 'SQL', 'MongoDB', 'Git', 'Docker', 'CI/CD', 'AWS', 'Testing'] },
  { id: 'frontend', label: 'Frontend Developer', match: /front.?end|ui (developer|engineer)|angular|react|web developer/i, keywords: ['JavaScript', 'TypeScript', 'React', 'Angular', 'HTML5', 'CSS3', 'Responsive Design', 'Accessibility', 'Performance', 'Git', 'Testing', 'REST APIs'] },
  { id: 'java', label: 'Java Backend Developer', match: /java|spring|back.?end/i, keywords: ['Java', 'Spring Boot', 'Microservices', 'REST APIs', 'SQL', 'Hibernate', 'Kafka', 'Docker', 'Kubernetes', 'JUnit', 'AWS', 'System Design'] },
  { id: 'data', label: 'Data Analyst', match: /data (analyst|scien)|analytics|\bbi\b/i, keywords: ['SQL', 'Excel', 'Python', 'Power BI', 'Tableau', 'Statistics', 'Data Visualization', 'Dashboards', 'A/B Testing', 'Data Cleaning'] },
  { id: 'pm', label: 'Product Manager', match: /product (manager|owner)|\bpm\b/i, keywords: ['Product Strategy', 'Roadmaps', 'User Research', 'Agile', 'Stakeholder Management', 'Analytics', 'A/B Testing', 'PRDs', 'Prioritization', 'Go-to-Market'] },
  { id: 'support', label: 'Customer Support / Call Center', match: /support|call cent|bpo|customer (service|care|success)|telecaller/i, keywords: ['Customer Service', 'CSAT', 'First Call Resolution', 'CRM', 'Zendesk', 'Salesforce', 'Active Listening', 'Escalation Handling', 'Multilingual', 'Ticketing', 'AHT', 'Empathy'] },
  { id: 'sales', label: 'Sales Executive', match: /sales|business development|account (manager|executive)/i, keywords: ['Lead Generation', 'Negotiation', 'CRM', 'Pipeline Management', 'Target Achievement', 'Client Relationship', 'Cold Calling', 'Upselling', 'Market Research', 'Presentations'] },
  { id: 'health', label: 'Nurse / Healthcare', match: /nurse|doctor|medical|clinic|health|physician/i, keywords: ['Patient Care', 'Clinical Assessment', 'Infection Control', 'EMR', 'Medication Administration', 'BLS', 'Documentation', 'Patient Safety', 'Triage', 'Compassion'] },
  { id: 'chef', label: 'Chef / Hospitality', match: /chef|cook|kitchen|hospitality|hotel|restaurant/i, keywords: ['Food Safety', 'HACCP', 'Menu Planning', 'Inventory', 'Kitchen Management', 'Food Costing', 'Team Leadership', 'Guest Service', 'Hygiene', 'Plating'] },
  { id: 'hr', label: 'HR / Talent Acquisition', match: /\bhr\b|human resources|recruit|talent/i, keywords: ['Recruitment', 'Onboarding', 'HRMS', 'Payroll', 'Employee Engagement', 'Compliance', 'Sourcing', 'Interviewing', 'Performance Management', 'Policy'] },
];

export const roleById = (id: string) => ROLES.find((r) => r.id === id) ?? ROLES[0];
/** Best-guess target role from the CV headline (then summary). */
export function detectRole(cv: Pick<CvData, 'title' | 'summary'>): RoleProfile {
  return ROLES.find((r) => r.match.test(cv.title)) ?? ROLES.find((r) => r.match.test(cv.summary)) ?? ROLES[0];
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9+#]/g, '');
/** Same-meaning spellings: "NodeJS" = "Node.js", "Customer support" ≈ "Customer Service"… */
const ALIASES: Record<string, string[]> = {
  nodejs: ['node'], reactjs: ['react'], restapis: ['rest', 'restapi', 'restfulapis', 'apis'],
  cicd: ['ci', 'continuousintegration'], customerservice: ['customersupport', 'customercare'],
  firstcallresolution: ['fcr'], aws: ['amazonwebservices'], html5: ['html'], css3: ['css'],
  springboot: ['spring'], crm: ['salesforce', 'zendesk', 'freshdesk', 'hubspot'],
};
/** Lower-case words separated by single spaces, padded — for whole-word phrase search. */
const words = (s: string) => ` ${s.toLowerCase().replace(/[^a-z0-9+#]+/g, ' ').trim()} `;
function keywordFound(keyword: string, skills: Set<string>, text: string): boolean {
  const k = norm(keyword);
  if ([k, ...(ALIASES[k] ?? [])].some((f) => skills.has(f))) return true;
  // In free text, match whole words only ("JavaScript" must not count as "Java").
  const phrases = [words(keyword), ...(ALIASES[k] ?? []).filter((a) => a.length > 2).map((a) => ` ${a} `)];
  return phrases.some((ph) => ph.trim() && text.includes(ph));
}

/** A real metric — not an AI [placeholder]. */
const METRIC = /(\d+(\.\d+)?\s?(%|x|\+|k|l|lakh|crore|cr|m|mn|million|hrs?|hours|days|weeks|months|users|customers|calls|clients|tickets|patients|covers|people|members|engineers)\b)|([₹$€£]\s?\d)|(\b\d{2,}\b)/i;
const stripPlaceholders = (s: string) => s.replace(/\[[^\]]*\]/g, '');

export interface AtsPart { id: string; label: string; got: number; max: number; tip: string }
export interface AtsResult { score: number; parts: AtsPart[]; role: RoleProfile; matched: string[]; missing: string[] }

export function atsScore(cv: CvData, opts: { hasUploadedCV: boolean; role?: RoleProfile }): AtsResult {
  const role = opts.role ?? detectRole(cv);
  const skillSet = new Set(cv.skills.map(norm).filter(Boolean));
  const text = words([cv.title, cv.summary, ...cv.experience.flatMap((e) => [e.title, e.description ?? ''])].join(' '));
  const matched = role.keywords.filter((k) => keywordFound(k, skillSet, text));
  const missing = role.keywords.filter((k) => !matched.includes(k));

  // Full marks at ~85% coverage — every extra matched keyword visibly moves the score.
  const keywordPts = Math.round(35 * Math.min(1, matched.length / Math.max(1, Math.round(role.keywords.length * 0.85))));
  const skillPts = Math.round(15 * Math.min(1, skillSet.size / 8));
  const sumLen = cv.summary.trim().length;
  const summaryPts = sumLen >= 150 ? 15 : sumLen >= 80 ? 10 : sumLen >= 30 ? 5 : 0;
  const bullets = cv.experience.flatMap((e) => (e.description ?? '').split('\n').map((b) => b.replace(/^[•\-*]\s*/, '').trim()).filter(Boolean));
  const quantified = bullets.filter((b) => METRIC.test(stripPlaceholders(b))).length;
  const impactPts = !bullets.length ? 0 : Math.round(20 * Math.min(1, quantified / Math.min(4, Math.max(2, Math.ceil(bullets.length / 2)))));
  const structurePts = (cv.name && (cv.email || cv.phone) ? 3 : 0) + (cv.experience.some((e) => e.title || e.company) ? 4 : 0) + (cv.education.some((e) => e.degree || e.school) ? 3 : 0);
  const filePts = opts.hasUploadedCV ? 5 : 0;

  const parts: AtsPart[] = [
    { id: 'keywords', label: `${role.label} keywords`, got: keywordPts, max: 35, tip: missing.length ? `Add: ${missing.slice(0, 3).join(', ')}` : 'All key terms covered' },
    { id: 'skills', label: 'Skills depth', got: skillPts, max: 15, tip: skillSet.size >= 8 ? `${skillSet.size} skills` : `${skillSet.size} skills, aim for 8+` },
    { id: 'summary', label: 'Professional summary', got: summaryPts, max: 15, tip: summaryPts === 15 ? 'Strong summary' : 'Write 2–3 lines on role, years and strengths' },
    { id: 'impact', label: 'Quantified impact', got: impactPts, max: 20, tip: bullets.length ? `${quantified} of ${bullets.length} bullets have real numbers` : 'Add experience bullets with results' },
    { id: 'structure', label: 'Structure & contact', got: structurePts, max: 10, tip: structurePts === 10 ? 'Contact, experience, education ✓' : 'Add contact, experience and education' },
    { id: 'file', label: 'CV file attached', got: filePts, max: 5, tip: opts.hasUploadedCV ? 'Attached to your profile' : 'Upload your CV file' },
  ];
  return { score: Math.min(100, parts.reduce((a, p) => a + p.got, 0)), parts, role, matched, missing };
}

export const atsTone = (score: number) => (score >= 70 ? 'good' : score >= 50 ? 'warn' : 'crit');
