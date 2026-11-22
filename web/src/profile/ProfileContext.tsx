// The signed-in member's profile — one shared copy for every screen (Profile,
// Jobs, Resume, Feed, …) so they can never disagree.
//
//   profile        latest server copy (null until loaded)
//   save(patch)    merges into the full profile before PUT — the API replaces every
//                  field, so partial saves would wipe data
//   uploadCv(file) reads the CV, fills EMPTY fields from it (never overwrites what
//                  the member typed), uploads the file and saves — in one step
//
// The copy refreshes when the tab regains focus, so edits made in another tab or
// device show up without a reload.
import { ApiError, type ApiClient, type ParsedCv, type Profile } from '@vca/shared';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '../auth/AuthContext';
import { uploadContentType, uploadFile } from '../upload';

export type ProfileInput = Parameters<ApiClient['saveProfile']>[0];
/** Profile fields a CV can fill in. */
export type CvField = 'headline' | 'bio' | 'location' | 'mobile' | 'skills' | 'experience' | 'education';

/** Every editable field, so a save never blanks anything that wasn't meant to change. */
export function toInput(p: Partial<Profile> | null | undefined): ProfileInput {
  return {
    headline: p?.headline ?? '',
    bio: p?.bio ?? '',
    location: p?.location ?? '',
    mobile: p?.mobile ?? '',
    expectedSalary: p?.expectedSalary ?? '',
    skills: p?.skills ?? [],
    focusAreas: p?.focusAreas ?? [],
    mentor: !!p?.mentor,
    mentee: !!p?.mentee,
    openToReferrals: !!p?.openToReferrals,
    experience: (p?.experience ?? []).filter((x) => x.title || x.company),
    education: (p?.education ?? []).filter((x) => x.school || x.degree),
  };
}

/** Fill empty fields from a parsed CV. Skills are merged (union); nothing typed is overwritten. */
export function mergeCv(base: ProfileInput, parsed: ParsedCv | undefined): { next: ProfileInput; filled: CvField[] } {
  const next = { ...base };
  const filled: CvField[] = [];
  if (!parsed) return { next, filled };
  const empty = (v: unknown) => !String(v ?? '').trim();
  if (parsed.headline && empty(next.headline)) { next.headline = parsed.headline; filled.push('headline'); }
  if (parsed.summary && empty(next.bio)) { next.bio = parsed.summary; filled.push('bio'); }
  if (parsed.location && empty(next.location)) { next.location = parsed.location; filled.push('location'); }
  if (parsed.phone && empty(next.mobile)) { next.mobile = parsed.phone; filled.push('mobile'); }
  if (parsed.skills?.length) {
    const have = next.skills ?? [];
    const seen = new Set(have.map((s) => s.toLowerCase()));
    const added = parsed.skills.filter((s) => !seen.has(s.toLowerCase()));
    if (added.length) { next.skills = [...have, ...added]; filled.push('skills'); }
  }
  if (parsed.experience?.length && !next.experience?.length) { next.experience = parsed.experience; filled.push('experience'); }
  if (parsed.education?.length && !next.education?.length) { next.education = parsed.education; filled.push('education'); }
  return { next, filled };
}

export interface CvResult { profile: Profile; filled: CvField[]; lowConfidence: boolean }

/**
 * Read → upload → fill → save, for any screen (also used at sign-up, before this
 * context exists). `base` is the full profile to merge into — pass the form's
 * unsaved values when uploading from the editor.
 */
export async function attachCv(api: ApiClient, file: File, base: ProfileInput): Promise<CvResult> {
  const contentType = uploadContentType(file, 'cv'); // validates type + size first
  const parsed = await api.parseCv(file, contentType).then((r) => r.parsed).catch(() => undefined);
  const cvKey = await uploadFile(api, 'cv', file);
  const { next, filled } = mergeCv(base, parsed);
  const { profile } = await api.saveProfile({ ...next, cvKey, cvName: file.name });
  return { profile, filled, lowConfidence: !parsed || parsed.lowConfidence };
}

interface ProfileValue {
  profile: Profile | null;
  loading: boolean;
  refresh: () => Promise<Profile | null>;
  /** Save changes on top of the current profile. */
  save: (patch: Partial<ProfileInput>) => Promise<Profile>;
  /** Upload a CV and fill empty fields from it. `base` defaults to the saved profile. */
  uploadCv: (file: File, base?: ProfileInput) => Promise<CvResult>;
  /** Adopt a profile the server just returned (e.g. after a photo upload). */
  replace: (p: Profile) => void;
}

const Ctx = createContext<ProfileValue | null>(null);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { api, refreshPhoto } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const latest = useRef<Profile | null>(null);
  latest.current = profile;

  const adopt = useCallback((p: Profile) => {
    const photoChanged = latest.current?.photoUrl !== p.photoUrl;
    latest.current = p;
    setProfile(p);
    if (photoChanged) void refreshPhoto(); // keep avatars app-wide in step
  }, [refreshPhoto]);

  const refresh = useCallback(async () => {
    try {
      const { profile: p } = await api.myProfile();
      adopt(p);
      return p;
    } catch {
      return latest.current;
    } finally {
      setLoading(false);
    }
  }, [api, adopt]);

  useEffect(() => {
    void refresh();
    const onFocus = () => void refresh();
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => { window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onVisible); };
  }, [refresh]);

  const save = useCallback(async (patch: Partial<ProfileInput>) => {
    const current = latest.current ?? (await refresh());
    const { profile: p } = await api.saveProfile({ ...toInput(current), ...patch });
    adopt(p);
    return p;
  }, [api, adopt, refresh]);

  const uploadCv = useCallback(async (file: File, base?: ProfileInput) => {
    const current = latest.current ?? (await refresh());
    const result = await attachCv(api, file, base ?? toInput(current));
    adopt(result.profile);
    return result;
  }, [api, adopt, refresh]);

  const value = useMemo(() => ({ profile, loading, refresh, save, uploadCv, replace: adopt }), [profile, loading, refresh, save, uploadCv, adopt]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useProfile(): ProfileValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useProfile must be used inside <ProfileProvider>');
  return v;
}

/** User-facing error text for a failed CV upload. */
export const cvErrorText = (err: unknown) => (err instanceof ApiError ? err.message : (err as Error)?.message || 'Upload failed.');
