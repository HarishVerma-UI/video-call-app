// Huddle public landing site (/, /for-job-seekers, /for-recruiters, /public-cv-link).
// Content and design come from the marketing prototype; wired into the app:
//   • each page is a real URL (crawlable links, back/forward work, per-page SEO meta)
//   • "Sign in" → /login, sign-up CTAs and the Get started form → /register (prefilled)
//   • prerendered to static HTML at build time (see vite.config.ts) for search engines
// Styling: Tailwind utilities scoped to this file (landing.css), root class "hl".
import { useState, useEffect, useMemo } from 'react';
import { LANDING_ROUTES, applyRouteMeta, pathForRoute, routeFromPath } from './routes';
import { Aperture } from '../Aperture';
import './landing.css';

// ============================================================================
// SELF-CONTAINED SVG ICON FACTORY (Zero external dependency friction)
// ============================================================================
const createIcon = (paths, viewBox = '0 0 24 24') => {
  return function IconComponent({ className = 'w-4 h-4', ...props }) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox={viewBox}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        aria-hidden="true"
        {...props}
      >
        {paths}
      </svg>
    );
  };
};

const Sparkles = createIcon(
  <>
    <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z" />
    <path d="M5 3v4" />
    <path d="M3 5h4" />
  </>
);
const Radar = createIcon(
  <>
    <path d="M19.07 4.93A10 10 0 0 0 6.99 3.34" />
    <path d="M4 6h.01" />
    <path d="M2.29 9.62A10 10 0 1 0 21.31 8.35" />
    <path d="M16.24 7.76A6 6 0 1 0 8.23 16.67" />
    <path d="M12 18h.01" />
    <path d="M17.99 11.66A6 6 0 0 1 15.77 16.67" />
    <circle cx="12" cy="12" r="2" />
    <path d="m13.41 10.59 5.66-5.66" />
  </>
);
const CheckCircle2 = createIcon(
  <>
    <circle cx="12" cy="12" r="10" />
    <path d="m9 12 2 2 4-4" />
  </>
);
const Check = createIcon(<path d="M20 6 9 17l-5-5" />);
const X = createIcon(
  <>
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </>
);
const UploadCloud = createIcon(
  <>
    <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
    <path d="M12 12v9" />
    <path d="m16 16-4-4-4 4" />
  </>
);
const RefreshCw = createIcon(
  <>
    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
    <path d="M21 3v5h-5" />
    <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
    <path d="M8 16H3v5" />
  </>
);
const ArrowUpRight = createIcon(
  <>
    <path d="M7 17 17 7" />
    <path d="M7 7h10v10" />
  </>
);
const ArrowRight = createIcon(
  <>
    <path d="M5 12h14" />
    <path d="m12 5 7 7-7 7" />
  </>
);
const FileText = createIcon(
  <>
    <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
    <path d="M14 2v4a2 2 0 0 0 2 2h4" />
    <path d="M10 9H8" />
    <path d="M16 13H8" />
    <path d="M16 17H8" />
  </>
);
const Briefcase = createIcon(
  <>
    <rect width="20" height="14" x="2" y="7" rx="2" ry="2" />
    <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
  </>
);
const Wand2 = createIcon(
  <>
    <path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.21 1.21 0 0 0 1.72 0L21.64 5.36a1.21 1.21 0 0 0 0-1.72Z" />
    <path d="m14 7 3 3" />
  </>
);
const CalendarIcon = createIcon(
  <>
    <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
    <line x1="16" x2="16" y1="2" y2="6" />
    <line x1="8" x2="8" y1="2" y2="6" />
    <line x1="3" x2="21" y1="10" y2="10" />
  </>
);
const ShieldCheck = createIcon(
  <>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
    <path d="m9 12 2 2 4-4" />
  </>
);
const Lock = createIcon(
  <>
    <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </>
);
const Video = createIcon(
  <>
    <path d="m22 8-6 4 6 4V8Z" />
    <rect width="14" height="12" x="2" y="6" rx="2" ry="2" />
  </>
);
const Mic = createIcon(
  <>
    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" x2="12" y1="19" y2="22" />
  </>
);
const MicOff = createIcon(
  <>
    <line x1="2" x2="22" y1="2" y2="22" />
    <path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2" />
    <path d="M5 10v2a7 7 0 0 0 12 5" />
    <path d="M15 9.34V5a3 3 0 0 0-5.68-1.33" />
    <path d="M9 9v3a3 3 0 0 0 5.12 2.12" />
    <line x1="12" x2="12" y1="19" y2="22" />
  </>
);
const Link2 = createIcon(
  <>
    <path d="M9 17H7A5 5 0 0 1 7 7h2" />
    <path d="M15 7h2a5 5 0 1 1 0 10h-2" />
    <line x1="8" x2="16" y1="12" y2="12" />
  </>
);
const Copy = createIcon(
  <>
    <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
    <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
  </>
);
const Download = createIcon(
  <>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" x2="12" y1="15" y2="3" />
  </>
);
const Sun = createIcon(
  <>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2" />
    <path d="M12 20v2" />
    <path d="m4.93 4.93 1.41 1.41" />
    <path d="m17.66 17.66 1.41 1.41" />
    <path d="M2 12h2" />
    <path d="M20 12h2" />
    <path d="m6.34 17.66-1.41 1.41" />
    <path d="m19.07 4.93-1.41 1.41" />
  </>
);
const Moon = createIcon(
  <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
);
const Globe = createIcon(
  <>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
    <path d="M2 12h20" />
  </>
);
const Users = createIcon(
  <>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </>
);
const ChevronDown = createIcon(<path d="m6 9 6 6 6-6" />);
const Plus = createIcon(
  <>
    <path d="M5 12h14" />
    <path d="M12 5v14" />
  </>
);
const Bot = createIcon(
  <>
    <path d="M12 8V4H8" />
    <rect width="16" height="12" x="4" y="8" rx="2" />
    <path d="M2 14h2" />
    <path d="M20 14h2" />
    <path d="M15 13v2" />
    <path d="M9 13v2" />
  </>
);
const Menu = createIcon(
  <>
    <line x1="4" x2="20" y1="12" y2="12" />
    <line x1="4" x2="20" y1="6" y2="6" />
    <line x1="4" x2="20" y1="18" y2="18" />
  </>
);
const PhoneCall = createIcon(
  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
);
const Layers = createIcon(
  <>
    <path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z" />
    <path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65" />
    <path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65" />
  </>
);
const MessageCircle = createIcon(
  <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
);
const Heart = createIcon(
  <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
);
const Send = createIcon(
  <>
    <path d="m22 2-7 20-4-9-9-4Z" />
    <path d="M22 2 11 13" />
  </>
);

// ============================================================================
// CONSTANTS & FACTUAL PRODUCT DATA (Strictly grounded in Huddle spec)
// ============================================================================
const APP_URL = '/login';
const RECRUITER_LOGIN_URL = '/login?as=recruiter';

const OPTICAL_SCAN_STEPS = [
  { id: 0, label: 'Parsing document', detail: 'Reading PDF, DOC, DOCX or TXT structure' },
  { id: 1, label: 'Extracting skills', detail: 'Mapping skills without overwriting your edits' },
  { id: 2, label: 'Benchmarking ATS keywords', detail: 'Scoring role alignment (0–100)' },
  { id: 3, label: 'Syncing profile & jobs', detail: 'Updating jobs, applications & public link' },
];

const JOB_SEEKER_STEPS = [
  {
    num: '01',
    title: 'Upload or build with AI',
    desc: 'Drop a PDF, DOC, DOCX, or TXT, or answer 3 quick questions in chat. Huddle fills your profile automatically and never overwrites anything you typed yourself.',
    icon: UploadCloud,
  },
  {
    num: '02',
    title: 'See your ATS score and fix gaps',
    desc: 'Watch your 0–100 ATS score update live as you tap missing keyword chips. No guesswork before you apply.',
    icon: Radar,
  },
  {
    num: '03',
    title: 'Apply with a ready profile',
    desc: 'Once your profile reaches 70% readiness with a CV attached, apply in one click. Recruiters receive a clean, structured profile.',
    icon: CheckCircle2,
  },
  {
    num: '04',
    title: 'Get a video call from the recruiter',
    desc: 'Talk face to face inside Huddle right in your browser, no downloads, no external meeting links to copy, works on phones.',
    icon: Video,
  },
];

const RECRUITER_STEPS = [
  {
    num: '01',
    title: 'Post a job in minutes',
    desc: 'Add title, required skills, salary range, work mode, and experience, or use bulk JSON import with automatic duplicate filtering.',
    icon: Briefcase,
  },
  {
    num: '02',
    title: 'Receive complete, scored candidates',
    desc: 'Every applicant clears the 70% readiness and CV requirement first. No messy attachments or chasing missing details.',
    icon: ShieldCheck,
  },
  {
    num: '03',
    title: 'Shortlist in one click',
    desc: 'Move candidates across your hiring funnel (jobs posted → applicants → shortlisted → not selected) while candidates see live status.',
    icon: CheckCircle2,
  },
  {
    num: '04',
    title: 'Talk face to face instantly',
    desc: 'Start an in-browser audio or video call directly from the candidate screen, no scheduling links or third-party meeting apps.',
    icon: Video,
  },
];

const AI_BUILDER_PROFILES = {
  bpo: {
    id: 'bpo',
    label: 'Customer support / BPO',
    aiQuestion: 'What kind of customer calls or tickets do you handle most days?',
    chips: [
      'Handled inbound calls',
      'Resolved customer queries',
      'Used CRM tools',
    ],
    name: 'Priya Nair',
    role: 'Customer Support & BPO Specialist',
    summary:
      'Empathetic customer support specialist experienced in handling inbound inquiries, resolving billing and service queries, and logging accurate updates in CRM tools.',
    bullets: {
      'Handled inbound calls':
        'Handled [X calls/day] inbound customer calls with clear communication and calm issue resolution.',
      'Resolved customer queries':
        'Resolved customer billing and order queries on first contact, maintaining [X%] CSAT.',
      'Used CRM tools':
        'Logged all customer interactions and follow-ups in [CRM tool name] with accurate ticket notes.',
    },
  },
  healthcare: {
    id: 'healthcare',
    label: 'Healthcare & nursing',
    aiQuestion: 'Which ward, clinic, or patient-care duties do you handle?',
    chips: [
      'Patient triage & vitals',
      'Electronic health records',
      'Discharge & family care',
    ],
    name: 'Anjali Menon, RN',
    role: 'Staff Nurse & Patient Care Coordinator',
    summary:
      'Dedicated clinical nurse experienced in patient triage, accurate electronic health record documentation, and coordinated ward care.',
    bullets: {
      'Patient triage & vitals':
        'Monitored vitals and coordinated triage care for [X patients/shift] across outpatient and ward units.',
      'Electronic health records':
        'Documented medication administration and clinical charts accurately in [EHR system].',
      'Discharge & family care':
        'Guided patients and families through post-discharge medication and follow-up schedules.',
    },
  },
  hospitality: {
    id: 'hospitality',
    label: 'Hospitality & chefs',
    aiQuestion: 'Which kitchen section or guest service area do you run?',
    chips: [
      'Line prep & plating',
      'Food hygiene & safety',
      'Guest service & orders',
    ],
    name: 'Vikram Rathore',
    role: 'Demi Chef de Partie • Kitchen Operations',
    summary:
      'Disciplined culinary professional skilled in high-volume kitchen prep, consistent plating standards, and strict food safety compliance.',
    bullets: {
      'Line prep & plating':
        'Prepared and plated [X covers/shift] across hot and cold sections during peak dining service.',
      'Food hygiene & safety':
        'Maintained daily temperature logs, stock rotation, and [HACCP / FSSAI] hygiene standards.',
      'Guest service & orders':
        'Coordinated with front-of-house staff to accommodate dietary requests without service delays.',
    },
  },
  engineering: {
    id: 'engineering',
    label: 'Software engineering',
    aiQuestion: 'What stack do you build with and what did you ship recently?',
    chips: [
      'Built REST APIs & services',
      'Improved page load speed',
      'Wrote automated tests',
    ],
    name: 'Rohan Kulkarni',
    role: 'Full-Stack Software Engineer',
    summary:
      'Full-stack software engineer experienced in building reliable web applications, clean REST APIs, and automated test suites.',
    bullets: {
      'Built REST APIs & services':
        'Designed and shipped REST APIs in [Node.js / Java] serving [X requests/day].',
      'Improved page load speed':
        'Reduced front-end bundle size and improved page load time by [X%] across core user flows.',
      'Wrote automated tests':
        'Added unit and integration test coverage across critical checkout and profile modules.',
    },
  },
};

const PROFESSIONS_GRID = [
  {
    title: 'Call centre & BPO',
    keywords: ['CSAT', 'First-call resolution', 'CRM tools'],
  },
  {
    title: 'Healthcare',
    keywords: ['Patient triage', 'Clinical protocols', 'EHR documentation'],
  },
  {
    title: 'Hospitality & chefs',
    keywords: ['Food safety & HACCP', 'Kitchen prep', 'Guest relations'],
  },
  {
    title: 'Retail & sales',
    keywords: ['Customer retention', 'POS & inventory', 'Lead follow-up'],
  },
  {
    title: 'HR',
    keywords: ['Candidate screening', 'Interview scheduling', 'Onboarding'],
  },
  {
    title: 'Freshers',
    keywords: ['Academic projects', 'Internships', 'Communication'],
  },
  {
    title: 'Engineering',
    keywords: ['TypeScript & React', 'REST APIs', 'System reliability'],
  },
];

const INITIAL_COMMUNITY_POSTS = [
  {
    id: 'post-recruiter',
    persona: 'Recruiter',
    badgeClass: 'bg-[#EEF2FF] text-[#4F46E5] border-[#C7D2FE]',
    author: 'Meera Nair',
    initials: 'MN',
    role: 'Talent Partner • Product & Cloud Hiring',
    time: '2 hours ago',
    topic: 'Hiring & Opinions',
    content:
      'Unpopular opinion: A clear 1-page CV with real numbers beats a 4-page buzzword document every single time. When candidates show their ATS match and real project outcomes upfront, we jump straight to a 10-minute face-to-face call.',
    likes: 18,
    liked: false,
    replies: 4,
  },
  {
    id: 'post-learner',
    persona: 'Learner',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
    author: 'Karthik Reddy',
    initials: 'KR',
    role: 'B.Com Graduate • Learning CRM & Customer Operations',
    time: '5 hours ago',
    topic: 'Learning in Public',
    content:
      'Completed my first mock customer-handling sprint today and updated my Huddle profile skills. Would love feedback from support leads here on what hiring managers look for in freshers!',
    likes: 12,
    liked: true,
    replies: 3,
  },
  {
    id: 'post-seeker',
    persona: 'Job Seeker',
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    author: 'Rohan Kulkarni',
    initials: 'RK',
    role: 'Full-Stack Software Engineer',
    time: 'Yesterday',
    topic: 'Career Journey',
    content:
      'Sharing one honest lesson from my job search: tailoring my summary for each role and fixing missing keywords raised my callback rate immediately. Happy to connect and review CVs with fellow builders here.',
    likes: 24,
    liked: false,
    replies: 6,
  },
];

const SCAN_TO_JOB_MILESTONES = [
  {
    id: 'scan',
    stage: 'Stage 1',
    badge: 'Optical Scan',
    title: 'CV Scanned & Parsed',
    score: 54,
    readiness: 48,
    seekerProblem: 'Re-typing your CV on every job board while wondering if files parse cleanly.',
    recruiterProblem: 'Receiving messy attachments with missing details and unparsed skills.',
    huddleBridge: 'Upload PDF, DOC, DOCX, or TXT once, Huddle extracts skills without overwriting your edits.',
    verifiedArtifact: 'Structured profile & extracted skill graph ready',
    icon: UploadCloud,
  },
  {
    id: 'ats-fix',
    stage: 'Stage 2',
    badge: 'Gap Fix',
    title: 'ATS Score & Gaps Fixed',
    score: 76,
    readiness: 68,
    seekerProblem: 'Applying blindly without knowing which role keywords your CV is missing.',
    recruiterProblem: 'Sifting through applicants who miss key role requirements.',
    huddleBridge: 'Tap missing keyword chips to raise your 0–100 ATS score and use honest [placeholders] for metrics.',
    verifiedArtifact: 'Role keywords aligned & bullet gaps closed',
    icon: Radar,
  },
  {
    id: 'verified',
    stage: 'Stage 3',
    badge: '70% Verified',
    title: 'Profile Verified (70%+)',
    score: 84,
    readiness: 82,
    seekerProblem: 'Your application gets buried because your profile looks incomplete.',
    recruiterProblem: 'Chasing candidates for missing resumes, skills, or basic context.',
    huddleBridge: 'Huddle’s 70% readiness meter + attached CV verifies completeness before you apply.',
    verifiedArtifact: 'Verified "Ready to apply" badge unlocked',
    icon: ShieldCheck,
  },
  {
    id: 'video-call',
    stage: 'Stage 4',
    badge: 'Live Sync',
    title: 'One-Click Apply & Video Call',
    score: 88,
    readiness: 88,
    seekerProblem: 'Waiting weeks in email threads or downloading clunky meeting apps.',
    recruiterProblem: 'Wasting time coordinating calendar links across separate tools.',
    huddleBridge: 'Apply in one click and talk face to face in the browser, on desktop or phone, with zero downloads.',
    verifiedArtifact: 'Recruiter & candidate connected on live video',
    icon: Video,
  },
  {
    id: 'get-job',
    stage: 'Stage 5',
    badge: 'Job Offer',
    title: 'Shortlisted & Get Job',
    score: 92,
    readiness: 92,
    seekerProblem: 'Zero visibility into whether a recruiter shortlisted or moved forward.',
    recruiterProblem: 'Fragmented hiring funnel updates across spreadsheets and chat.',
    huddleBridge: 'Recruiters shortlist in one click while you see live application status through to your job offer.',
    verifiedArtifact: 'Application shortlisted • Role matched & hired',
    icon: CheckCircle2,
  },
];

const CV_TEMPLATES_10 = [
  '1. Clean Modern ATS',
  '2. Executive One-Page',
  '3. Technical Stack Grid',
  '4. Fresher & Graduate',
  '5. Clinical & Healthcare',
  '6. Hospitality & Service',
  '7. Sales & Operations',
  '8. Compact Two-Column',
  '9. Classic Serif Formal',
  '10. Minimalist Crisp',
];

const SUPPORTED_LANGUAGES = [
  'English',
  'Hindi',
  'Spanish',
  'French',
  'German',
  'Dutch',
  'Russian',
];

const FAQ_ITEMS = [
  {
    q: 'Is Huddle free?',
    a: 'Yes, it’s free to join.',
  },
  {
    q: 'Do I need a CV to start?',
    a: 'No. Build one with the AI CV Builder in a few minutes.',
  },
  {
    q: 'Will the AI make things up?',
    a: 'No. It only rewrites what you tell it and marks missing numbers as [placeholders] for you to fill in.',
  },
  {
    q: 'Which file types can I upload?',
    a: 'PDF, DOC, DOCX and TXT.',
  },
  {
    q: 'Can learners, job seekers, and recruiters post and talk on Huddle?',
    a: 'Yes. Huddle includes a built-in professional network with posts, personal career updates, direct messages once connected, and in-browser video calls.',
  },
  {
    q: 'Who can see my phone and email?',
    a: 'Only connections, recruiters you apply to, and people you give your public link to (only if you publish it).',
  },
  {
    q: 'Can I turn off my public CV link?',
    a: 'Yes, any time, with one click.',
  },
  {
    q: 'Do recruiters need to install anything for video calls?',
    a: 'No. Calls run in the browser on desktop and phone.',
  },
  {
    q: 'Which languages?',
    a: 'English, Hindi, Spanish, French, German, Dutch and Russian.',
  },
  {
    q: "What's the 70% readiness rule?",
    a: 'A complete profile plus a CV before applying, so recruiters get quality applications and you get faster replies.',
  },
];

// ============================================================================
// REUSABLE CIRCULAR ATS SCORE RING COMPONENT
// ============================================================================
function AtsScoreRing({ score, size = 96, strokeWidth = 8, darkMode = false }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, score));
  const offset = circumference - (clamped / 100) * circumference;

  const ringColor =
    clamped >= 80
      ? '#0CA30C' // Green for ready
      : clamped >= 70
      ? '#D97706' // Amber for almost
      : '#DC2626'; // Red for needs work

  return (
    <div
      className="relative inline-flex items-center justify-center shrink-0"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`ATS score ${clamped} out of 100`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="transparent"
          stroke={darkMode ? '#1E293B' : '#E5E7EB'}
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="transparent"
          stroke={ringColor}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-500 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span
          className={`font-extrabold leading-none ${
            size >= 110 ? 'text-2xl' : 'text-lg'
          } ${darkMode ? 'text-white' : 'text-slate-900'}`}
        >
          {clamped}
        </span>
        <span
          className={`text-[9px] font-bold uppercase tracking-wider mt-0.5 ${
            darkMode ? 'text-slate-400' : 'text-slate-500'
          }`}
        >
          ATS
        </span>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN HUDDLE MARKETING & INTERACTIVE PRODUCT WEBSITE
// ============================================================================
export default function HuddleLandingPage({ initialPath = '/' }) {
  // Multi-page / view navigation: 'home' | 'job-seekers' | 'recruiters' | 'public-cv-link'
  // Each view has its own URL (see ./routes.js) so it can be shared, bookmarked and indexed.
  const [activeRoute, setActiveRoute] = useState(() => routeFromPath(initialPath) ?? 'home');
  // Back / forward between landing pages.
  useEffect(() => {
    const onPop = () => setActiveRoute(routeFromPath(window.location.pathname) ?? 'home');
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  // Title, description, canonical and Open Graph follow the visible page.
  useEffect(() => { applyRouteMeta(activeRoute); }, [activeRoute]);
  const [darkMode, setDarkMode] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  // Respect prefers-reduced-motion
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const handler = (e) => setReducedMotion(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // 1. Hero Optical Laser Scanner State
  const [heroScanning, setHeroScanning] = useState(true);
  const [heroScanStep, setHeroScanStep] = useState(0);
  const [heroScanComplete, setHeroScanComplete] = useState(false);

  // Global Auto-Animation Master Control (ON by default, respects prefers-reduced-motion)
  const [globalAutoPlay, setGlobalAutoPlay] = useState(true);

  // Graphical Scan -> Verified -> Get Job Timeline State (Auto-runs by default)
  const [activeJourneyIdx, setActiveJourneyIdx] = useState(0);
  const [autoPlayJourney, setAutoPlayJourney] = useState(true);
  const [activeWorkflowTrack, setActiveWorkflowTrack] = useState('both'); // 'both' | 'seekers' | 'recruiters'
  const [highlightedStepNum, setHighlightedStepNum] = useState(1);
  const [activeHopIdx, setActiveHopIdx] = useState(0);

  // Community & Social Feed Interactive State (Recruiters, Learners & Job Seekers)
  const [communityPosts, setCommunityPosts] = useState(INITIAL_COMMUNITY_POSTS);
  const [communityPersonaFilter, setCommunityPersonaFilter] = useState('All'); // 'All' | 'Recruiter' | 'Learner' | 'Job Seeker'
  const [composerPersona, setComposerPersona] = useState('Job Seeker');
  const [composerDraft, setComposerDraft] = useState('');
  const [highlightedPostIdx, setHighlightedPostIdx] = useState(0);

  const runHeroLaserDemo = () => {
    if (reducedMotion) {
      setHeroScanning(false);
      setHeroScanStep(3);
      setHeroScanComplete(true);
      return;
    }
    setHeroScanning(true);
    setHeroScanComplete(false);
    setHeroScanStep(0);

    setTimeout(() => setHeroScanStep(1), 650);
    setTimeout(() => setHeroScanStep(2), 1300);
    setTimeout(() => setHeroScanStep(3), 1950);
    setTimeout(() => {
      setHeroScanning(false);
      setHeroScanComplete(true);
    }, 2600);
  };

  useEffect(() => {
    runHeroLaserDemo();
    if (!globalAutoPlay || reducedMotion) return;
    const heroLoop = setInterval(() => {
      runHeroLaserDemo();
    }, 6400);
    return () => clearInterval(heroLoop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion, globalAutoPlay]);

  // Auto-play progression for Scan -> Verified -> Get Job timeline
  useEffect(() => {
    if (!globalAutoPlay || !autoPlayJourney || reducedMotion) return;
    const timer = setInterval(() => {
      setActiveJourneyIdx((prev) => (prev + 1) % SCAN_TO_JOB_MILESTONES.length);
    }, 2200);
    return () => clearInterval(timer);
  }, [globalAutoPlay, autoPlayJourney, reducedMotion]);

  // Cycle active step highlight across 01-04 workflows & community feed spotlight
  useEffect(() => {
    if (!globalAutoPlay || reducedMotion) return;
    const stepTimer = setInterval(() => {
      setHighlightedStepNum((prev) => (prev % 4) + 1);
      setActiveHopIdx((prev) => (prev + 1) % 5);
      setHighlightedPostIdx((prev) => (prev + 1) % 3);
    }, 2400);
    return () => clearInterval(stepTimer);
  }, [globalAutoPlay, reducedMotion]);

  const handlePublishCommunityPost = (e) => {
    e.preventDefault();
    const clean = composerDraft.trim();
    if (!clean) return;
    const badgeMap = {
      Recruiter: 'bg-[#EEF2FF] text-[#4F46E5] border-[#C7D2FE]',
      Learner: 'bg-amber-50 text-amber-800 border-amber-200',
      'Job Seeker': 'bg-emerald-50 text-emerald-800 border-emerald-200',
    };
    const roleMap = {
      Recruiter: 'Hiring Lead • Open Roles',
      Learner: 'Career Learner • Building Skills',
      'Job Seeker': 'Candidate • Ready to Apply',
    };
    const created = {
      id: `post-${Date.now()}`,
      persona: composerPersona,
      badgeClass: badgeMap[composerPersona] || badgeMap['Job Seeker'],
      author: 'You',
      initials: 'YO',
      role: roleMap[composerPersona] || 'Huddle Member',
      time: 'Just now',
      topic: 'Personal Opinion',
      content: clean,
      likes: 1,
      liked: true,
      replies: 0,
    };
    setCommunityPosts((prev) => [created, ...prev]);
    setCommunityPersonaFilter('All');
    setHighlightedPostIdx(0);
    setComposerDraft('');
  };

  const togglePostLike = (postId) => {
    setCommunityPosts((prev) =>
      prev.map((p) =>
        p.id === postId
          ? { ...p, liked: !p.liked, likes: p.liked ? p.likes - 1 : p.likes + 1 }
          : p
      )
    );
  };

  const visibleCommunityPosts = useMemo(() => {
    if (communityPersonaFilter === 'All') return communityPosts;
    return communityPosts.filter((p) => p.persona === communityPersonaFilter);
  }, [communityPosts, communityPersonaFilter]);

  const activeMilestone =
    SCAN_TO_JOB_MILESTONES[activeJourneyIdx] || SCAN_TO_JOB_MILESTONES[0];

  const triggerScanToJobSequence = () => {
    setAutoPlayJourney(true);
    runHeroLaserDemo();
    setActiveJourneyIdx(0);
    if (!reducedMotion) {
      setTimeout(() => setActiveJourneyIdx(1), 650);
      setTimeout(() => setActiveJourneyIdx(2), 1300);
      setTimeout(() => setActiveJourneyIdx(3), 1950);
      setTimeout(() => setActiveJourneyIdx(4), 2550);
    } else {
      setActiveJourneyIdx(4);
    }
  };

  // 2. Interactive AI CV Builder Showcase State (Auto-cycles professions & chips)
  const [selectedBuilderKey, setSelectedBuilderKey] = useState('bpo');
  const [selectedChips, setSelectedChips] = useState([
    'Handled inbound calls',
    'Resolved customer queries',
  ]);
  const [autoCycleBuilder, setAutoCycleBuilder] = useState(true);
  const activeBuilder = AI_BUILDER_PROFILES[selectedBuilderKey];

  useEffect(() => {
    if (!globalAutoPlay || !autoCycleBuilder || reducedMotion) return;
    const builderKeys = Object.keys(AI_BUILDER_PROFILES);
    let tick = 0;
    const builderInterval = setInterval(() => {
      tick += 1;
      const currentProf = AI_BUILDER_PROFILES[builderKeys[tick % builderKeys.length]];
      setSelectedBuilderKey(currentProf.id);
      const chipSubsetCount = ((tick - 1) % currentProf.chips.length) + 1;
      setSelectedChips(currentProf.chips.slice(0, chipSubsetCount));
    }, 3200);
    return () => clearInterval(builderInterval);
  }, [globalAutoPlay, autoCycleBuilder, reducedMotion]);

  const handleSelectBuilderProfile = (key) => {
    setAutoCycleBuilder(false);
    setSelectedBuilderKey(key);
    setSelectedChips([AI_BUILDER_PROFILES[key].chips[0]]);
  };

  const toggleBuilderChip = (chip) => {
    setAutoCycleBuilder(false);
    setSelectedChips((prev) =>
      prev.includes(chip) ? prev.filter((c) => c !== chip) : [...prev, chip]
    );
  };

  // 3. Interactive Live ATS Analyzer Showcase State (Auto-taps missing keywords)
  const [matchedKeywords, setMatchedKeywords] = useState([
    'Customer communication',
    'CRM ticketing',
    'Inbound support',
    'Issue resolution',
  ]);
  const [missingKeywords, setMissingKeywords] = useState([
    { label: 'First-call resolution', boost: 7 },
    { label: 'CSAT tracking', boost: 7 },
    { label: 'SLA follow-up', boost: 6 },
    { label: 'Escalation handling', boost: 6 },
  ]);
  const [autoCycleAts, setAutoCycleAts] = useState(true);

  const liveAtsScore = useMemo(() => {
    const base = 74;
    const addedCount = matchedKeywords.length - 4;
    return Math.min(100, base + addedCount * 6 + (addedCount > 0 ? 1 : 0));
  }, [matchedKeywords]);

  useEffect(() => {
    if (!globalAutoPlay || !autoCycleAts || reducedMotion) return;
    const atsInterval = setInterval(() => {
      setMissingKeywords((prevMissing) => {
        if (prevMissing.length === 0) {
          setMatchedKeywords([
            'Customer communication',
            'CRM ticketing',
            'Inbound support',
            'Issue resolution',
          ]);
          return [
            { label: 'First-call resolution', boost: 7 },
            { label: 'CSAT tracking', boost: 7 },
            { label: 'SLA follow-up', boost: 6 },
            { label: 'Escalation handling', boost: 6 },
          ];
        }
        const [nextKeyword, ...rest] = prevMissing;
        setMatchedKeywords((prevMatched) => [...prevMatched, nextKeyword.label]);
        return rest;
      });
    }, 2100);
    return () => clearInterval(atsInterval);
  }, [globalAutoPlay, autoCycleAts, reducedMotion]);

  const handleAddMissingKeyword = (kwObj) => {
    setAutoCycleAts(false);
    setMissingKeywords((prev) => prev.filter((k) => k.label !== kwObj.label));
    setMatchedKeywords((prev) => [...prev, kwObj.label]);
  };

  const handleResetAtsDemo = () => {
    setAutoCycleAts(false);
    setMatchedKeywords([
      'Customer communication',
      'CRM ticketing',
      'Inbound support',
      'Issue resolution',
    ]);
    setMissingKeywords([
      { label: 'First-call resolution', boost: 7 },
      { label: 'CSAT tracking', boost: 7 },
      { label: 'SLA follow-up', boost: 6 },
      { label: 'Escalation handling', boost: 6 },
    ]);
  };

  // 4. Permanent Public CV Link Interactive Controls (Auto-cycles template & share pulse)
  const [publicMobile, setPublicMobile] = useState('9876543210');
  const [isPublicPublished, setIsPublicPublished] = useState(true);
  const [hasUnpublishedEdit, setHasUnpublishedEdit] = useState(false);
  const [copiedPublicUrl, setCopiedPublicUrl] = useState(false);
  const [selectedTemplateIdx, setSelectedTemplateIdx] = useState(0);
  const [whatsappPulseActive, setWhatsappPulseActive] = useState(true);

  const sanitizedMobile = publicMobile.replace(/[^0-9]/g, '') || '9876543210';
  const publicShareUrl = `huddle.app/${sanitizedMobile}`;

  useEffect(() => {
    if (!globalAutoPlay || reducedMotion) return;
    const publicLinkTimer = setInterval(() => {
      setSelectedTemplateIdx((prev) => (prev + 1) % 3);
      setWhatsappPulseActive(true);
      setTimeout(() => setWhatsappPulseActive(false), 1100);
    }, 3400);
    return () => clearInterval(publicLinkTimer);
  }, [globalAutoPlay, reducedMotion]);

  const handleCopyPublicUrl = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(`https://${publicShareUrl}`).catch(() => {});
    }
    setCopiedPublicUrl(true);
    setTimeout(() => setCopiedPublicUrl(false), 2000);
  };

  // 5. Recruiter Console Interactive State (/recruiters)
  const [recruiterApplicants, setRecruiterApplicants] = useState([
    {
      id: 'cand-1',
      name: 'Harish Kumar Verma',
      role: 'UI / Front-End Developer & Module Lead',
      ats: 88,
      readiness: 92,
      skills: ['Angular', 'React', 'TypeScript', 'Micro-Frontends'],
      status: 'Shortlisted',
    },
    {
      id: 'cand-2',
      name: 'Priya Nair',
      role: 'Customer Support & BPO Specialist',
      ats: 84,
      readiness: 86,
      skills: ['CSAT', 'First-call resolution', 'CRM tools'],
      status: 'Applicant',
    },
    {
      id: 'cand-3',
      name: 'Rohan Kulkarni',
      role: 'Full-Stack Software Engineer',
      ats: 81,
      readiness: 80,
      skills: ['React', 'Node.js', 'REST APIs'],
      status: 'Applicant',
    },
  ]);
  const [activeCallCandidate, setActiveCallCandidate] = useState(null);
  const [callMuted, setCallMuted] = useState(false);

  const updateCandidateStatus = (id, status) => {
    setRecruiterApplicants((prev) =>
      prev.map((c) => (c.id === id ? { ...c, status } : c))
    );
  };

  // 6. Get-started (sign-up) form & FAQ state
  const [signupForm, setSignupForm] = useState({
    name: '',
    email: '',
    roleType: 'Job seeker',
    industry: 'IT & Software',
    city: '',
  });
  const [openFaqIdx, setOpenFaqIdx] = useState(0);

  // Getting started = creating a Huddle account. Carry what they typed to /register.
  const handleSignupSubmit = (e) => {
    e.preventDefault();
    if (!signupForm.name.trim() || !signupForm.email.trim()) return;
    const q = new URLSearchParams({
      role: signupForm.roleType === 'Recruiter' ? 'recruiter' : 'jobSeeker',
      name: signupForm.name.trim(),
      email: signupForm.email.trim(),
    });
    if (signupForm.city.trim()) q.set('location', signupForm.city.trim());
    window.location.assign(`/register?${q}`);
  };

  // Navigation helper
  const navigateTo = (route, anchorId = null) => {
    const path = pathForRoute(route) + (anchorId ? `#${anchorId}` : '');
    if (typeof window !== 'undefined' && window.location.pathname + window.location.hash !== path) {
      window.history.pushState(null, '', path);
    }
    setActiveRoute(route);
    setMobileMenuOpen(false);
    if (anchorId) {
      setTimeout(() => {
        const el = document.getElementById(anchorId);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 60);
    } else if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Shared Theme Surface Classes
  const pageSurface = darkMode
    ? 'bg-slate-950 text-slate-100'
    : 'bg-[#F8F9FB] text-slate-900';
  const cardSurface = darkMode
    ? 'bg-slate-900 border-slate-800 text-slate-100'
    : 'bg-white border-[#E5E7EB] text-slate-900';
  const subtleSurface = darkMode
    ? 'bg-slate-800/70 border-slate-700 text-slate-200'
    : 'bg-[#F8F9FB] border-[#E5E7EB] text-slate-700';
  const mutedText = darkMode ? 'text-slate-400' : 'text-slate-600';

  return (
    <div className={`hl min-h-screen font-sans antialiased transition-colors ${pageSurface}`}>
      {/* Custom Optical Laser & Auto-Motion Keyframes (Respects prefers-reduced-motion) */}
      <style>{`
        @keyframes huddleLaserScan {
          0% {
            top: 4%;
            opacity: 0;
          }
          15% {
            opacity: 1;
          }
          85% {
            opacity: 1;
          }
          100% {
            top: 92%;
            opacity: 0;
          }
        }
        @keyframes huddlePulseBeam {
          0% {
            transform: translateX(-100%);
            opacity: 0.2;
          }
          50% {
            opacity: 1;
          }
          100% {
            transform: translateX(250%);
            opacity: 0.2;
          }
        }
        @keyframes huddleFloatCard {
          0%, 100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-4px);
          }
        }
        @keyframes huddleOrbitRing {
          0% {
            transform: scale(0.96);
            opacity: 0.55;
          }
          50% {
            transform: scale(1.03);
            opacity: 1;
          }
          100% {
            transform: scale(0.96);
            opacity: 0.55;
          }
        }
        .huddle-laser-beam {
          animation: huddleLaserScan 2.3s cubic-bezier(0.4, 0, 0.2, 1) infinite;
        }
        .huddle-pulse-beam {
          animation: huddlePulseBeam 2.6s linear infinite;
        }
        .huddle-float-subtle {
          animation: huddleFloatCard 3.2s ease-in-out infinite;
        }
        .huddle-orbit-pulse {
          animation: huddleOrbitRing 2.8s ease-in-out infinite;
        }
        .huddle-paused .huddle-laser-beam,
        .huddle-paused .huddle-pulse-beam,
        .huddle-paused .huddle-float-subtle,
        .huddle-paused .huddle-orbit-pulse {
          animation-play-state: paused !important;
        }
        @media (prefers-reduced-motion: reduce) {
          .huddle-laser-beam,
          .huddle-pulse-beam,
          .huddle-float-subtle,
          .huddle-orbit-pulse {
            animation: none !important;
            transform: none !important;
          }
          .huddle-laser-beam {
            top: 48% !important;
            opacity: 0.85 !important;
          }
        }
      `}</style>

      <div className={!globalAutoPlay ? 'huddle-paused' : ''}>
      {/* ======================================================================
          STICKY GLASS HEADER NAVIGATION
         ====================================================================== */}
      <header
        className={`sticky top-0 z-50 backdrop-blur-md border-b ${
          darkMode
            ? 'bg-slate-950/90 border-slate-800'
            : 'bg-white/90 border-[#E5E7EB]'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-3">
          {/* Brand Logo */}
          <a
 href={pathForRoute('home')}
 onClick={(e) => { e.preventDefault(); navigateTo('home'); }}
            aria-label="Huddle home page"
            className="hl-brandmark focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4F46E5] rounded-xl cursor-pointer"
          >
            {/* Same logo as the sign-in page and the app */}
            <Aperture open={0.42} className="mark" />
            <span>Huddle</span>
          </a>

          {/* Desktop Primary Navigation Links */}
          <nav
            aria-label="Primary Navigation"
            className="hidden lg:flex items-center gap-6 text-xs font-semibold"
          >
            <a
 href={pathForRoute('job-seekers')}
 onClick={(e) => { e.preventDefault(); navigateTo('job-seekers'); }}
              className={`transition-colors cursor-pointer ${
                activeRoute === 'job-seekers'
                  ? 'text-[#4F46E5] font-bold'
                  : `${mutedText} hover:text-[#4F46E5]`
              }`}
            >
              For Job Seekers
            </a>
            <a
 href={pathForRoute('recruiters')}
 onClick={(e) => { e.preventDefault(); navigateTo('recruiters'); }}
              className={`transition-colors cursor-pointer ${
                activeRoute === 'recruiters'
                  ? 'text-[#4F46E5] font-bold'
                  : `${mutedText} hover:text-[#4F46E5]`
              }`}
            >
              For Recruiters
            </a>
            <a
 href={pathForRoute('home') + '#community-network'}
 onClick={(e) => { e.preventDefault(); navigateTo('home', 'community-network'); }}
              className={`${mutedText} hover:text-[#4F46E5] transition-colors cursor-pointer`}
            >
              Community
            </a>
            <a
 href={pathForRoute('home') + '#how-it-works'}
 onClick={(e) => { e.preventDefault(); navigateTo('home', 'how-it-works'); }}
              className={`${mutedText} hover:text-[#4F46E5] transition-colors cursor-pointer`}
            >
              How it works
            </a>
            <a
 href={pathForRoute('public-cv-link')}
 onClick={(e) => { e.preventDefault(); navigateTo('public-cv-link'); }}
              className={`transition-colors cursor-pointer ${
                activeRoute === 'public-cv-link'
                  ? 'text-[#4F46E5] font-bold'
                  : `${mutedText} hover:text-[#4F46E5]`
              }`}
            >
              Public CV link
            </a>
            <a
 href={pathForRoute('home') + '#faq'}
 onClick={(e) => { e.preventDefault(); navigateTo('home', 'faq'); }}
              className={`${mutedText} hover:text-[#4F46E5] transition-colors cursor-pointer`}
            >
              FAQ
            </a>
          </nav>

          {/* Right Utility & CTA Buttons */}
          <div className="flex items-center gap-2">
            {/* Global Auto-Play Toggle */}
            <button
              type="button"
              onClick={() => {
                const next = !globalAutoPlay;
                setGlobalAutoPlay(next);
                if (next) {
                  setAutoPlayJourney(true);
                  setAutoCycleBuilder(true);
                  setAutoCycleAts(true);
                }
              }}
              aria-pressed={globalAutoPlay}
              className={`hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-bold transition-colors cursor-pointer ${
                globalAutoPlay
                  ? darkMode
                    ? 'bg-emerald-950/60 border-emerald-700 text-emerald-300'
                    : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : `${cardSurface} ${mutedText}`
              }`}
              title="Pause or resume all automatic section animations"
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  globalAutoPlay && !reducedMotion
                    ? 'bg-[#0CA30C] animate-ping'
                    : 'bg-slate-400'
                }`}
              />
              <span>{globalAutoPlay ? 'Auto-play: ON' : 'Auto-play: Paused'}</span>
            </button>

            {/* Dark Mode Toggle */}
            <button
              type="button"
              onClick={() => setDarkMode(!darkMode)}
              aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
              className={`p-2 rounded-xl border transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4F46E5] ${
                darkMode
                  ? 'bg-slate-900 border-slate-700 text-amber-300 hover:bg-slate-800'
                  : 'bg-white border-[#E5E7EB] text-slate-600 hover:bg-slate-50'
              }`}
            >
              {darkMode ? (
                <Sun className="w-4 h-4" />
              ) : (
                <Moon className="w-4 h-4" />
              )}
            </button>

            {/* Secondary CTA: Sign in -> https://harish007.duckdns.org */}
            <a
              href={APP_URL}
              className={`hidden sm:inline-flex items-center gap-1 px-3.5 py-2 rounded-xl border text-xs font-semibold transition-colors ${
                darkMode
                  ? 'bg-slate-900 border-slate-700 text-slate-200 hover:bg-slate-800'
                  : 'bg-white border-[#E5E7EB] text-slate-700 hover:bg-slate-50'
              }`}
            >
              <span>Sign in</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </a>

            {/* Primary CTA: Get started (create an account) */}
            <a
 href="/register"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#4F46E5] hover:bg-[#5B46E8] text-white text-xs font-bold shadow-2xs transition-colors cursor-pointer"
            >
              <span>Get started</span>
            </a>

            {/* Mobile Menu Trigger */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Open navigation menu"
              className={`lg:hidden p-2 rounded-xl border cursor-pointer ${
                darkMode
                  ? 'bg-slate-900 border-slate-700 text-slate-200'
                  : 'bg-white border-[#E5E7EB] text-slate-700'
              }`}
            >
              {mobileMenuOpen ? (
                <X className="w-4 h-4" />
              ) : (
                <Menu className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile Drawer Menu */}
        {mobileMenuOpen && (
          <div
            className={`lg:hidden border-b px-4 py-4 space-y-2 text-xs font-semibold ${
              darkMode
                ? 'bg-slate-900 border-slate-800 text-slate-200'
                : 'bg-white border-[#E5E7EB] text-slate-700'
            }`}
          >
            <a
 href={pathForRoute('home')}
 onClick={(e) => { e.preventDefault(); navigateTo('home'); }}
              className="block w-full text-left py-2 hover:text-[#4F46E5]"
            >
              Home Overview
            </a>
            <a
 href={pathForRoute('job-seekers')}
 onClick={(e) => { e.preventDefault(); navigateTo('job-seekers'); }}
              className="block w-full text-left py-2 hover:text-[#4F46E5]"
            >
              For Job Seekers
            </a>
            <a
 href={pathForRoute('recruiters')}
 onClick={(e) => { e.preventDefault(); navigateTo('recruiters'); }}
              className="block w-full text-left py-2 hover:text-[#4F46E5]"
            >
              For Recruiters
            </a>
            <a
 href={pathForRoute('home') + '#community-network'}
 onClick={(e) => { e.preventDefault(); navigateTo('home', 'community-network'); }}
              className="block w-full text-left py-2 hover:text-[#4F46E5]"
            >
              Community &amp; Feed
            </a>
            <a
 href={pathForRoute('home') + '#how-it-works'}
 onClick={(e) => { e.preventDefault(); navigateTo('home', 'how-it-works'); }}
              className="block w-full text-left py-2 hover:text-[#4F46E5]"
            >
              How it works
            </a>
            <a
 href={pathForRoute('public-cv-link')}
 onClick={(e) => { e.preventDefault(); navigateTo('public-cv-link'); }}
              className="block w-full text-left py-2 hover:text-[#4F46E5]"
            >
              Public CV link
            </a>
            <a
 href={pathForRoute('home') + '#faq'}
 onClick={(e) => { e.preventDefault(); navigateTo('home', 'faq'); }}
              className="block w-full text-left py-2 hover:text-[#4F46E5]"
            >
              FAQ
            </a>
            <div className="pt-2 border-t border-slate-200/20 flex items-center gap-2">
              <a
                href={APP_URL}
                className="flex-1 py-2 text-center rounded-xl border border-[#E5E7EB] font-bold"
              >
                Sign in ↗
              </a>
              <a
 href="/register"
                className="flex-1 py-2 text-center rounded-xl bg-[#4F46E5] text-white font-bold"
              >
                Get started
              </a>
            </div>
          </div>
        )}
      </header>

      {/* ======================================================================
          ROUTE 1: HOME PAGE (ALL 13 SECTIONS + CLEAR ROADMAP)
         ====================================================================== */}
      {activeRoute === 'home' && (
        <main>
          {/* ------------------------------------------------------------------
              SECTION 1: HERO INTRODUCTION & INTERACTIVE OPTICAL LASER SCANNER
             ------------------------------------------------------------------ */}
          <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 sm:pt-14 pb-4">
            <div className="hl-grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-center">
              {/* Left 6 Cols: Positioning Headline, Sub-Headline & Dual CTAs */}
              <div className="lg:col-span-6 space-y-6">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#EEF2FF] border border-[#C7D2FE] text-[#4F46E5] text-xs font-bold">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>One CV everywhere</span>
                </div>

                <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight leading-[1.12]">
                  Upload once. Get matched.{' '}
                  <span className="text-[#4F46E5]">Talk face to face.</span>
                </h1>

                <p className={`text-base sm:text-lg leading-relaxed max-w-xl ${mutedText}`}>
                  Huddle turns your CV into a living profile that scores itself against every job, connects job seekers, learners, and recruiters in one open community, and lets you talk live on video, all in one place.
                </p>

                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <a
 href={pathForRoute('job-seekers')}
 onClick={(e) => { e.preventDefault(); navigateTo('job-seekers'); }}
                    className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl bg-[#4F46E5] hover:bg-[#5B46E8] text-white text-sm font-bold shadow-xs transition-colors cursor-pointer"
                  >
                    <span>I&apos;m looking for a job</span>
                    <ArrowRight className="w-4 h-4" />
                  </a>

                  <a
 href={pathForRoute('recruiters')}
 onClick={(e) => { e.preventDefault(); navigateTo('recruiters'); }}
                    className={`inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl border text-sm font-bold transition-colors cursor-pointer ${cardSurface} hover:border-[#4F46E5]`}
                  >
                    <span>I&apos;m hiring</span>
                    <Video className="w-4 h-4 text-[#4F46E5]" />
                  </a>
                </div>

                <div className={`flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-medium pt-1 ${mutedText}`}>
                  <span className="inline-flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-[#0CA30C]" />
                    PDF, DOC, DOCX or TXT
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-[#0CA30C]" />
                    Social feed for seekers, learners &amp; recruiters
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-[#0CA30C]" />
                    In-browser video calls
                  </span>
                </div>
              </div>

              {/* Right 6 Cols: Interactive Optical Laser CV Scanner Card */}
              <div className="lg:col-span-6">
                <div
                  className={`relative overflow-hidden border rounded-2xl p-5 sm:p-6 shadow-sm space-y-5 ${cardSurface}`}
                >
                  {/* Indigo Optical Laser Line Sweeping Document */}
                  {heroScanning && (
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 z-20 overflow-hidden"
                    >
                      <div className="absolute left-0 right-0 h-14 bg-gradient-to-b from-transparent via-[#4F46E5]/12 to-[#4F46E5]/25 border-b-2 border-[#4F46E5] shadow-[0_6px_22px_rgba(79,70,229,0.4)] huddle-laser-beam" />
                    </div>
                  )}

                  {/* Top Card Header & Re-Scan Button */}
                  <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-200/60 dark:border-slate-800">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-[#4F46E5]" />
                      <span className="text-xs font-bold">
                        Harish-Kumar-Verma-CV.docx
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={runHeroLaserDemo}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#EEF2FF] text-[#4F46E5] text-[11px] font-bold hover:bg-[#E0E7FF] transition-colors cursor-pointer"
                    >
                      <RefreshCw
                        className={`w-3 h-3 ${
                          heroScanning && !reducedMotion ? 'animate-spin' : ''
                        }`}
                      />
                      <span>{heroScanning ? 'Scanning CV...' : 'Replay Scan'}</span>
                    </button>
                  </div>

                  {/* 4-Step Optical Scan Telemetry */}
                  <div className="hl-grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {OPTICAL_SCAN_STEPS.map((step) => {
                      const isDone = heroScanStep > step.id || heroScanComplete;
                      const isCurrent = heroScanning && heroScanStep === step.id;
                      return (
                        <div
                          key={step.id}
                          className={`p-2.5 rounded-xl border text-xs transition-all flex items-start gap-2 ${
                            isDone
                              ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200/80 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 font-semibold'
                              : isCurrent
                              ? 'bg-[#EEF2FF] dark:bg-indigo-950/50 border-[#4F46E5] text-[#4F46E5] font-bold'
                              : `${subtleSurface} ${mutedText}`
                          }`}
                        >
                          {isDone ? (
                            <CheckCircle2
                              className="w-4 h-4 shrink-0 mt-0.5"
                              style={{ color: '#0CA30C' }}
                            />
                          ) : (
                            <Radar className="w-4 h-4 shrink-0 mt-0.5 text-[#4F46E5]" />
                          )}
                          <div className="min-w-0">
                            <div className="truncate">{step.label}</div>
                            <div className="text-[10px] opacity-80 truncate font-normal">
                              {step.detail}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Living Profile Result Card with Score Ring (82) & "Ready to apply" Badge */}
                  <div
                    className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all ${subtleSurface}`}
                  >
                    <div className="flex items-center gap-3.5">
                      <AtsScoreRing
                        score={heroScanComplete ? 82 : 58 + heroScanStep * 7}
                        size={84}
                        strokeWidth={8}
                        darkMode={darkMode}
                      />
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-extrabold">
                            Harish Kumar Verma
                          </span>
                          {heroScanComplete ? (
                            <span
                              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold text-white"
                              style={{ backgroundColor: '#0CA30C' }}
                            >
                              <Check className="w-3 h-3" />
                              Ready to apply
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 text-[10px] font-bold">
                              Checking 70% gate...
                            </span>
                          )}
                        </div>
                        <p className={`text-xs ${mutedText}`}>
                          UI / Front-End Developer • Angular, React, TypeScript
                        </p>
                        <p className="text-[11px] font-semibold text-[#4F46E5]">
                          Synced across jobs, applications &amp; public link
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ------------------------------------------------------------------
              SECTION 2: OUR FIX, ONE CV EVERYWHERE (AUTO-ANIMATED)
             ------------------------------------------------------------------ */}
          <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 space-y-6">
            <div className="hl-grid grid-cols-1 gap-6 items-stretch">
              {/* Our Fix Card */}
              <div
                className={`border-2 border-[#4F46E5]/50 rounded-2xl p-6 space-y-4 ${cardSurface}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-[#4F46E5]">
                    Our fix • One CV everywhere
                  </span>
                  <span
                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold text-white"
                    style={{ backgroundColor: '#0CA30C' }}
                  >
                    <Check className="w-3 h-3" />
                    Single source of truth
                  </span>
                </div>

                <div className="hl-grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                  {[
                    {
                      label: 'Upload once',
                      sub: 'PDF, DOC, DOCX, TXT',
                    },
                    {
                      label: 'Score & gaps live',
                      sub: '0–100 ATS & 70% gate',
                    },
                    {
                      label: 'Share & talk in-app',
                      sub: 'Social feed & direct chat',
                    },
                    {
                      label: 'Apply & call live',
                      sub: 'One-click apply + video call',
                    },
                  ].map((fix, idx) => (
                    <div
                      key={fix.label}
                      className={`p-3 rounded-xl border transition-all ${
                        activeHopIdx % 4 === idx
                          ? 'border-[#4F46E5] bg-[#EEF2FF]/80 dark:bg-indigo-950/50 huddle-float-subtle'
                          : subtleSurface
                      }`}
                    >
                      <div className="text-xs font-extrabold text-[#4F46E5]">
                        {fix.label}
                      </div>
                      <div className={`text-[11px] mt-0.5 ${mutedText}`}>
                        {fix.sub}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* ------------------------------------------------------------------
              COMMUNITY & SOCIAL NETWORK (FOUNDER VISION + LIVE FEED FOR RECRUITERS, LEARNERS & JOB SEEKERS)
             ------------------------------------------------------------------ */}
          <section
            id="community-network"
            aria-label="Huddle Social Network for Recruiters, Learners and Job Seekers"
            className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-14 space-y-8"
          >
            {/* Founder / CEO Vision Banner */}
            <div
              className={`border rounded-2xl p-6 sm:p-8 shadow-2xs hl-grid grid-cols-1 lg:grid-cols-12 gap-6 items-center ${cardSurface}`}
            >
              <div className="lg:col-span-8 space-y-3">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#EEF2FF] text-[#4F46E5] text-xs font-bold">
                  <Users className="w-3.5 h-3.5" />
                  <span>Social Network • Built for Open Career Conversations</span>
                </div>
                <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                  &ldquo;Careers are built through real conversations, not silent job portals.&rdquo;
                </h2>
                <p className={`text-sm sm:text-base leading-relaxed ${mutedText}`}>
                  We built Huddle so <strong>recruiters, learners, and job seekers</strong> share the same table. Post what you&apos;re building, share honest career opinions, ask questions as you learn, connect directly, and move from a public post to a private message or live video call without leaving the app.
                </p>
              </div>

              {/* 3 Audience Pillars */}
              <div className="lg:col-span-4 hl-grid grid-cols-1 gap-2.5">
                {[
                  {
                    who: 'For Job Seekers',
                    detail: 'Share your work, ask for referrals, and show the real person behind your CV.',
                  },
                  {
                    who: 'For Learners & Freshers',
                    detail: 'Document what you are learning, post progress, and get practical advice from practitioners.',
                  },
                  {
                    who: 'For Recruiters & Founders',
                    detail: 'Share what your team actually values, spot talent early, and start real conversations.',
                  },
                ].map((pillar) => (
                  <div
                    key={pillar.who}
                    className={`p-3 rounded-xl border ${subtleSurface}`}
                  >
                    <div className="text-xs font-extrabold text-[#4F46E5]">
                      {pillar.who}
                    </div>
                    <div className={`text-[11px] mt-0.5 leading-snug ${mutedText}`}>
                      {pillar.detail}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Interactive Live Community Feed & Post Composer */}
            <div className="hl-grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left 5 Cols: Post Your Opinion / Update Composer */}
              <form
                onSubmit={handlePublishCommunityPost}
                className={`lg:col-span-5 border rounded-2xl p-6 space-y-4 ${cardSurface}`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-extrabold">
                      Share a post or personal opinion
                    </h3>
                    <p className={`text-xs mt-0.5 ${mutedText}`}>
                      Try posting as a Job Seeker, Learner, or Recruiter
                    </p>
                  </div>
                  <MessageCircle className="w-4 h-4 text-[#4F46E5]" />
                </div>

                {/* Role / Voice Selector */}
                <div className="space-y-1.5">
                  <span className={`block text-[11px] font-bold ${mutedText}`}>
                    Posting as:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {['Job Seeker', 'Learner', 'Recruiter'].map((roleOption) => (
                      <button
                        key={roleOption}
                        type="button"
                        onClick={() => setComposerPersona(roleOption)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                          composerPersona === roleOption
                            ? 'bg-[#4F46E5] text-white border-[#4F46E5]'
                            : `${subtleSurface} hover:border-[#4F46E5]`
                        }`}
                      >
                        {roleOption}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label htmlFor="community-post-input" className="sr-only">
                    Write your opinion or career update
                  </label>
                  <textarea
                    id="community-post-input"
                    rows={3}
                    value={composerDraft}
                    onChange={(e) => setComposerDraft(e.target.value)}
                    placeholder="Share a learning milestone, hiring insight, or honest career opinion..."
                    className={`w-full p-3.5 rounded-xl border text-xs leading-relaxed focus:outline-none focus:ring-2 focus:ring-[#4F46E5] ${
                      darkMode
                        ? 'bg-slate-800 border-slate-700 text-white'
                        : 'bg-[#F8F9FB] border-[#E5E7EB] text-slate-900'
                    }`}
                  />
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className={`text-[11px] ${mutedText}`}>
                    Connections unlock direct messages &amp; CV sharing
                  </span>
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#4F46E5] hover:bg-[#5B46E8] text-white text-xs font-bold shadow-2xs transition-colors cursor-pointer shrink-0"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Post to Feed</span>
                  </button>
                </div>
              </form>

              {/* Right 7 Cols: Filterable Live Feed Stream */}
              <div className="lg:col-span-7 space-y-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-1.5">
                    {['All', 'Recruiter', 'Learner', 'Job Seeker'].map((filter) => (
                      <button
                        key={filter}
                        type="button"
                        onClick={() => setCommunityPersonaFilter(filter)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                          communityPersonaFilter === filter
                            ? 'bg-[#4F46E5] text-white border-[#4F46E5]'
                            : `${cardSurface} ${mutedText} hover:border-[#4F46E5]`
                        }`}
                      >
                        {filter === 'All' ? 'All Voices' : `${filter}s`}
                      </button>
                    ))}
                  </div>
                  <span className={`text-[11px] font-semibold ${mutedText}`}>
                    Live social feed preview
                  </span>
                </div>

                <div className="space-y-3">
                  {visibleCommunityPosts.map((post, idx) => {
                    const isSpotlit =
                      communityPersonaFilter === 'All' &&
                      highlightedPostIdx % visibleCommunityPosts.length === idx;
                    return (
                      <article
                        key={post.id}
                        className={`border rounded-2xl p-4 sm:p-5 transition-all space-y-2.5 ${cardSurface} ${
                          isSpotlit
                            ? 'border-[#4F46E5] ring-2 ring-[#4F46E5]/15'
                            : ''
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-9 h-9 rounded-xl bg-[#4F46E5] text-white font-bold text-xs flex items-center justify-center shrink-0">
                              {post.initials}
                            </div>
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="text-xs font-extrabold truncate">
                                  {post.author}
                                </span>
                                <span
                                  className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${post.badgeClass}`}
                                >
                                  {post.persona}
                                </span>
                              </div>
                              <div className={`text-[11px] truncate ${mutedText}`}>
                                {post.role} • {post.time}
                              </div>
                            </div>
                          </div>

                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border shrink-0 ${subtleSurface}`}>
                            {post.topic}
                          </span>
                        </div>

                        <p className="text-xs sm:text-[13px] leading-relaxed">
                          {post.content}
                        </p>

                        <div className="pt-2 border-t border-slate-200/50 dark:border-slate-800 flex items-center justify-between text-xs">
                          <div className="flex items-center gap-4">
                            <button
                              type="button"
                              onClick={() => togglePostLike(post.id)}
                              className={`inline-flex items-center gap-1 font-bold cursor-pointer ${
                                post.liked
                                  ? 'text-rose-600'
                                  : `${mutedText} hover:text-rose-600`
                              }`}
                            >
                              <Heart className="w-3.5 h-3.5" />
                              <span>{post.likes}</span>
                            </button>
                            <span className={`inline-flex items-center gap-1 ${mutedText}`}>
                              <MessageCircle className="w-3.5 h-3.5" />
                              <span>{post.replies} replies</span>
                            </span>
                          </div>

                          <a
 href="/register"
                            className="text-[11px] font-bold text-[#4F46E5] hover:underline cursor-pointer"
                          >
                            Connect &amp; message →
                          </a>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>

          {/* ------------------------------------------------------------------
              GRAPHICAL SCAN -> VERIFIED -> GET JOB TIMELINE & PROBLEM BRIDGE
             ------------------------------------------------------------------ */}
          <section
            aria-label="Scan to Verified to Get Job Timeline"
            className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 space-y-8"
          >
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
              <div className="space-y-2 max-w-2xl">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#EEF2FF] text-[#4F46E5] text-xs font-bold">
                  <Radar className="w-3.5 h-3.5" />
                  <span>Scan → Verified → Get Job Timeline</span>
                </div>
                <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                  Every scan moves you from raw CV to verified match and live job talks
                </h2>
                <p className={`text-sm ${mutedText}`}>
                  Click any milestone or run the live scan sequence to see how Huddle bridges job seeker and recruiter problems step by step.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={triggerScanToJobSequence}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#4F46E5] hover:bg-[#5B46E8] text-white text-xs font-bold shadow-2xs transition-colors cursor-pointer"
                >
                  <Radar className="w-3.5 h-3.5" />
                  <span>Run Scan → Job Flow</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAutoPlayJourney((prev) => !prev)}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border text-xs font-bold transition-colors cursor-pointer ${
                    autoPlayJourney
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                      : `${cardSurface} ${mutedText}`
                  }`}
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${
                      autoPlayJourney && !reducedMotion ? 'animate-spin' : ''
                    }`}
                  />
                  <span>{autoPlayJourney ? 'Auto-playing' : 'Auto-play'}</span>
                </button>
              </div>
            </div>

            {/* Graphical 5-Node Timeline Track */}
            <div className={`border rounded-2xl p-5 sm:p-7 space-y-6 ${cardSurface}`}>
              <div className="relative">
                {/* Connector Progress Bar Behind Nodes */}
                <div
                  className={`hidden md:block absolute top-6 left-[10%] right-[10%] h-1 rounded-full overflow-hidden ${
                    darkMode ? 'bg-slate-800' : 'bg-slate-200'
                  }`}
                >
                  <div
                    className="h-full bg-[#4F46E5] transition-all duration-500"
                    style={{
                      width: `${
                        (activeJourneyIdx / (SCAN_TO_JOB_MILESTONES.length - 1)) * 100
                      }%`,
                    }}
                  />
                  {!reducedMotion && (
                    <div className="h-full w-1/3 bg-gradient-to-r from-transparent via-white/70 to-transparent huddle-pulse-beam" />
                  )}
                </div>

                <div className="hl-grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3.5 relative z-10">
                  {SCAN_TO_JOB_MILESTONES.map((node, idx) => {
                    const NodeIcon = node.icon;
                    const isSelected = idx === activeJourneyIdx;
                    const isCompleted = idx < activeJourneyIdx;
                    return (
                      <button
                        key={node.id}
                        type="button"
                        onClick={() => {
                          setAutoPlayJourney(false);
                          setActiveJourneyIdx(idx);
                        }}
                        aria-pressed={isSelected}
                        className={`group text-left p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between gap-3 ${
                          isSelected
                            ? 'border-[#4F46E5] bg-[#EEF2FF]/70 dark:bg-indigo-950/50 ring-2 ring-[#4F46E5]/25 huddle-float-subtle'
                            : isCompleted
                            ? `${subtleSurface} border-emerald-500/40`
                            : `${subtleSurface} hover:border-[#4F46E5]/60`
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={`w-11 h-11 rounded-xl flex items-center justify-center transition-colors ${
                              isSelected
                                ? 'bg-[#4F46E5] text-white shadow-xs'
                                : isCompleted
                                ? 'bg-emerald-600 text-white'
                                : darkMode
                                ? 'bg-slate-900 text-indigo-300 border border-slate-700'
                                : 'bg-white text-[#4F46E5] border border-[#E5E7EB]'
                            }`}
                          >
                            <NodeIcon className="w-5 h-5" />
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                              idx === SCAN_TO_JOB_MILESTONES.length - 1 && isSelected
                                ? 'text-white'
                                : isSelected
                                ? 'bg-[#4F46E5] text-white'
                                : darkMode
                                ? 'bg-slate-900 text-slate-300'
                                : 'bg-white text-slate-600 border border-[#E5E7EB]'
                            }`}
                            style={
                              idx === SCAN_TO_JOB_MILESTONES.length - 1 && isSelected
                                ? { backgroundColor: '#0CA30C' }
                                : undefined
                            }
                          >
                            {node.badge}
                          </span>
                        </div>

                        <div>
                          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            {node.stage} • {node.readiness}% Readiness
                          </div>
                          <div className="text-xs font-extrabold mt-0.5 leading-snug">
                            {node.title}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Active Stage Inspector: Seeker Problem + Recruiter Problem -> Huddle Bridge */}
              <div
                className={`p-5 sm:p-6 rounded-2xl border hl-grid grid-cols-1 lg:grid-cols-12 gap-6 items-center ${subtleSurface}`}
              >
                <div className="lg:col-span-8 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded-full bg-[#4F46E5] text-white text-[11px] font-bold">
                        {activeMilestone.stage}: {activeMilestone.title}
                      </span>
                      <span
                        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold text-white"
                        style={{ backgroundColor: '#0CA30C' }}
                      >
                        <Check className="w-3 h-3" />
                        {activeMilestone.verifiedArtifact}
                      </span>
                    </div>
                    <span className="text-xs font-bold text-[#4F46E5]">
                      Profile Readiness: {activeMilestone.readiness}%
                      {activeMilestone.readiness >= 70 ? ' (70% Gate Met)' : ''}
                    </span>
                  </div>

                  {/* Two-Sided Problem Connection */}
                  <div className="hl-grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    <div
                      className={`p-3.5 rounded-xl border space-y-1 ${
                        darkMode
                          ? 'bg-slate-900 border-slate-700'
                          : 'bg-white border-[#E5E7EB]'
                      }`}
                    >
                      <div className="text-[10px] font-extrabold uppercase tracking-wider text-amber-600">
                        Job Seeker Problem
                      </div>
                      <p className="text-xs leading-relaxed">
                        {activeMilestone.seekerProblem}
                      </p>
                    </div>

                    <div
                      className={`p-3.5 rounded-xl border space-y-1 ${
                        darkMode
                          ? 'bg-slate-900 border-slate-700'
                          : 'bg-white border-[#E5E7EB]'
                      }`}
                    >
                      <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#4F46E5]">
                        Recruiter Problem
                      </div>
                      <p className="text-xs leading-relaxed">
                        {activeMilestone.recruiterProblem}
                      </p>
                    </div>
                  </div>

                  {/* How Huddle Connects Both Sides */}
                  <div
                    className={`p-3.5 rounded-xl border border-[#4F46E5]/40 flex items-start gap-2.5 ${
                      darkMode ? 'bg-indigo-950/40' : 'bg-[#EEF2FF]/75'
                    }`}
                  >
                    <Layers className="w-4 h-4 text-[#4F46E5] shrink-0 mt-0.5" />
                    <p className="text-xs sm:text-sm font-semibold leading-relaxed">
                      {activeMilestone.huddleBridge}
                    </p>
                  </div>
                </div>

                {/* Right Live Score Ring & Quick Action */}
                <div
                  className={`lg:col-span-4 p-4 rounded-2xl border flex flex-col items-center text-center gap-3 ${
                    darkMode
                      ? 'bg-slate-900 border-slate-700'
                      : 'bg-white border-[#E5E7EB]'
                  }`}
                >
                  <AtsScoreRing
                    score={activeMilestone.score}
                    size={104}
                    strokeWidth={9}
                    darkMode={darkMode}
                  />
                  <div>
                    <div className="text-xs font-extrabold">
                      {activeMilestone.score >= 80
                        ? 'Ready for Recruiter Match'
                        : activeMilestone.score >= 70
                        ? 'Almost Ready: Fix Gaps'
                        : 'Initial Scan: Needs Keywords'}
                    </div>
                    <p className={`text-[11px] mt-0.5 ${mutedText}`}>
                      Synced across profile, job board &amp; video call
                    </p>
                  </div>
                  <div className="flex flex-wrap justify-center gap-2 w-full pt-1">
                    <a
 href={pathForRoute('job-seekers')}
 onClick={(e) => { e.preventDefault(); navigateTo('job-seekers'); }}
                      className="px-3 py-1.5 rounded-xl bg-[#4F46E5] hover:bg-[#5B46E8] text-white text-[11px] font-bold cursor-pointer"
                    >
                      Job Seeker Flow
                    </a>
                    <a
 href={pathForRoute('recruiters')}
 onClick={(e) => { e.preventDefault(); navigateTo('recruiters'); }}
                      className={`px-3 py-1.5 rounded-xl border text-[11px] font-bold cursor-pointer ${subtleSurface}`}
                    >
                      Recruiter Flow
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ------------------------------------------------------------------
              SECTION 3 & 4: HOW IT WORKS (JOB SEEKERS & RECRUITERS, 4 STEPS EACH)
             ------------------------------------------------------------------ */}
          <section
            id="how-it-works"
            className={`border-y py-16 space-y-14 ${
              darkMode
                ? 'border-slate-800 bg-slate-900/40'
                : 'border-[#E5E7EB] bg-white'
            }`}
          >
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-14">
              {/* Track Switcher Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs font-bold uppercase tracking-wider text-[#4F46E5]">
                  Two-Sided Problem → Live Connection Workflows
                </div>
                <div className="flex items-center gap-1.5 p-1 rounded-xl border border-[#E5E7EB] dark:border-slate-700 bg-[#F8F9FB] dark:bg-slate-900">
                  {[
                    { id: 'both', label: 'Both Tracks (01–04)' },
                    { id: 'seekers', label: 'Job Seekers Only' },
                    { id: 'recruiters', label: 'Recruiters Only' },
                  ].map((trk) => (
                    <button
                      key={trk.id}
                      type="button"
                      onClick={() => setActiveWorkflowTrack(trk.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                        activeWorkflowTrack === trk.id
                          ? 'bg-[#4F46E5] text-white'
                          : `${mutedText}`
                      }`}
                    >
                      {trk.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Section 3: For Job Seekers */}
              {(activeWorkflowTrack === 'both' || activeWorkflowTrack === 'seekers') && (
                <div className="space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
                    <div>
                      <span className="text-xs font-bold uppercase tracking-wider text-[#4F46E5]">
                        For Job Seekers
                      </span>
                      <h2 className="text-2xl font-extrabold tracking-tight mt-1">
                        How Huddle works for you
                      </h2>
                    </div>
                    <a
 href={pathForRoute('job-seekers')}
 onClick={(e) => { e.preventDefault(); navigateTo('job-seekers'); }}
                      className="text-xs font-bold text-[#4F46E5] hover:underline inline-flex items-center gap-1 cursor-pointer"
                    >
                      <span>Explore all job seeker tools</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </a>
                  </div>

                  <div className="hl-grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                    {JOB_SEEKER_STEPS.map((st, idx) => {
                      const IconComp = st.icon;
                      const isStepActive = highlightedStepNum === idx + 1;
                      return (
                        <div
                          key={st.num}
                          onMouseEnter={() => setHighlightedStepNum(idx + 1)}
                          className={`border rounded-2xl p-5 space-y-3 transition-all ${cardSurface} ${
                            isStepActive
                              ? 'border-[#4F46E5] ring-2 ring-[#4F46E5]/15 huddle-float-subtle'
                              : ''
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div
                              className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
                                isStepActive
                                  ? 'bg-[#4F46E5] text-white'
                                  : 'bg-[#EEF2FF] text-[#4F46E5]'
                              }`}
                            >
                              <IconComp className="w-5 h-5" />
                            </div>
                            <span
                              className={`px-2 py-0.5 rounded-full text-xs font-extrabold ${
                                isStepActive
                                  ? 'bg-[#EEF2FF] text-[#4F46E5]'
                                  : 'text-slate-400'
                              }`}
                            >
                              {st.num}
                            </span>
                          </div>
                          <h3 className="text-sm font-bold">{st.title}</h3>
                          <p className={`text-xs leading-relaxed ${mutedText}`}>
                            {st.desc}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Section 4: For Recruiters */}
              {(activeWorkflowTrack === 'both' ||
                activeWorkflowTrack === 'recruiters') && (
                <div
                  className={`space-y-6 ${
                    activeWorkflowTrack === 'both'
                      ? 'pt-6 border-t border-slate-200/60 dark:border-slate-800'
                      : ''
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
                    <div>
                      <span className="text-xs font-bold uppercase tracking-wider text-[#4F46E5]">
                        For Recruiters &amp; Companies
                      </span>
                      <h2 className="text-2xl font-extrabold tracking-tight mt-1">
                        How Huddle works for your team
                      </h2>
                    </div>
                    <a
 href={pathForRoute('recruiters')}
 onClick={(e) => { e.preventDefault(); navigateTo('recruiters'); }}
                      className="text-xs font-bold text-[#4F46E5] hover:underline inline-flex items-center gap-1 cursor-pointer"
                    >
                      <span>Explore recruiter console &amp; video calls</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </a>
                  </div>

                  <div className="hl-grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                    {RECRUITER_STEPS.map((st, idx) => {
                      const IconComp = st.icon;
                      const isStepActive = highlightedStepNum === idx + 1;
                      return (
                        <div
                          key={st.num}
                          onMouseEnter={() => setHighlightedStepNum(idx + 1)}
                          className={`border rounded-2xl p-5 space-y-3 transition-all ${cardSurface} ${
                            isStepActive
                              ? 'border-[#4F46E5] ring-2 ring-[#4F46E5]/15 huddle-float-subtle'
                              : ''
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div
                              className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
                                isStepActive
                                  ? 'bg-[#4F46E5] text-white'
                                  : 'bg-[#EEF2FF] text-[#4F46E5]'
                              }`}
                            >
                              <IconComp className="w-5 h-5" />
                            </div>
                            <span
                              className={`px-2 py-0.5 rounded-full text-xs font-extrabold ${
                                isStepActive
                                  ? 'bg-[#EEF2FF] text-[#4F46E5]'
                                  : 'text-slate-400'
                              }`}
                            >
                              {st.num}
                            </span>
                          </div>
                          <h3 className="text-sm font-bold">{st.title}</h3>
                          <p className={`text-xs leading-relaxed ${mutedText}`}>
                            {st.desc}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* ------------------------------------------------------------------
              SECTION 5: INTERACTIVE AI CV BUILDER SHOWCASE
             ------------------------------------------------------------------ */}
          <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 space-y-8">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-wider text-[#4F46E5]">
                  AI CV Builder (Chat)
                </span>
                <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                  No long forms. No English pressure. Just tap and talk.
                </h2>
                <p className={`text-sm max-w-2xl ${mutedText}`}>
                  Answer 3 simple questions or tap suggestion chips. Missing numbers stay as clear placeholders like{' '}
                  <code className="text-[#4F46E5] font-bold">[X calls/day]</code>{' '}
                  for you to fill in, Huddle never invents facts.
                </p>
              </div>

              {/* Profession Switcher Pills */}
              <div className="flex flex-wrap gap-1.5">
                {Object.values(AI_BUILDER_PROFILES).map((prof) => (
                  <button
                    key={prof.id}
                    type="button"
                    onClick={() => handleSelectBuilderProfile(prof.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                      selectedBuilderKey === prof.id
                        ? 'bg-[#4F46E5] text-white border-[#4F46E5]'
                        : `${cardSurface} ${mutedText} hover:border-[#4F46E5]`
                    }`}
                  >
                    {prof.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="hl-grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
              {/* Left 5 Cols: Interactive Chat Mock-up */}
              <div
                className={`lg:col-span-5 border rounded-2xl p-5 flex flex-col justify-between gap-4 ${cardSurface}`}
              >
                <div className="space-y-3.5">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-200/60 dark:border-slate-800">
                    <div className="flex items-center gap-2">
                      <Bot className="w-4 h-4 text-[#4F46E5]" />
                      <span className="text-xs font-bold">Huddle AI CV Chat</span>
                    </div>
                    <span className="text-[11px] font-semibold text-[#4F46E5]">
                      Tap chips below
                    </span>
                  </div>

                  {/* User Selection Bubble */}
                  <div className="flex justify-end">
                    <div className="px-3.5 py-2 rounded-2xl rounded-br-sm bg-[#4F46E5] text-white text-xs font-semibold">
                      I&apos;m applying for: {activeBuilder.label}
                    </div>
                  </div>

                  {/* AI Short Question Bubble */}
                  <div className={`p-3.5 rounded-2xl rounded-bl-sm border text-xs leading-relaxed ${subtleSurface}`}>
                    {activeBuilder.aiQuestion}
                  </div>

                  {/* Tappable Suggestion Chips */}
                  <div className="space-y-1.5">
                    <div className={`text-[11px] font-semibold ${mutedText}`}>
                      Tap to include in your CV:
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {activeBuilder.chips.map((chip) => {
                        const active = selectedChips.includes(chip);
                        return (
                          <button
                            key={chip}
                            type="button"
                            onClick={() => toggleBuilderChip(chip)}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                              active
                                ? 'bg-[#4F46E5] text-white border-[#4F46E5]'
                                : `${subtleSurface} hover:border-[#4F46E5]`
                            }`}
                          >
                            {active ? (
                              <Check className="w-3.5 h-3.5" />
                            ) : (
                              <Plus className="w-3.5 h-3.5" />
                            )}
                            <span>{chip}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <a
 href="/register"
                  className="block w-full text-center py-2.5 rounded-xl bg-[#4F46E5] hover:bg-[#5B46E8] text-white text-xs font-bold transition-colors cursor-pointer"
                >
                  Build my CV free
                </a>
              </div>

              {/* Right 7 Cols: Live-Filling ATS CV Preview */}
              <div className={`lg:col-span-7 border rounded-2xl p-6 space-y-4 ${cardSurface}`}>
                <div className="flex items-start justify-between gap-2 pb-3 border-b border-slate-200/60 dark:border-slate-800">
                  <div>
                    <h3 className="text-base font-extrabold">{activeBuilder.name}</h3>
                    <p className="text-xs font-bold text-[#4F46E5]">
                      {activeBuilder.role}
                    </p>
                  </div>
                  <span className="px-2.5 py-1 rounded-lg bg-[#EEF2FF] text-[#4F46E5] text-[11px] font-bold">
                    Live ATS preview
                  </span>
                </div>

                <div className="space-y-1">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Summary
                  </div>
                  <p className={`text-xs leading-relaxed ${mutedText}`}>
                    {activeBuilder.summary}
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Experience Bullets (Honest AI with [placeholders])
                  </div>
                  {selectedChips.length > 0 ? (
                    <ul className="space-y-2">
                      {selectedChips.map((chip) => (
                        <li
                          key={chip}
                          className={`p-3 rounded-xl border text-xs leading-relaxed flex items-start gap-2 ${subtleSurface}`}
                        >
                          <CheckCircle2
                            className="w-4 h-4 shrink-0 mt-0.5"
                            style={{ color: '#0CA30C' }}
                          />
                          <span>{activeBuilder.bullets[chip]}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className={`p-4 rounded-xl border border-dashed text-xs ${mutedText}`}>
                      Tap any suggestion chip on the left to watch bullets generate here.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* ------------------------------------------------------------------
              SECTION 6: LIVE ATS ANALYZER SHOWCASE
             ------------------------------------------------------------------ */}
          <section
            className={`border-y py-16 ${
              darkMode
                ? 'border-slate-800 bg-slate-900/40'
                : 'border-[#E5E7EB] bg-white'
            }`}
          >
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="hl-grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
                <div className="lg:col-span-5 space-y-4">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#4F46E5]">
                    Live ATS Score (0–100)
                  </span>
                  <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                    See what a job needs and fix missing keywords in one tap.
                  </h2>
                  <p className={`text-sm leading-relaxed ${mutedText}`}>
                    Your ATS score updates instantly as you add or remove skills. Tap the dashed missing keyword chips on the right to see your score climb and unlock the 70% readiness gate.
                  </p>
                  <button
                    type="button"
                    onClick={handleResetAtsDemo}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-[#4F46E5] hover:underline cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Reset keyword demo</span>
                  </button>
                </div>

                {/* Interactive ATS Card */}
                <div className="lg:col-span-7">
                  <div className={`border rounded-2xl p-6 space-y-6 ${cardSurface}`}>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-200/60 dark:border-slate-800">
                      <div className="flex items-center gap-4">
                        <AtsScoreRing
                          score={liveAtsScore}
                          size={96}
                          strokeWidth={9}
                          darkMode={darkMode}
                        />
                        <div>
                          <div className="text-sm font-extrabold">
                            Target Role: Customer Support Specialist
                          </div>
                          <div className="mt-1">
                            {liveAtsScore >= 80 ? (
                              <span
                                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold text-white"
                                style={{ backgroundColor: '#0CA30C' }}
                              >
                                <Check className="w-3.5 h-3.5" />
                                Ready to apply
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900">
                                Almost ready: tap a missing keyword
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Matched Keywords (Green Chips) */}
                    <div className="space-y-2">
                      <div className="text-xs font-bold">
                        Matched keywords ({matchedKeywords.length})
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {matchedKeywords.map((kw) => (
                          <span
                            key={kw}
                            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 border border-emerald-200 text-emerald-800"
                          >
                            <Check className="w-3.5 h-3.5 text-[#0CA30C]" />
                            <span>{kw}</span>
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Missing Keywords (Dashed Chips — Tap to Add) */}
                    <div className="space-y-2">
                      <div className="text-xs font-bold">
                        Missing: tap to add
                      </div>
                      {missingKeywords.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {missingKeywords.map((kwObj) => (
                            <button
                              key={kwObj.label}
                              type="button"
                              onClick={() => handleAddMissingKeyword(kwObj)}
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border border-dashed transition-all cursor-pointer ${
                                darkMode
                                  ? 'border-indigo-400 text-indigo-300 hover:bg-indigo-950/60'
                                  : 'border-[#4F46E5] text-[#4F46E5] hover:bg-[#EEF2FF]'
                              }`}
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>{kwObj.label}</span>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs font-semibold text-[#0CA30C]">
                          All target keywords added! Your CV is ready to send.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ------------------------------------------------------------------
              SECTION 7: PERMANENT PUBLIC CV LINK ("One link for your CV. Share it anywhere.")
             ------------------------------------------------------------------ */}
          <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 space-y-10">
            <div className="max-w-2xl space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#4F46E5]">
                Permanent Public CV Link
              </span>
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                One link for your CV. Share it anywhere.
              </h2>
              <p className={`text-sm leading-relaxed ${mutedText}`}>
                Stop attaching files. Share a link that always shows your latest CV, on WhatsApp, LinkedIn, email or a visiting card.
              </p>
            </div>

            <div className="hl-grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* Left 7 Cols: Step-by-Step Guide & Interactive Controls */}
              <div className={`lg:col-span-7 border rounded-2xl p-6 space-y-6 ${cardSurface}`}>
                {/* 3 Ways to Create */}
                <div className="space-y-2">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    How to create your CV (choose any one)
                  </div>
                  <div className="hl-grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                    <div className={`p-3 rounded-xl border ${subtleSurface}`}>
                      <span className="font-extrabold text-[#4F46E5]">A.</span>{' '}
                      <span className="font-bold">Upload existing CV:</span>{' '}
                      <span className={mutedText}>
                        Huddle reads it and fills everything automatically.
                      </span>
                    </div>
                    <div className={`p-3 rounded-xl border ${subtleSurface}`}>
                      <span className="font-extrabold text-[#4F46E5]">B.</span>{' '}
                      <span className="font-bold">Chat with AI CV Builder:</span>{' '}
                      <span className={mutedText}>
                        Answer 3 questions or tap suggestions.
                      </span>
                    </div>
                    <div className={`p-3 rounded-xl border ${subtleSurface}`}>
                      <span className="font-extrabold text-[#4F46E5]">C.</span>{' '}
                      <span className="font-bold">Start from a template:</span>{' '}
                      <span className={mutedText}>
                        Pick 1 of 10 templates and type your details.
                      </span>
                    </div>
                  </div>
                </div>

                {/* Numbered Steps 1 to 4 */}
                <ol className="space-y-2.5 text-xs sm:text-sm">
                  <li className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-[#EEF2FF] text-[#4F46E5] font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                      1
                    </span>
                    <span>Pick one of 10 templates and check the live preview.</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-[#EEF2FF] text-[#4F46E5] font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                      2
                    </span>
                    <span>
                      Make sure your mobile number is on the CV; it becomes your link.
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-[#EEF2FF] text-[#4F46E5] font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                      3
                    </span>
                    <span>
                      Click <strong>&ldquo;Public link&rdquo;</strong> →{' '}
                      <strong>&ldquo;Publish my CV&rdquo;</strong>.
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-[#EEF2FF] text-[#4F46E5] font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                      4
                    </span>
                    <span>
                      Your link is ready: <strong>huddle.app/&lt;your mobile number&gt;</strong>. Copy it with one click.
                    </span>
                  </li>
                </ol>

                {/* Interactive Mobile Number -> Live Link Simulator */}
                <div className={`p-4 rounded-2xl border space-y-3 ${subtleSurface}`}>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <label
                      htmlFor="public-mobile-input"
                      className="text-xs font-bold"
                    >
                      Try your mobile number:
                    </label>
                    <input
                      id="public-mobile-input"
                      type="text"
                      value={publicMobile}
                      onChange={(e) => {
                        setPublicMobile(e.target.value);
                        setHasUnpublishedEdit(true);
                      }}
                      className={`px-3 py-1.5 rounded-xl border text-xs font-mono ${
                        darkMode
                          ? 'bg-slate-900 border-slate-700 text-white'
                          : 'bg-white border-[#E5E7EB] text-slate-900'
                      }`}
                    />
                  </div>

                  {/* Generated Link + One-Click Copy */}
                  <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-white dark:bg-slate-900 border border-[#C7D2FE] dark:border-slate-700">
                    <div className="flex items-center gap-2 min-w-0">
                      <Link2 className="w-4 h-4 text-[#4F46E5] shrink-0" />
                      <span className="text-xs font-mono font-bold text-[#4F46E5] truncate">
                        {isPublicPublished ? publicShareUrl : 'Link turned off'}
                      </span>
                    </div>

                    <button
                      type="button"
                      disabled={!isPublicPublished}
                      onClick={handleCopyPublicUrl}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#4F46E5] hover:bg-[#5B46E8] disabled:opacity-40 text-white text-xs font-bold cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>{copiedPublicUrl ? 'Copied!' : 'Copy link'}</span>
                    </button>
                  </div>

                  {/* You Stay in Control Toggles */}
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {!isPublicPublished ? (
                      <button
                        type="button"
                        onClick={() => {
                          setIsPublicPublished(true);
                          setHasUnpublishedEdit(false);
                        }}
                        className="px-3 py-1.5 rounded-xl bg-[#4F46E5] text-white text-xs font-bold cursor-pointer"
                      >
                        Publish my CV
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => setHasUnpublishedEdit(false)}
                          className="px-3 py-1.5 rounded-xl bg-[#EEF2FF] text-[#4F46E5] text-xs font-bold cursor-pointer"
                        >
                          {hasUnpublishedEdit
                            ? 'Update public CV'
                            : 'Public CV up to date'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsPublicPublished(false)}
                          className="px-3 py-1.5 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 text-xs font-bold cursor-pointer"
                        >
                          Turn off link
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Privacy & Control Bullet Summary */}
                <ul className={`hl-grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs ${mutedText}`}>
                  <li>• Edits stay private until you press &ldquo;Update public CV&rdquo;.</li>
                  <li>• Change your number and the link moves automatically.</li>
                  <li>• &ldquo;Turn off link&rdquo; removes it instantly.</li>
                  <li>• Not indexed by Google; each number belongs to one member.</li>
                </ul>
              </div>

              {/* Right 5 Cols: Phone Preview + WhatsApp Share Bubble */}
              <div className="lg:col-span-5 space-y-4">
                {/* WhatsApp-style chat bubble sharing the link */}
                <div
                  className={`p-4 rounded-2xl bg-[#DCF8C6] text-slate-900 border border-emerald-300 shadow-2xs max-w-sm ml-auto transition-transform duration-300 ${
                    whatsappPulseActive ? 'scale-[1.02] huddle-orbit-pulse' : ''
                  }`}
                >
                  <div className="text-[10px] font-bold uppercase text-emerald-800 mb-1">
                    WhatsApp / Message Share • Template #{selectedTemplateIdx + 1}
                  </div>
                  <p className="text-xs leading-relaxed">
                    Hi! Here is my latest CV link (no file attachment needed, PDF download is right on the page):{' '}
                    <span className="font-mono font-bold underline text-[#4F46E5]">
                      https://{publicShareUrl}
                    </span>
                  </p>
                </div>

                {/* Mobile Phone Frame Showing the Public CV Page */}
                <div
                  className={`max-w-sm mx-auto border-4 border-slate-800 rounded-[28px] p-4 shadow-md ${cardSurface}`}
                >
                  <div className="w-16 h-1.5 rounded-full bg-slate-300 dark:bg-slate-700 mx-auto mb-3" />
                  {isPublicPublished ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-[10px] text-slate-400">
                        <span className="font-mono">{publicShareUrl}</span>
                        <span>No sign-in needed</span>
                      </div>

                      <div className={`p-3.5 rounded-2xl border ${subtleSurface} space-y-2`}>
                        <div className="text-sm font-extrabold">
                          Harish Kumar Verma
                        </div>
                        <div className="text-xs font-semibold text-[#4F46E5]">
                          UI / Front-End Developer &amp; Module Lead
                        </div>
                        <p className={`text-[11px] leading-relaxed ${mutedText}`}>
                          Bengaluru, India • Angular, React, TypeScript, Micro-Frontends
                        </p>
                        <div className="pt-2">
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#4F46E5] text-white text-[11px] font-bold">
                            <Download className="w-3.5 h-3.5" />
                            <span>Download PDF</span>
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="py-10 text-center space-y-1">
                      <Lock className="w-5 h-5 text-slate-400 mx-auto" />
                      <div className="text-xs font-bold">Public link is turned off</div>
                      <p className={`text-[11px] ${mutedText}`}>
                        Visitors cannot view this page until you publish it again.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* ------------------------------------------------------------------
              SECTION 8: BUILT FOR EVERY PROFESSION (7 CARDS, 3 KEYWORDS EACH)
             ------------------------------------------------------------------ */}
          <section
            className={`border-y py-16 ${
              darkMode
                ? 'border-slate-800 bg-slate-900/40'
                : 'border-[#E5E7EB] bg-white'
            }`}
          >
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
              <div className="max-w-2xl space-y-2">
                <span className="text-xs font-bold uppercase tracking-wider text-[#4F46E5]">
                  Every Industry &amp; Career Stage
                </span>
                <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                  Built for every profession
                </h2>
                <p className={`text-sm ${mutedText}`}>
                  Whether you work in a hospital ward, commercial kitchen, call centre, retail store, or software team, Huddle checks the keywords recruiters actually look for.
                </p>
              </div>

              <div className="hl-grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {PROFESSIONS_GRID.map((item) => (
                  <div
                    key={item.title}
                    className={`border rounded-2xl p-5 space-y-3 ${cardSurface}`}
                  >
                    <h3 className="text-sm font-extrabold">{item.title}</h3>
                    <div className="flex flex-wrap gap-1.5">
                      {item.keywords.map((kw) => (
                        <span
                          key={kw}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border ${
                            darkMode
                              ? 'bg-slate-800 border-slate-700 text-indigo-300'
                              : 'bg-[#EEF2FF] border-[#C7D2FE] text-[#4F46E5]'
                          }`}
                        >
                          {kw}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ------------------------------------------------------------------
              SECTION 9: HONEST AI + EXPERT CV REVIEW PREVIEW + 7 LANGUAGES
             ------------------------------------------------------------------ */}
          <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 space-y-8">
            <div className="hl-grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
              {/* Honest AI Card (6 Cols) */}
              <div className={`lg:col-span-6 border rounded-2xl p-6 space-y-4 ${cardSurface}`}>
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#EEF2FF] text-[#4F46E5] text-xs font-bold">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Honest AI</span>
                </div>
                <h2 className="text-2xl font-extrabold tracking-tight">
                  Our AI improves your words, never your facts.
                </h2>
                <p className={`text-sm leading-relaxed ${mutedText}`}>
                  Huddle never invents employers, dates, degrees, or fake numbers. When a metric is missing, it inserts clear placeholders like{' '}
                  <code className="font-bold text-[#4F46E5]">[X calls/day]</code>{' '}
                  or <code className="font-bold text-[#4F46E5]">[X%]</code> so you stay in control and approve every line.
                </p>
                <div className="pt-2 border-t border-slate-200/60 dark:border-slate-800 flex flex-wrap items-center gap-2 text-xs">
                  <Globe className="w-4 h-4 text-[#4F46E5]" />
                  <span className="font-bold">7 languages &amp; local currency:</span>
                  <span className={mutedText}>{SUPPORTED_LANGUAGES.join(' · ')}</span>
                </div>
              </div>

              {/* Expert CV Review (Preview) Card (6 Cols) */}
              <div className={`lg:col-span-6 border rounded-2xl p-6 space-y-4 ${cardSurface}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-900 text-xs font-bold">
                    <CalendarIcon className="w-3.5 h-3.5" />
                    <span>Preview • Expert CV review</span>
                  </span>
                  <span className="text-xs font-bold text-[#4F46E5]">30 minutes</span>
                </div>

                <h3 className="text-xl font-extrabold tracking-tight">
                  Structured 30-minute session with a career specialist
                </h3>

                <div className="hl-grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                  <div className={`p-3 rounded-xl border ${subtleSurface}`}>
                    <span className="font-bold text-[#4F46E5]">00–05 min:</span>{' '}
                    Role alignment
                  </div>
                  <div className={`p-3 rounded-xl border ${subtleSurface}`}>
                    <span className="font-bold text-[#4F46E5]">05–20 min:</span>{' '}
                    Live bullet crafting
                  </div>
                  <div className={`p-3 rounded-xl border ${subtleSurface}`}>
                    <span className="font-bold text-[#4F46E5]">20–27 min:</span>{' '}
                    ATS polish
                  </div>
                  <div className={`p-3 rounded-xl border ${subtleSurface}`}>
                    <span className="font-bold text-[#4F46E5]">27–30 min:</span>{' '}
                    Action plan
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ------------------------------------------------------------------
              SECTION 11: GET STARTED (SIGN-UP FORM → /register)
             ------------------------------------------------------------------ */}
          <section
            id="get-started"
            className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16"
          >
            <div className={`border rounded-2xl p-6 sm:p-10 shadow-xs space-y-6 ${cardSurface}`}>
              <div className="space-y-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#EEF2FF] text-[#4F46E5] text-xs font-bold">
                  Get started
                </span>
                <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                  Create your Huddle account
                </h2>
                <p className={`text-sm leading-relaxed ${mutedText}`}>
                  For job seekers and recruiters across IT, healthcare, hospitality, customer support and more. Tell us who you are and we&apos;ll set up your account.
                </p>
              </div>

              {(
                <form onSubmit={handleSignupSubmit} className="space-y-4">
                  <div className="hl-grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="signup-name" className="block text-xs font-bold mb-1">
                        Name
                      </label>
                      <input
                        id="signup-name"
                        type="text"
                        required
                        value={signupForm.name}
                        onChange={(e) =>
                          setSignupForm({ ...signupForm, name: e.target.value })
                        }
                        placeholder="Your full name"
                        className={`w-full px-3.5 py-2.5 rounded-xl border text-xs focus:outline-none focus:ring-2 focus:ring-[#4F46E5] ${
                          darkMode
                            ? 'bg-slate-800 border-slate-700 text-white'
                            : 'bg-[#F8F9FB] border-[#E5E7EB] text-slate-900'
                        }`}
                      />
                    </div>

                    <div>
                      <label htmlFor="signup-email" className="block text-xs font-bold mb-1">
                        Email
                      </label>
                      <input
                        id="signup-email"
                        type="email"
                        required
                        value={signupForm.email}
                        onChange={(e) =>
                          setSignupForm({ ...signupForm, email: e.target.value })
                        }
                        placeholder="you@example.com"
                        className={`w-full px-3.5 py-2.5 rounded-xl border text-xs focus:outline-none focus:ring-2 focus:ring-[#4F46E5] ${
                          darkMode
                            ? 'bg-slate-800 border-slate-700 text-white'
                            : 'bg-[#F8F9FB] border-[#E5E7EB] text-slate-900'
                        }`}
                      />
                    </div>

                    <div>
                      <label htmlFor="signup-role" className="block text-xs font-bold mb-1">
                        I am a
                      </label>
                      <select
                        id="signup-role"
                        value={signupForm.roleType}
                        onChange={(e) =>
                          setSignupForm({ ...signupForm, roleType: e.target.value })
                        }
                        className={`w-full px-3.5 py-2.5 rounded-xl border text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#4F46E5] ${
                          darkMode
                            ? 'bg-slate-800 border-slate-700 text-white'
                            : 'bg-[#F8F9FB] border-[#E5E7EB] text-slate-900'
                        }`}
                      >
                        <option value="Job seeker">Job seeker</option>
                        <option value="Learner">Learner / Student</option>
                        <option value="Recruiter">Recruiter</option>
                      </select>
                    </div>

                    <div>
                      <label htmlFor="signup-industry" className="block text-xs font-bold mb-1">
                        Industry
                      </label>
                      <select
                        id="signup-industry"
                        value={signupForm.industry}
                        onChange={(e) =>
                          setSignupForm({ ...signupForm, industry: e.target.value })
                        }
                        className={`w-full px-3.5 py-2.5 rounded-xl border text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#4F46E5] ${
                          darkMode
                            ? 'bg-slate-800 border-slate-700 text-white'
                            : 'bg-[#F8F9FB] border-[#E5E7EB] text-slate-900'
                        }`}
                      >
                        <option value="IT & Software">IT &amp; Software</option>
                        <option value="Healthcare">Healthcare</option>
                        <option value="Hospitality & Chefs">Hospitality &amp; Chefs</option>
                        <option value="Customer Support & BPO">Customer Support &amp; BPO</option>
                        <option value="Retail, Sales & HR">Retail, Sales &amp; HR</option>
                      </select>
                    </div>

                    <div className="sm:col-span-2">
                      <label htmlFor="signup-city" className="block text-xs font-bold mb-1">
                        City
                      </label>
                      <input
                        id="signup-city"
                        type="text"
                        value={signupForm.city}
                        onChange={(e) =>
                          setSignupForm({ ...signupForm, city: e.target.value })
                        }
                        placeholder="e.g. Bengaluru, Mumbai, Delhi, Remote"
                        className={`w-full px-3.5 py-2.5 rounded-xl border text-xs focus:outline-none focus:ring-2 focus:ring-[#4F46E5] ${
                          darkMode
                            ? 'bg-slate-800 border-slate-700 text-white'
                            : 'bg-[#F8F9FB] border-[#E5E7EB] text-slate-900'
                        }`}
                      />
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
                    <button
                      type="submit"
                      className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-2xl bg-[#4F46E5] hover:bg-[#5B46E8] text-white text-xs sm:text-sm font-bold shadow-2xs transition-colors cursor-pointer"
                    >
                      <span>Continue to create account</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>

                    <p className={`text-xs ${mutedText}`}>
                      Takes about a minute. You can add or build your CV right after.
                    </p>
                  </div>
                </form>
              )}
            </div>
          </section>

          {/* ------------------------------------------------------------------
              SECTION 12: FAQ ACCORDION (ALL 9 EXACT QUESTIONS)
             ------------------------------------------------------------------ */}
          <section
            id="faq"
            className={`border-t py-16 ${
              darkMode
                ? 'border-slate-800 bg-slate-900/40'
                : 'border-[#E5E7EB] bg-white'
            }`}
          >
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
              <div className="space-y-1">
                <span className="text-xs font-bold uppercase tracking-wider text-[#4F46E5]">
                  FAQ
                </span>
                <h2 className="text-2xl font-extrabold tracking-tight">
                  Frequently asked questions
                </h2>
              </div>

              <div className="space-y-2.5">
                {FAQ_ITEMS.map((item, idx) => {
                  const isOpen = openFaqIdx === idx;
                  return (
                    <div
                      key={item.q}
                      className={`border rounded-2xl overflow-hidden ${cardSurface}`}
                    >
                      <button
                        type="button"
                        onClick={() => setOpenFaqIdx(isOpen ? -1 : idx)}
                        aria-expanded={isOpen}
                        className="w-full px-5 py-4 text-left flex items-center justify-between gap-4 text-xs sm:text-sm font-bold cursor-pointer"
                      >
                        <span>{item.q}</span>
                        <ChevronDown
                          className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${
                            isOpen ? 'rotate-180' : ''
                          }`}
                        />
                      </button>
                      {isOpen && (
                        <div className={`px-5 pb-4 text-xs sm:text-sm leading-relaxed ${mutedText}`}>
                          {item.a}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        </main>
      )}

      {/* ======================================================================
          ROUTE 2: /job-seekers (EXPANDED JOB SEEKER FEATURES & 10 TEMPLATES)
         ====================================================================== */}
      {activeRoute === 'job-seekers' && (
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-10">
          <div className={`border rounded-2xl p-6 sm:p-10 space-y-5 ${cardSurface}`}>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#EEF2FF] text-[#4F46E5] text-xs font-bold">
              For Job Seekers
            </span>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
              Upload once. Build a stronger CV. Apply with confidence.
            </h1>
            <p className={`text-sm sm:text-base max-w-3xl leading-relaxed ${mutedText}`}>
              Huddle reads your PDF, DOC, DOCX, or TXT resume, fills your profile without overwriting anything you typed yourself, scores every job against your skills, and connects you directly with recruiters on browser video calls.
            </p>
            <div className="flex flex-wrap gap-3">
              <a
 href="/register"
                className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-[#4F46E5] hover:bg-[#5B46E8] text-white text-xs sm:text-sm font-bold cursor-pointer"
              >
                <span>Build my CV free</span>
                <ArrowRight className="w-4 h-4" />
              </a>
              <a
                href={APP_URL}
                className={`inline-flex items-center gap-1.5 px-5 py-3 rounded-2xl border text-xs sm:text-sm font-bold ${cardSurface}`}
              >
                <span>Sign in</span>
                <ArrowUpRight className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* 10 Templates & PDF/CSV Export Preview */}
          <div className={`border rounded-2xl p-6 space-y-4 ${cardSurface}`}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-extrabold">
                  CV Generator: 10 ATS-Readable Templates
                </h2>
                <p className={`text-xs ${mutedText}`}>
                  Edit any section with live preview, then download as a pixel-accurate ATS PDF or CSV.
                </p>
              </div>
              <span className="text-xs font-bold text-[#4F46E5]">
                Selected: {CV_TEMPLATES_10[selectedTemplateIdx]}
              </span>
            </div>

            <div className="hl-grid grid-cols-2 sm:grid-cols-5 gap-2.5">
              {CV_TEMPLATES_10.map((tpl, i) => (
                <button
                  key={tpl}
                  type="button"
                  onClick={() => setSelectedTemplateIdx(i)}
                  className={`p-3 rounded-xl border text-left text-xs font-bold transition-all cursor-pointer ${
                    selectedTemplateIdx === i
                      ? 'bg-[#4F46E5] text-white border-[#4F46E5]'
                      : `${subtleSurface} hover:border-[#4F46E5]`
                  }`}
                >
                  {tpl}
                </button>
              ))}
            </div>
          </div>

          {/* Job Seeker 4 Steps */}
          <div className="hl-grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {JOB_SEEKER_STEPS.map((st) => {
              const IconComp = st.icon;
              return (
                <div
                  key={st.num}
                  className={`border rounded-2xl p-5 space-y-3 ${cardSurface}`}
                >
                  <div className="w-10 h-10 rounded-xl bg-[#EEF2FF] text-[#4F46E5] flex items-center justify-center">
                    <IconComp className="w-5 h-5" />
                  </div>
                  <h3 className="text-sm font-bold">{st.title}</h3>
                  <p className={`text-xs leading-relaxed ${mutedText}`}>{st.desc}</p>
                </div>
              );
            })}
          </div>
        </main>
      )}

      {/* ======================================================================
          ROUTE 3: /recruiters (RECRUITER CONSOLE FUNNEL + 1-CLICK VIDEO CALL)
         ====================================================================== */}
      {activeRoute === 'recruiters' && (
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-10">
          <div className={`border rounded-2xl p-6 sm:p-10 space-y-5 ${cardSurface}`}>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#EEF2FF] text-[#4F46E5] text-xs font-bold">
              For Recruiters &amp; Companies
            </span>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
              Complete, ATS-scored candidates and instant video calls in one screen.
            </h1>
            <p className={`text-sm sm:text-base max-w-3xl leading-relaxed ${mutedText}`}>
              Post roles in minutes or bulk import via JSON with automatic duplicate filtering. Every candidate clears 70% readiness with a CV attached, and you can talk face to face in the browser without scheduling links.
            </p>
            <div className="flex flex-wrap gap-3">
              <a
 href="/register?role=recruiter"
                className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-[#4F46E5] hover:bg-[#5B46E8] text-white text-xs sm:text-sm font-bold cursor-pointer"
              >
                <span>Start hiring</span>
                <ArrowRight className="w-4 h-4" />
              </a>
              <a
                href={RECRUITER_LOGIN_URL}
                className={`inline-flex items-center gap-1.5 px-5 py-3 rounded-2xl border text-xs sm:text-sm font-bold ${cardSurface}`}
              >
                <span>Open Recruiter Console</span>
                <ArrowUpRight className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* Interactive Recruiter Console & "Talk to candidates in one click" Video Mock-up */}
          <div className="hl-grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Hiring Funnel & Shortlist Console (7 Cols) */}
            <div className={`lg:col-span-7 border rounded-2xl p-6 space-y-5 ${cardSurface}`}>
              <div className="flex items-center justify-between">
                <h2 className="text-base font-extrabold">
                  Interactive Recruiter Console Funnel
                </h2>
                <span className="text-xs font-semibold text-[#4F46E5]">
                  Bulk JSON import ready
                </span>
              </div>

              {/* 4-Stage Hiring Funnel */}
              <div className="hl-grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center">
                <div className={`p-3 rounded-xl border ${subtleSurface}`}>
                  <div className="text-lg font-extrabold">4</div>
                  <div className={`text-[10px] font-bold uppercase ${mutedText}`}>
                    Jobs posted
                  </div>
                </div>
                <div className={`p-3 rounded-xl border ${subtleSurface}`}>
                  <div className="text-lg font-extrabold">
                    {recruiterApplicants.length}
                  </div>
                  <div className={`text-[10px] font-bold uppercase ${mutedText}`}>
                    Applicants
                  </div>
                </div>
                <div className={`p-3 rounded-xl border ${subtleSurface}`}>
                  <div className="text-lg font-extrabold text-[#0CA30C]">
                    {
                      recruiterApplicants.filter((c) => c.status === 'Shortlisted')
                        .length
                    }
                  </div>
                  <div className={`text-[10px] font-bold uppercase ${mutedText}`}>
                    Shortlisted
                  </div>
                </div>
                <div className={`p-3 rounded-xl border ${subtleSurface}`}>
                  <div className="text-lg font-extrabold text-slate-400">
                    {
                      recruiterApplicants.filter((c) => c.status === 'Not selected')
                        .length
                    }
                  </div>
                  <div className={`text-[10px] font-bold uppercase ${mutedText}`}>
                    Not selected
                  </div>
                </div>
              </div>

              {/* Candidate List with 1-Click Shortlist & Video Call */}
              <div className="space-y-3">
                {recruiterApplicants.map((cand) => (
                  <div
                    key={cand.id}
                    className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${subtleSurface}`}
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-extrabold">{cand.name}</span>
                        <span className="px-2 py-0.5 rounded-full bg-[#EEF2FF] text-[#4F46E5] text-[10px] font-bold">
                          ATS {cand.ats}/100
                        </span>
                        <span className="text-[10px] font-bold text-[#0CA30C]">
                          {cand.readiness}% profile
                        </span>
                      </div>
                      <div className={`text-xs ${mutedText}`}>
                        {cand.role} • {cand.skills.join(', ')}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => updateCandidateStatus(cand.id, 'Shortlisted')}
                        className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold cursor-pointer ${
                          cand.status === 'Shortlisted'
                            ? 'bg-emerald-600 text-white'
                            : 'bg-white dark:bg-slate-900 border border-[#E5E7EB] dark:border-slate-700'
                        }`}
                      >
                        {cand.status === 'Shortlisted' ? 'Shortlisted' : 'Shortlist'}
                      </button>

                      <button
                        type="button"
                        onClick={() => setActiveCallCandidate(cand)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#4F46E5] hover:bg-[#5B46E8] text-white text-[11px] font-bold cursor-pointer"
                      >
                        <Video className="w-3.5 h-3.5" />
                        <span>Video call</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right 5 Cols: "Talk to candidates in one click" In-Browser Video Tile */}
            <div className="lg:col-span-5 bg-slate-950 text-white rounded-2xl p-6 space-y-4 border border-slate-800">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-indigo-300">
                  Talk to candidates in one click
                </span>
                <span className="px-2 py-0.5 rounded bg-white/10 text-[10px] font-bold">
                  In-browser • No downloads
                </span>
              </div>

              <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-extrabold">
                      {activeCallCandidate
                        ? activeCallCandidate.name
                        : 'Harish Kumar Verma'}
                    </div>
                    <div className="text-xs text-slate-400">
                      {activeCallCandidate
                        ? `${activeCallCandidate.role} • ATS ${activeCallCandidate.ats}/100`
                        : 'UI / Front-End Developer • ATS 88/100'}
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">
                    <PhoneCall className="w-3 h-3" />
                    Connected live
                  </span>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed">
                  Review the candidate&apos;s synced CV alongside your live video tile. No third-party meeting links to copy, and works on phones too.
                </p>

                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setCallMuted(!callMuted)}
                    className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold cursor-pointer ${
                      callMuted ? 'bg-rose-600 text-white' : 'bg-slate-800 text-white'
                    }`}
                  >
                    {callMuted ? (
                      <MicOff className="w-3.5 h-3.5" />
                    ) : (
                      <Mic className="w-3.5 h-3.5" />
                    )}
                    <span>{callMuted ? 'Unmute' : 'Mic active'}</span>
                  </button>
                  <span className="text-[11px] text-slate-400">
                    Click &ldquo;Video call&rdquo; on any candidate card to switch
                  </span>
                </div>
              </div>
            </div>
          </div>
        </main>
      )}

      {/* ======================================================================
          ROUTE 4: /public-cv-link (FULL STEP-BY-STEP PERMANENT LINK GUIDE)
         ====================================================================== */}
      {activeRoute === 'public-cv-link' && (
        <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8">
          <div className={`border rounded-2xl p-6 sm:p-10 space-y-5 ${cardSurface}`}>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#EEF2FF] text-[#4F46E5] text-xs font-bold">
              Permanent Public CV Link
            </span>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
              One link for your CV. Share it anywhere.
            </h1>
            <p className={`text-sm sm:text-base leading-relaxed ${mutedText}`}>
              Stop attaching files. Share a link that always shows your latest CV, on WhatsApp, LinkedIn, email or a visiting card.
            </p>
            <div className="flex flex-wrap gap-3">
              <a
 href="/register"
                className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-[#4F46E5] hover:bg-[#5B46E8] text-white text-xs sm:text-sm font-bold cursor-pointer"
              >
                <span>Create my public CV link</span>
                <ArrowRight className="w-4 h-4" />
              </a>
            </div>
          </div>

          <div className={`border rounded-2xl p-6 sm:p-8 space-y-5 ${cardSurface}`}>
            <h2 className="text-lg font-extrabold">Step-by-step setup &amp; privacy controls</h2>
            <div className="hl-grid grid-cols-1 md:grid-cols-2 gap-4 text-xs sm:text-sm">
              <div className={`p-4 rounded-2xl border space-y-1.5 ${subtleSurface}`}>
                <div className="font-extrabold text-[#4F46E5]">Step 1 • Pick a template</div>
                <p className={mutedText}>
                  Choose from 10 ATS-readable templates after uploading your CV, chatting with the AI CV Builder, or typing your details.
                </p>
              </div>
              <div className={`p-4 rounded-2xl border space-y-1.5 ${subtleSurface}`}>
                <div className="font-extrabold text-[#4F46E5]">Step 2 • Add your mobile number</div>
                <p className={mutedText}>
                  Your mobile number becomes your unique URL: huddle.app/919876543210. Each number belongs to one member only.
                </p>
              </div>
              <div className={`p-4 rounded-2xl border space-y-1.5 ${subtleSurface}`}>
                <div className="font-extrabold text-[#4F46E5]">Step 3 • Publish &amp; share</div>
                <p className={mutedText}>
                  Click &ldquo;Public link&rdquo; → &ldquo;Publish my CV&rdquo;. Visitors view your CV and download a PDF with zero sign-in required.
                </p>
              </div>
              <div className={`p-4 rounded-2xl border space-y-1.5 ${subtleSurface}`}>
                <div className="font-extrabold text-[#4F46E5]">Step 4 • Stay in control</div>
                <p className={mutedText}>
                  Edits stay private until you press &ldquo;Update public CV&rdquo;. Turn off the link any time, and rest assured it is never indexed by Google.
                </p>
              </div>
            </div>
          </div>
        </main>
      )}

      {/* ======================================================================
          SECTION 13: FOOTER (Product, For Job Seekers, For Recruiters, Privacy, Contact, Sign in)
         ====================================================================== */}
      <footer
        className={`border-t py-12 ${
          darkMode
            ? 'border-slate-800 bg-slate-950 text-slate-400'
            : 'border-[#E5E7EB] bg-[#F8F9FB] text-slate-600'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
          <div className="hl-grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-6 text-xs">
            <div className="col-span-2 sm:col-span-3 lg:col-span-2 space-y-2">
              <div className={`hl-brandmark hl-brandmark--small ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                <Aperture open={0.42} className="mark" />
                <span>Huddle</span>
              </div>
              <p className="leading-relaxed max-w-xs">
                Upload once. Get matched. Talk face to face.
              </p>
            </div>

            <div className="space-y-2">
              <div className="font-bold text-slate-900 dark:text-white">Product</div>
              <ul className="space-y-1.5">
                <li>
                  <a
 href={pathForRoute('home') + '#community-network'}
 onClick={(e) => { e.preventDefault(); navigateTo('home', 'community-network'); }}
                    className="hover:text-[#4F46E5] cursor-pointer"
                  >
                    Community &amp; Feed
                  </a>
                </li>
                <li>
                  <a
 href={pathForRoute('home') + '#how-it-works'}
 onClick={(e) => { e.preventDefault(); navigateTo('home', 'how-it-works'); }}
                    className="hover:text-[#4F46E5] cursor-pointer"
                  >
                    How it works
                  </a>
                </li>
                <li>
                  <a
 href={pathForRoute('public-cv-link')}
 onClick={(e) => { e.preventDefault(); navigateTo('public-cv-link'); }}
                    className="hover:text-[#4F46E5] cursor-pointer"
                  >
                    Public CV link
                  </a>
                </li>
                <li>
                  <a
 href={pathForRoute('home') + '#faq'}
 onClick={(e) => { e.preventDefault(); navigateTo('home', 'faq'); }}
                    className="hover:text-[#4F46E5] cursor-pointer"
                  >
                    FAQ
                  </a>
                </li>
              </ul>
            </div>

            <div className="space-y-2">
              <div className="font-bold text-slate-900 dark:text-white">
                For Job Seekers
              </div>
              <ul className="space-y-1.5">
                <li>
                  <a
 href={pathForRoute('job-seekers')}
 onClick={(e) => { e.preventDefault(); navigateTo('job-seekers'); }}
                    className="hover:text-[#4F46E5] cursor-pointer"
                  >
                    AI CV Builder &amp; ATS
                  </a>
                </li>
                <li>
                  <a
 href="/register"
                    className="hover:text-[#4F46E5] cursor-pointer"
                  >
                    Build my CV free
                  </a>
                </li>
              </ul>
            </div>

            <div className="space-y-2">
              <div className="font-bold text-slate-900 dark:text-white">
                For Recruiters
              </div>
              <ul className="space-y-1.5">
                <li>
                  <a
 href={pathForRoute('recruiters')}
 onClick={(e) => { e.preventDefault(); navigateTo('recruiters'); }}
                    className="hover:text-[#4F46E5] cursor-pointer"
                  >
                    Recruiter Console
                  </a>
                </li>
                <li>
                  <a
 href="/register?role=recruiter"
                    className="hover:text-[#4F46E5] cursor-pointer"
                  >
                    Start hiring
                  </a>
                </li>
              </ul>
            </div>

            <div className="space-y-2">
              <div className="font-bold text-slate-900 dark:text-white">
                Trust &amp; Access
              </div>
              <ul className="space-y-1.5">
                <li>
                  <a
 href="/privacy"
                    className="hover:text-[#4F46E5] cursor-pointer"
                  >
                    Privacy
                  </a>
                </li>
                <li>
                  <a
 href="/about"
                    className="hover:text-[#4F46E5] cursor-pointer"
                  >
                    About Huddle
                  </a>
                </li>
                <li>
                  <a
                    href={APP_URL}
                    className="font-bold text-[#4F46E5] hover:underline inline-flex items-center gap-1"
                  >
                    <span>Sign in</span>
                    <ArrowUpRight className="w-3 h-3" />
                  </a>
                </li>
              </ul>
            </div>
          </div>

          <div className="pt-6 border-t border-slate-200/60 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px]">
            <span>© 2026 Huddle</span>
            <span>
              App sign-in:{' '}
              <a
                href={APP_URL}
                className="font-semibold text-[#4F46E5] hover:underline"
              >
                Sign in to Huddle
              </a>
            </span>
          </div>
        </div>
      </footer>
      </div>
    </div>
  );
}
// For the build-time prerender (FAQ structured data).
export { FAQ_ITEMS };
