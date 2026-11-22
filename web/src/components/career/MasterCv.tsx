// masterCV — the single source of truth for the Resume studio.
//
// One CV object + its metadata lives here. Every screen (Dashboard, CV Generator,
// AI CV Builder, Expert review modal, My Profile & Sync, the status bar) reads and
// writes THIS copy, so they can never disagree. The ATS score and the 70% job
// readiness are derived from it on every change.
//
// Relationship with the server profile (ProfileContext, used by Jobs etc.):
//   • masterCV starts as a copy of the saved profile and follows it while unchanged
//   • uploading a CV saves to the profile immediately, then masterCV re-syncs
//   • edits / samples / AI drafts mark masterCV "unsaved" until "Save & sync"
//   • unsaved work survives navigation and reloads (sessionStorage, per member)
import type { Profile } from '@vca/shared';
import { profileCompletion } from '@vca/shared';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { useProfile } from '../../profile/ProfileContext';
import { atsScore, roleById, type AtsResult } from './ats';
import type { CvData } from './CvPaper';

export type CvSource = 'empty' | 'profile' | 'upload' | 'sample' | 'ai' | 'edited';
export interface MasterMeta {
  fileName: string;
  hasUploadedCV: boolean;
  lastSyncedAt: string | null;
  source: CvSource;
  /** Changes not yet saved to the profile. */
  dirty: boolean;
  /** Target role for ATS keywords; null = detect from the headline. */
  roleId: string | null;
}

export const EMPTY_CV: CvData = { name: '', title: '', email: '', phone: '', location: '', summary: '', skills: [], experience: [], education: [] };

/** CV fields from the saved profile. */
export function cvFromProfile(p: Profile, fallback: Pick<CvData, 'name' | 'email'>): CvData {
  return {
    name: p.name || fallback.name,
    title: p.headline ?? '',
    email: p.email || fallback.email,
    phone: p.mobile ?? '',
    location: p.location ?? '',
    summary: p.bio ?? '',
    skills: p.skills ?? [],
    experience: p.experience ?? [],
    education: p.education ?? [],
  };
}
const metaFromProfile = (p: Profile, roleId: string | null): MasterMeta => ({
  fileName: p.hasCv ? (p.cvName || 'CV attached') : '',
  hasUploadedCV: !!p.hasCv,
  lastSyncedAt: p.updatedAt ?? new Date().toISOString(),
  source: p.headline || p.skills?.length || p.experience?.length ? 'profile' : 'empty',
  dirty: false,
  roleId,
});

/* ---------- demo personas ----------
 * Realistic starting points (ATS ≈ 50–65) so members can see the analyzer raise the score. */
export interface Persona { id: string; label: string; roleId: string; cv: CvData }
export const PERSONAS: Persona[] = [
  {
    id: 'fullstack', label: 'Full-Stack Developer', roleId: 'fullstack',
    cv: {
      name: 'Aarav Mehta', title: 'Full-Stack Developer', email: 'aarav.mehta@example.com', phone: '+91 98450 11223', location: 'Bengaluru, India',
      summary: 'Full-stack developer with 5 years of experience building React and Node.js web apps.',
      skills: ['JavaScript', 'React', 'Node.js', 'Express', 'MongoDB'],
      experience: [
        { title: 'Senior Software Engineer', company: 'CartNest', start: '2022', end: 'Present', description: '• Built the React + Node.js checkout used by 200K+ monthly shoppers\n• Cut API response time by 45% with query tuning and Redis caching\n• Led a team of 4 engineers delivering 12 releases on schedule' },
        { title: 'Software Engineer', company: 'Finly', start: '2019', end: '2022', description: '• Shipped 30+ REST endpoints for a lending platform\n• Raised test coverage from 40% to 85% with Jest' },
      ],
      education: [{ degree: 'B.Tech Computer Science', school: 'VIT Vellore', year: '2019' }],
    },
  },
  {
    id: 'java', label: 'Java Backend Developer', roleId: 'java',
    cv: {
      name: 'Sneha Kulkarni', title: 'Java Backend Developer', email: 'sneha.k@example.com', phone: '+91 99220 44556', location: 'Pune, India',
      summary: 'Backend engineer with 6 years in Java and Spring Boot building payment services.',
      skills: ['Java', 'Spring Boot', 'SQL', 'Hibernate'],
      experience: [
        { title: 'Senior Backend Engineer', company: 'PayStream', start: '2021', end: 'Present', description: '• Designed Spring Boot microservices handling 5M+ payments/day at 99.95% uptime\n• Reduced settlement batch time from 3 hours to 40 minutes' },
        { title: 'Java Developer', company: 'Infotech Solutions', start: '2018', end: '2021', description: '• Worked on backend services for the order platform\n• Fixed production bugs and wrote unit tests' },
      ],
      education: [{ degree: 'B.E. Information Technology', school: 'Pune University', year: '2018' }],
    },
  },
  {
    id: 'support', label: 'Call Center / Customer Support', roleId: 'support',
    cv: {
      name: 'Priya Sharma', title: 'Customer Support Specialist', email: 'priya.s@example.com', phone: '+91 90040 77889', location: 'Noida, India',
      summary: 'Customer support specialist with 3 years in international voice and chat processes. Known for calm escalation handling, 94% CSAT and fluent English, Hindi and Punjabi.',
      skills: ['Customer Service', 'Hindi', 'English', 'Patience'],
      experience: [
        { title: 'Senior Customer Support Executive', company: 'Teleperformance', start: '2022', end: 'Present', description: '• Handled 80+ calls/day for a US telecom client with 94% CSAT\n• Resolved 78% of issues on first contact\n• Trained 6 new joiners on CRM and call quality' },
      ],
      education: [{ degree: 'B.Com', school: 'Delhi University', year: '2021' }],
    },
  },
];

/* ---------- context ---------- */
export const SCAN_STAGES = ['Parsing Document Structure', 'Extracting Core Skills', 'Benchmarking ATS Keywords', 'Syncing Profile & Jobs'] as const;

interface MasterCtx {
  cv: CvData;
  meta: MasterMeta;
  ats: AtsResult;
  /** Job readiness of THIS CV (profile completion rules; 70% gate). */
  readiness: number;
  ready: boolean;
  loading: boolean;
  /** Change the CV; marks it unsaved. */
  setCv: (fn: (c: CvData) => CvData, source?: CvSource) => void;
  setRole: (roleId: string | null) => void;
  loadSample: (id: string) => void;
  /** Upload → parse → attach to profile → re-sync. Saved to the profile right away. */
  uploadCv: (file: File) => Promise<string[]>;
  /** Save masterCV to the profile (Jobs, applications, recruiters see it). */
  saveToProfile: () => Promise<void>;
  /** Drop unsaved changes and reload from the profile. */
  pullFromProfile: () => Promise<void>;
}
const Ctx = createContext<MasterCtx | null>(null);
export const READY_GATE = 70;

export function MasterCvProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { profile, loading, save, uploadCv: uploadToProfile, refresh } = useProfile();
  const storeKey = `huddle.masterCv.v1.${user?.id ?? 'anon'}`;
  const fallback = useMemo(() => ({ name: user?.name ?? '', email: user?.email ?? '' }), [user?.name, user?.email]);

  const [state, setState] = useState<{ cv: CvData; meta: MasterMeta } | null>(() => {
    try {
      const raw = sessionStorage.getItem(storeKey);
      const saved = raw ? (JSON.parse(raw) as { cv: CvData; meta: MasterMeta }) : null;
      return saved?.meta?.dirty ? { cv: { ...EMPTY_CV, ...saved.cv }, meta: saved.meta } : null; // keep only unsaved work
    } catch { return null; }
  });
  const latest = useRef(state);
  latest.current = state;

  // Follow the saved profile while there are no unsaved changes (no stale copies).
  useEffect(() => {
    if (!profile) return;
    setState((s) => (s?.meta.dirty ? s : { cv: cvFromProfile(profile, fallback), meta: metaFromProfile(profile, s?.meta.roleId ?? null) }));
  }, [profile, fallback]);
  // Before the profile loads (or if it fails), start blank with the account's name.
  useEffect(() => {
    if (!loading && !profile) setState((s) => s ?? { cv: { ...EMPTY_CV, ...fallback }, meta: { fileName: '', hasUploadedCV: false, lastSyncedAt: null, source: 'empty', dirty: false, roleId: null } });
  }, [loading, profile, fallback]);
  useEffect(() => {
    try {
      if (state?.meta.dirty) sessionStorage.setItem(storeKey, JSON.stringify(state));
      else sessionStorage.removeItem(storeKey);
    } catch { /* storage blocked — unsaved work just won't survive a reload */ }
  }, [state, storeKey]);

  const setCv = useCallback((fn: (c: CvData) => CvData, source: CvSource = 'edited') => {
    setState((s) => {
      if (!s) return s;
      return { cv: fn(s.cv), meta: { ...s.meta, dirty: true, source: s.meta.source === 'sample' && source === 'edited' ? 'sample' : source } };
    });
  }, []);
  const setRole = useCallback((roleId: string | null) => setState((s) => (s ? { ...s, meta: { ...s.meta, roleId } } : s)), []);
  const loadSample = useCallback((id: string) => {
    const p = PERSONAS.find((x) => x.id === id);
    if (!p) return;
    setState((s) => ({
      cv: structuredClone(p.cv),
      meta: { fileName: `Sample · ${p.label}`, hasUploadedCV: false, lastSyncedAt: s?.meta.lastSyncedAt ?? null, source: 'sample', dirty: true, roleId: p.roleId },
    }));
  }, []);
  const uploadCv = useCallback(async (file: File) => {
    const base = latest.current?.cv;
    const { profile: p, filled } = await uploadToProfile(file);
    // The profile now holds the CV (empty fields filled from it); masterCV follows it.
    // If there were unsaved edits, they win over the profile for the fields they set.
    const fromProfile = cvFromProfile(p, fallback);
    const wasDirty = !!latest.current?.meta.dirty && latest.current.meta.source !== 'sample';
    setState((s) => ({
      cv: wasDirty && base ? { ...fromProfile, ...Object.fromEntries(Object.entries(base).filter(([, v]) => (Array.isArray(v) ? v.length : String(v).trim()))) } as CvData : fromProfile,
      meta: { ...metaFromProfile(p, s?.meta.roleId ?? null), source: 'upload', dirty: wasDirty },
    }));
    return filled;
  }, [uploadToProfile, fallback]);
  const saveToProfile = useCallback(async () => {
    const s = latest.current;
    if (!s) return;
    const c = s.cv;
    const p = await save({
      headline: c.title, bio: c.summary, location: c.location, mobile: c.phone,
      skills: c.skills, experience: c.experience.filter((e) => e.title || e.company), education: c.education.filter((e) => e.degree || e.school),
    });
    setState((cur) => ({ cv: cur?.cv ?? c, meta: { ...metaFromProfile(p, cur?.meta.roleId ?? null), source: 'profile', lastSyncedAt: new Date().toISOString() } }));
  }, [save]);
  const pullFromProfile = useCallback(async () => {
    const p = await refresh();
    if (!p) throw new Error('Could not reach your profile.');
    setState((s) => ({ cv: cvFromProfile(p, fallback), meta: metaFromProfile(p, s?.meta.roleId ?? null) }));
  }, [refresh, fallback]);

  const cv = state?.cv ?? { ...EMPTY_CV, ...fallback };
  const meta = state?.meta ?? { fileName: '', hasUploadedCV: false, lastSyncedAt: null, source: 'empty' as const, dirty: false, roleId: null };
  const ats = useMemo(() => atsScore(cv, { hasUploadedCV: meta.hasUploadedCV, role: meta.roleId ? roleById(meta.roleId) : undefined }), [cv, meta.hasUploadedCV, meta.roleId]);
  const readiness = useMemo(() => profileCompletion({ headline: cv.title, bio: cv.summary, location: cv.location, skills: cv.skills, experience: cv.experience, education: cv.education, hasCv: meta.hasUploadedCV }), [cv, meta.hasUploadedCV]);

  const value: MasterCtx = {
    cv, meta, ats, readiness, ready: readiness >= READY_GATE && meta.hasUploadedCV, loading: !state,
    setCv, setRole, loadSample, uploadCv, saveToProfile, pullFromProfile,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMasterCv(): MasterCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useMasterCv must be used inside <MasterCvProvider>');
  return v;
}
