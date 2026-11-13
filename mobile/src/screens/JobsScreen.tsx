import {
  ApiError,
  profileCompletion,
  type Job,
  type JobApplication,
  type JobCategory,
  type JobExperience,
  type JobFilters,
  type JobType,
  type Profile,
} from '@vca/shared';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '../auth';
import { fonts, theme } from '../config';

const CAT_LABEL: Record<JobCategory, string> = { tech: 'Tech', 'non-tech': 'Non-Tech' };
const TYPE_LABEL: Record<JobType, string> = { 'full-time': 'Full-time', 'part-time': 'Part-time', contract: 'Contract', internship: 'Internship' };
const EXP_LABEL: Record<JobExperience, string> = { entry: 'Entry', mid: 'Mid', senior: 'Senior', lead: 'Lead' };
const STATUS_LABEL: Record<string, string> = { applied: 'Applied', shortlisted: 'Shortlisted', rejected: 'Not selected' };

function salaryText(j: Pick<Job, 'salaryMin' | 'salaryMax' | 'salaryCurrency'>): string | null {
  const fmt = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));
  if (j.salaryMin && j.salaryMax) return `${j.salaryCurrency} ${fmt(j.salaryMin)}–${fmt(j.salaryMax)}`;
  if (j.salaryMin) return `${j.salaryCurrency} ${fmt(j.salaryMin)}+`;
  if (j.salaryMax) return `Up to ${j.salaryCurrency} ${fmt(j.salaryMax)}`;
  return null;
}
const band = (s: number) => (s >= 75 ? theme.live : s >= 50 ? theme.accentText : theme.muted);

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.chip, on && styles.chipOn]} onPress={onPress}>
      <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

function MatchBadge({ score }: { score: number }) {
  return (
    <View style={[styles.match, { backgroundColor: `${band(score)}22` }]}>
      <Text style={[styles.matchNum, { color: band(score) }]}>{score}%</Text>
      <Text style={[styles.matchLbl, { color: band(score) }]}>match</Text>
    </View>
  );
}

function JobCard({ job, onOpen }: { job: Job; onOpen: () => void }) {
  const sal = salaryText(job);
  return (
    <Pressable style={styles.card} onPress={onOpen}>
      <View style={styles.cardTop}>
        <View style={styles.logo}><Text style={styles.logoText}>{(job.company || '?').charAt(0).toUpperCase()}</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>{job.title}</Text>
          <Text style={styles.company} numberOfLines={1}>{job.company}</Text>
        </View>
        {typeof job.matchScore === 'number' && <MatchBadge score={job.matchScore} />}
      </View>
      <View style={styles.meta}>
        <Text style={styles.metaChip}>{CAT_LABEL[job.category]}</Text>
        <Text style={styles.metaChip}>{TYPE_LABEL[job.type]}</Text>
        {job.remote ? <Text style={[styles.metaChip, { color: theme.live }]}>Remote</Text> : job.country ? <Text style={styles.metaChip}>{job.country}</Text> : null}
        {sal && <Text style={[styles.metaChip, styles.metaSalary]}>{sal}</Text>}
      </View>
      {job.appliedByMe && <Text style={styles.applied}>✓ Applied</Text>}
    </Pressable>
  );
}

function JobDetail({ job, onClose, onApply }: { job: Job; onClose: () => void; onApply: () => void }) {
  const sal = salaryText(job);
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.sheetWrap}>
        <View style={styles.sheet}>
          <View style={styles.sheetHead}>
            <View style={styles.logo}><Text style={styles.logoText}>{(job.company || '?').charAt(0).toUpperCase()}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.sheetTitle}>{job.title}</Text>
              <Text style={styles.company}>{job.company}{job.country ? ` · ${job.country}` : ''}{job.remote ? ' · Remote' : ''}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10}><Text style={styles.close}>✕</Text></Pressable>
          </View>
          <ScrollView style={{ maxHeight: 380 }} contentContainerStyle={{ paddingBottom: 8 }}>
            <View style={styles.facts}>
              <Text style={styles.metaChip}>{CAT_LABEL[job.category]}</Text>
              <Text style={styles.metaChip}>{TYPE_LABEL[job.type]}</Text>
              <Text style={styles.metaChip}>{EXP_LABEL[job.experience]} level</Text>
              {sal && <Text style={styles.metaChip}>{sal}</Text>}
              {typeof job.matchScore === 'number' && <Text style={[styles.metaChip, { color: band(job.matchScore) }]}>{job.matchScore}% match</Text>}
            </View>
            {!!job.description && <Text style={styles.desc}>{job.description}</Text>}
            {job.requirements.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Requirements</Text>
                {job.requirements.map((r, i) => <Text key={i} style={styles.bullet}>•  {r}</Text>)}
              </View>
            )}
            {job.skills.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Skills</Text>
                <View style={styles.skills}>
                  {job.skills.map((s) => (
                    <Text key={s} style={[styles.skill, job.matchedSkills?.includes(s) && styles.skillMatch]}>{s}</Text>
                  ))}
                </View>
              </View>
            )}
          </ScrollView>
          <Pressable style={[styles.applyBtn, job.appliedByMe && styles.applyBtnDone]} onPress={job.appliedByMe ? undefined : onApply} disabled={job.appliedByMe}>
            <Text style={styles.applyBtnText}>{job.appliedByMe ? '✓ Applied' : 'Apply now'}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function ApplyModal({ job, completion, onClose, onApplied, onCompleteProfile }: { job: Job; completion: number; onClose: () => void; onApplied: (jobId: string) => void; onCompleteProfile: () => void }) {
  const { api } = useAuth();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const gated = completion < 70;

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      await api.applyToJob(job.id, { note: note.trim() });
      onApplied(job.id);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not submit your application.');
      setBusy(false);
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalWrap}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>{gated ? 'Complete your profile first' : `Apply — ${job.title}`}</Text>
          {gated ? (
            <>
              <View style={styles.meterTrack}><View style={[styles.meterFill, { width: `${completion}%` }]} /></View>
              <Text style={styles.modalBody}>Your profile is {completion}% complete. Reach 70% — add a headline, skills and experience — to apply.</Text>
              <View style={styles.modalActions}>
                <Pressable style={[styles.mBtn, styles.mBtnGhost]} onPress={onClose}><Text style={styles.mBtnGhostText}>Not now</Text></Pressable>
                <Pressable style={[styles.mBtn, styles.mBtnPrimary]} onPress={() => { onClose(); onCompleteProfile(); }}><Text style={styles.mBtnPrimaryText}>Complete profile</Text></Pressable>
              </View>
            </>
          ) : (
            <>
              <Text style={styles.modalBody}>We’ll share your Huddle profile with {job.company}. Add a short note if you like.</Text>
              <TextInput value={note} onChangeText={setNote} placeholder="Why you’re a great fit…" placeholderTextColor={theme.faint} style={styles.noteInput} multiline maxLength={2000} />
              {!!err && <Text style={styles.err}>{err}</Text>}
              <View style={styles.modalActions}>
                <Pressable style={[styles.mBtn, styles.mBtnGhost]} onPress={onClose}><Text style={styles.mBtnGhostText}>Cancel</Text></Pressable>
                <Pressable style={[styles.mBtn, styles.mBtnPrimary]} onPress={() => void submit()} disabled={busy}>
                  <Text style={styles.mBtnPrimaryText}>{busy ? 'Submitting…' : 'Submit'}</Text>
                </Pressable>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

export function JobsScreen({ onCompleteProfile }: { onCompleteProfile: () => void }) {
  const { api } = useAuth();
  const [tab, setTab] = useState<'browse' | 'applied'>('browse');
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [filters, setFilters] = useState<JobFilters>({ q: '', category: '', type: '', experience: '', remote: false });
  const [selected, setSelected] = useState<Job | null>(null);
  const [applying, setApplying] = useState<Job | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [apps, setApps] = useState<JobApplication[] | null>(null);

  const completion = profileCompletion(profile);

  useEffect(() => {
    api.myProfile().then(({ profile }) => setProfile(profile)).catch(() => {});
  }, [api]);

  const load = useCallback(() => {
    setJobs(null);
    api.jobs(filters).then(({ jobs }) => setJobs(jobs)).catch(() => setJobs([]));
  }, [api, filters]);
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    if (tab === 'applied') api.myApplications().then(({ applications }) => setApps(applications)).catch(() => setApps([]));
  }, [tab, api]);

  const toggle = <K extends keyof JobFilters>(k: K, v: JobFilters[K]) => setFilters((f) => ({ ...f, [k]: f[k] === v ? (typeof v === 'boolean' ? false : '') : v } as JobFilters));
  const markApplied = (jobId: string) => {
    setJobs((cur) => cur?.map((j) => (j.id === jobId ? { ...j, appliedByMe: true } : j)) ?? cur);
    setSelected((s) => (s && s.id === jobId ? { ...s, appliedByMe: true } : s));
  };

  const header = (
    <View>
      <Text style={styles.h1}>Jobs &amp; Careers</Text>
      {completion < 70 && (
        <Pressable onPress={onCompleteProfile}><Text style={styles.gateHint}>Your profile is {completion}% complete — reach 70% to apply.</Text></Pressable>
      )}
      <View style={styles.tabs}>
        <Pressable style={[styles.tabBtn, tab === 'browse' && styles.tabOn]} onPress={() => setTab('browse')}><Text style={[styles.tabText, tab === 'browse' && styles.tabTextOn]}>Browse</Text></Pressable>
        <Pressable style={[styles.tabBtn, tab === 'applied' && styles.tabOn]} onPress={() => setTab('applied')}><Text style={[styles.tabText, tab === 'applied' && styles.tabTextOn]}>My applications</Text></Pressable>
      </View>
      {tab === 'browse' && (
        <>
          <TextInput value={filters.q} onChangeText={(v) => setFilters((f) => ({ ...f, q: v }))} placeholder="Search title, company, skill" placeholderTextColor={theme.faint} style={styles.search} autoCapitalize="none" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            <Chip label="Tech" on={filters.category === 'tech'} onPress={() => toggle('category', 'tech')} />
            <Chip label="Non-Tech" on={filters.category === 'non-tech'} onPress={() => toggle('category', 'non-tech')} />
            <Chip label="Remote" on={!!filters.remote} onPress={() => toggle('remote', true)} />
            {(Object.keys(TYPE_LABEL) as JobType[]).map((tp) => <Chip key={tp} label={TYPE_LABEL[tp]} on={filters.type === tp} onPress={() => toggle('type', tp)} />)}
            {(Object.keys(EXP_LABEL) as JobExperience[]).map((ex) => <Chip key={ex} label={EXP_LABEL[ex]} on={filters.experience === ex} onPress={() => toggle('experience', ex)} />)}
          </ScrollView>
        </>
      )}
    </View>
  );

  if (tab === 'applied') {
    return (
      <View style={{ flex: 1 }}>
        <View style={{ paddingHorizontal: 16 }}>{header}</View>
        {apps === null ? (
          <ActivityIndicator style={{ marginTop: 24 }} color={theme.primaryText} />
        ) : apps.length === 0 ? (
          <Text style={styles.empty}>You haven’t applied to any jobs yet.</Text>
        ) : (
          <FlatList
            data={apps}
            keyExtractor={(a) => a.id}
            contentContainerStyle={{ padding: 16, paddingTop: 6, gap: 10 }}
            renderItem={({ item }) => (
              <Pressable style={styles.appRow} onPress={() => item.job && setSelected(item.job)}>
                <View style={styles.logo}><Text style={styles.logoText}>{(item.job?.company || '?').charAt(0).toUpperCase()}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.title} numberOfLines={1}>{item.job?.title ?? 'No longer listed'}</Text>
                  <Text style={styles.company} numberOfLines={1}>{item.job?.company}</Text>
                </View>
                <Text style={[styles.status, styles[`status_${item.status}` as 'status_applied']]}>{STATUS_LABEL[item.status] ?? item.status}</Text>
              </Pressable>
            )}
          />
        )}
        {selected && <JobDetail job={selected} onClose={() => setSelected(null)} onApply={() => { setApplying(selected); setSelected(null); }} />}
        {applying && <ApplyModal job={applying} completion={completion} onClose={() => setApplying(null)} onApplied={(id) => { markApplied(id); setApplying(null); }} onCompleteProfile={onCompleteProfile} />}
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={jobs ?? []}
        keyExtractor={(j) => j.id}
        ListHeaderComponent={<View style={{ paddingHorizontal: 16 }}>{header}</View>}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24, gap: 12 }}
        ListEmptyComponent={jobs === null ? <ActivityIndicator style={{ marginTop: 24 }} color={theme.primaryText} /> : <Text style={styles.empty}>No jobs match your filters yet.</Text>}
        renderItem={({ item }) => <JobCard job={item} onOpen={() => setSelected(item)} />}
      />
      {selected && <JobDetail job={selected} onClose={() => setSelected(null)} onApply={() => { setApplying(selected); setSelected(null); }} />}
      {applying && <ApplyModal job={applying} completion={completion} onClose={() => setApplying(null)} onApplied={(id) => { markApplied(id); setApplying(null); }} onCompleteProfile={onCompleteProfile} />}
    </View>
  );
}

const styles = StyleSheet.create({
  h1: { color: theme.text, fontSize: 26, fontFamily: fonts.bold, paddingTop: 12 },
  gateHint: { color: theme.accentText, fontSize: 13, fontFamily: fonts.regular, marginTop: 4 },
  tabs: { flexDirection: 'row', gap: 4, backgroundColor: theme.surface2, borderRadius: 999, padding: 4, marginTop: 12, alignSelf: 'flex-start' },
  tabBtn: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 999 },
  tabOn: { backgroundColor: theme.surface },
  tabText: { color: theme.muted, fontFamily: fonts.bold, fontSize: 13 },
  tabTextOn: { color: theme.text },
  search: { marginTop: 12, height: 42, borderRadius: 10, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface2, color: theme.text, paddingHorizontal: 14, fontSize: 15, fontFamily: fonts.regular },
  chipRow: { gap: 8, paddingVertical: 12 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface },
  chipOn: { backgroundColor: theme.primary, borderColor: 'transparent' },
  chipText: { color: theme.muted, fontFamily: fonts.bold, fontSize: 13 },
  chipTextOn: { color: theme.onPrimary },

  card: { padding: 14, borderRadius: 14, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, gap: 10 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logo: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.primary },
  logoText: { color: theme.onPrimary, fontFamily: fonts.bold, fontSize: 18 },
  title: { color: theme.text, fontSize: 15.5, fontFamily: fonts.bold },
  company: { color: theme.muted, fontSize: 13, fontFamily: fonts.regular, marginTop: 1 },
  match: { minWidth: 52, alignItems: 'center', justifyContent: 'center', paddingVertical: 5, paddingHorizontal: 8, borderRadius: 12 },
  matchNum: { fontSize: 15, fontFamily: fonts.bold, lineHeight: 17 },
  matchLbl: { fontSize: 8.5, fontFamily: fonts.bold, textTransform: 'uppercase', letterSpacing: 0.4 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  metaChip: { fontSize: 11.5, color: theme.muted, backgroundColor: theme.surface2, borderWidth: 1, borderColor: theme.border, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, overflow: 'hidden', fontFamily: fonts.regular },
  metaSalary: { color: theme.text, fontFamily: fonts.bold },
  applied: { color: theme.live, fontSize: 12.5, fontFamily: fonts.bold },

  sheetWrap: { flex: 1, backgroundColor: theme.overlay, justifyContent: 'flex-end' },
  sheet: { backgroundColor: theme.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, gap: 12, borderWidth: 1, borderColor: theme.border },
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sheetTitle: { color: theme.text, fontSize: 19, fontFamily: fonts.bold },
  close: { color: theme.muted, fontSize: 20, fontFamily: fonts.bold, paddingHorizontal: 4 },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  desc: { color: theme.text, fontSize: 14.5, lineHeight: 21, fontFamily: fonts.regular },
  section: { marginTop: 14 },
  sectionTitle: { color: theme.text, fontSize: 14, fontFamily: fonts.bold, marginBottom: 6 },
  bullet: { color: theme.text, fontSize: 14, lineHeight: 20, fontFamily: fonts.regular },
  skills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  skill: { fontSize: 12.5, color: theme.text, backgroundColor: theme.surface2, borderWidth: 1, borderColor: theme.border, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, overflow: 'hidden', fontFamily: fonts.regular },
  skillMatch: { backgroundColor: theme.sparkSoft, color: theme.accentText, borderColor: 'transparent' },
  applyBtn: { backgroundColor: theme.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  applyBtnDone: { backgroundColor: theme.surface2 },
  applyBtnText: { color: theme.onPrimary, fontFamily: fonts.bold, fontSize: 15 },

  modalWrap: { flex: 1, backgroundColor: theme.overlay, alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalCard: { width: '100%', maxWidth: 380, backgroundColor: theme.surface, borderRadius: 18, borderWidth: 1, borderColor: theme.border, padding: 20, gap: 12 },
  modalTitle: { color: theme.text, fontSize: 18, fontFamily: fonts.bold },
  modalBody: { color: theme.muted, fontSize: 14, lineHeight: 20, fontFamily: fonts.regular },
  meterTrack: { height: 8, borderRadius: 999, backgroundColor: theme.well, overflow: 'hidden' },
  meterFill: { height: '100%', backgroundColor: theme.accent, borderRadius: 999 },
  noteInput: { minHeight: 90, borderWidth: 1, borderColor: theme.border, borderRadius: 10, backgroundColor: theme.surface2, color: theme.text, padding: 12, fontSize: 15, fontFamily: fonts.regular, textAlignVertical: 'top' },
  err: { color: theme.hotSoft, fontSize: 13, fontFamily: fonts.regular },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  mBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  mBtnGhost: { backgroundColor: theme.surface2, borderWidth: 1, borderColor: theme.border },
  mBtnGhostText: { color: theme.text, fontFamily: fonts.bold, fontSize: 14 },
  mBtnPrimary: { backgroundColor: theme.primary },
  mBtnPrimaryText: { color: theme.onPrimary, fontFamily: fonts.bold, fontSize: 14 },

  appRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border },
  status: { fontSize: 11.5, fontFamily: fonts.bold, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, overflow: 'hidden' },
  status_applied: { backgroundColor: theme.well, color: theme.muted },
  status_shortlisted: { backgroundColor: theme.sparkSoft, color: theme.live },
  status_rejected: { backgroundColor: theme.hotSoft, color: theme.hot },
  empty: { color: theme.muted, textAlign: 'center', padding: 36, lineHeight: 20, fontFamily: fonts.regular },
});
