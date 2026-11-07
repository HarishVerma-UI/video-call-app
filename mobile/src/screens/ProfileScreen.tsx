import { ApiError, colorFor, initials, passwordStrength, type Education, type Experience, type FaceCredential, type Profile } from '@vca/shared';
import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { FaceCancelled } from '../faceUnlock';
import { useAuth } from '../auth';
import { fonts, theme } from '../config';

type Fields = Record<string, string | undefined>;
type Msg = { ok: boolean; text: string } | null;

function Field(props: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  error?: string;
  secure?: boolean;
  keyboardType?: 'default' | 'email-address';
  autoComplete?: 'name' | 'email' | 'password' | 'new-password';
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View>
      <Text style={[styles.label, focused && { color: theme.accentText }]}>{props.label}</Text>
      <TextInput
        value={props.value}
        onChangeText={props.onChangeText}
        secureTextEntry={props.secure}
        keyboardType={props.keyboardType}
        autoCapitalize={props.keyboardType === 'email-address' || props.secure ? 'none' : 'words'}
        autoCorrect={false}
        autoComplete={props.autoComplete}
        selectionColor={theme.accentText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={styles.input}
        accessibilityLabel={props.label}
      />
      <View style={[styles.rule, focused && styles.ruleFocus, !!props.error && styles.ruleError]} />
      {!!props.error && <Text style={styles.error}>{props.error}</Text>}
    </View>
  );
}

/** Face sign-in on this phone, plus every device that can sign in with a face. */
function FaceSection() {
  const { api, user, face, enableFace, disableFace } = useAuth();
  const [list, setList] = useState<FaceCredential[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const onHere = !!face.meta && face.meta.userId === user?.id;
  const reload = () =>
    api
      .credentials()
      .then(({ credentials }) => setList(credentials))
      .catch(() => setList([]));
  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  const toggle = async (on: boolean) => {
    setMsg(null);
    setBusy(true);
    try {
      if (on) await enableFace();
      else await disableFace();
      setMsg({ ok: true, text: on ? `${face.label} sign-in is on for this phone.` : 'Face sign-in is off for this phone.' });
      await reload();
    } catch (e) {
      if (!(e instanceof FaceCancelled)) setMsg({ ok: false, text: e instanceof ApiError ? e.message : (e as Error).message });
    } finally {
      setBusy(false);
    }
  };
  const remove = async (c: FaceCredential) => {
    setMsg(null);
    try {
      setList((await api.removeCredential(c.id)).credentials);
      if (face.meta?.deviceId === c.id) await disableFace().catch(() => {});
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiError ? e.message : 'Couldn’t remove that device.' });
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Face sign-in</Text>
      <Text style={styles.note}>Your face is checked by your phone or computer. It never leaves the device.</Text>
      {face.available ? (
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Sign in with {face.label} on this phone</Text>
          {busy ? <ActivityIndicator color={theme.primaryText} /> : <Switch value={onHere} onValueChange={(v) => void toggle(v)} trackColor={{ true: theme.primary }} />}
        </View>
      ) : (
        <Text style={styles.note}>Set up Face ID, face unlock or a fingerprint in your phone’s settings to use this.</Text>
      )}
      {list?.map((c) => (
        <View key={c.id} style={styles.deviceRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.deviceName}>
              {c.name}
              {face.meta?.deviceId === c.id ? '  (this phone)' : ''}
            </Text>
            <Text style={styles.deviceSub}>{c.kind === 'passkey' ? 'Browser passkey' : 'Huddle app'}{c.synced ? ' · synced' : ''}</Text>
          </View>
          <Pressable onPress={() => void remove(c)} hitSlop={10} accessibilityLabel={`Remove ${c.name}`}>
            <Text style={styles.remove}>Remove</Text>
          </Pressable>
        </View>
      ))}
      {msg && <Text style={[styles.msg, msg.ok && styles.msgOk]}>{msg.text}</Text>}
    </View>
  );
}

const splitList = (s: string) => s.split(',').map((t) => t.trim()).filter(Boolean);

/** A labelled text input used by the professional-profile editor. */
function PInput({ label, value, onChangeText, placeholder, multiline }: { label: string; value: string; onChangeText: (v: string) => void; placeholder?: string; multiline?: boolean }) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={ps.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.faint}
        multiline={multiline}
        style={[ps.input, multiline && { minHeight: 76, textAlignVertical: 'top' }]}
        autoCapitalize="sentences"
      />
    </View>
  );
}

/** Edit the public professional profile: headline, bio, skills, mentoring, experience and education. */
function ProfessionalProfile() {
  const { api } = useAuth();
  const [loaded, setLoaded] = useState(false);
  const [headline, setHeadline] = useState('');
  const [location, setLocation] = useState('');
  const [bio, setBio] = useState('');
  const [mobile, setMobile] = useState('');
  const [skills, setSkills] = useState('');
  const [focus, setFocus] = useState('');
  const [mentor, setMentor] = useState(false);
  const [mentee, setMentee] = useState(false);
  const [experience, setExperience] = useState<Experience[]>([]);
  const [education, setEducation] = useState<Education[]>([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  useEffect(() => {
    api
      .myProfile()
      .then(({ profile }) => {
        setHeadline(profile.headline ?? '');
        setLocation(profile.location ?? '');
        setBio(profile.bio ?? '');
        setMobile(profile.mobile ?? '');
        setSkills((profile.skills ?? []).join(', '));
        setFocus((profile.focusAreas ?? []).join(', '));
        setMentor(!!profile.mentor);
        setMentee(!!profile.mentee);
        setExperience(profile.experience ?? []);
        setEducation(profile.education ?? []);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [api]);

  const setExp = (i: number, k: keyof Experience, v: string) => setExperience((xs) => xs.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const setEdu = (i: number, k: keyof Education, v: string) => setEducation((xs) => xs.map((x, j) => (j === i ? { ...x, [k]: v } : x)));

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const patch: Partial<Profile> = {
        headline: headline.trim(),
        location: location.trim(),
        bio: bio.trim(),
        mobile: mobile.trim(),
        skills: splitList(skills),
        focusAreas: splitList(focus),
        mentor,
        mentee,
        experience: experience.filter((x) => x.title || x.company),
        education: education.filter((x) => x.school || x.degree),
      };
      await api.saveProfile(patch);
      setMsg({ ok: true, text: 'Profile saved. Your connections will see the update.' });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiError ? e.message : 'Couldn’t save your profile.' });
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) return <ActivityIndicator style={{ marginVertical: 24 }} color={theme.primaryText} />;

  return (
    <View style={ps.wrap}>
      <Text style={styles.section}>Professional profile</Text>
      <View style={{ gap: 14 }}>
        <PInput label="Headline" value={headline} onChangeText={setHeadline} placeholder="e.g. Senior Frontend Engineer" />
        <PInput label="Location" value={location} onChangeText={setLocation} placeholder="e.g. Bengaluru, India" />
        <PInput label="About" value={bio} onChangeText={setBio} placeholder="A short bio" multiline />
        <PInput label="Skills (comma separated)" value={skills} onChangeText={setSkills} placeholder="Angular, TypeScript, RxJS" />
        <PInput label="Mobile (shown to connections)" value={mobile} onChangeText={setMobile} placeholder="Optional" />

        <View style={ps.switchRow}>
          <Text style={ps.switchLabel}>Open to mentoring others</Text>
          <Switch value={mentor} onValueChange={setMentor} trackColor={{ true: theme.primary }} />
        </View>
        <View style={ps.switchRow}>
          <Text style={ps.switchLabel}>Looking for a mentor</Text>
          <Switch value={mentee} onValueChange={setMentee} trackColor={{ true: theme.primary }} />
        </View>
        {(mentor || mentee) && <PInput label="Focus areas (comma separated)" value={focus} onChangeText={setFocus} placeholder="Career growth, System design" />}

        <Text style={ps.subhead}>Experience</Text>
        {experience.map((x, i) => (
          <View key={i} style={ps.entry}>
            <PInput label="Title" value={x.title} onChangeText={(v) => setExp(i, 'title', v)} />
            <PInput label="Company" value={x.company} onChangeText={(v) => setExp(i, 'company', v)} />
            <View style={ps.pair}>
              <View style={{ flex: 1 }}><PInput label="From" value={x.start} onChangeText={(v) => setExp(i, 'start', v)} placeholder="2019" /></View>
              <View style={{ flex: 1 }}><PInput label="To" value={x.end} onChangeText={(v) => setExp(i, 'end', v)} placeholder="Present" /></View>
            </View>
            <Pressable onPress={() => setExperience((xs) => xs.filter((_, j) => j !== i))} hitSlop={8}>
              <Text style={ps.removeLink}>Remove</Text>
            </Pressable>
          </View>
        ))}
        <Pressable style={ps.addBtn} onPress={() => setExperience((xs) => [...xs, { title: '', company: '', start: '', end: '', description: '' }])}>
          <Text style={ps.addText}>+ Add experience</Text>
        </Pressable>

        <Text style={ps.subhead}>Education</Text>
        {education.map((x, i) => (
          <View key={i} style={ps.entry}>
            <PInput label="School" value={x.school} onChangeText={(v) => setEdu(i, 'school', v)} />
            <PInput label="Degree" value={x.degree} onChangeText={(v) => setEdu(i, 'degree', v)} />
            <PInput label="Year" value={x.year} onChangeText={(v) => setEdu(i, 'year', v)} placeholder="2018" />
            <Pressable onPress={() => setEducation((xs) => xs.filter((_, j) => j !== i))} hitSlop={8}>
              <Text style={ps.removeLink}>Remove</Text>
            </Pressable>
          </View>
        ))}
        <Pressable style={ps.addBtn} onPress={() => setEducation((xs) => [...xs, { school: '', degree: '', year: '' }])}>
          <Text style={ps.addText}>+ Add education</Text>
        </Pressable>
      </View>

      {msg && <Text style={[styles.msg, msg.ok && styles.msgOk]}>{msg.text}</Text>}
      <Pressable style={[styles.primary, saving && { opacity: 0.5 }]} onPress={() => void save()} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Save profile</Text>}
      </Pressable>
      <Text style={styles.note}>Add a profile photo and CV from the Huddle website — photo and file uploads are coming to the app soon.</Text>
    </View>
  );
}

const ps = StyleSheet.create({
  wrap: { marginBottom: 20 },
  label: { color: theme.muted, fontSize: 13, fontFamily: fonts.regular },
  input: { color: theme.text, fontSize: 16, fontFamily: fonts.regular, backgroundColor: theme.surface2, borderWidth: 1, borderColor: theme.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  switchLabel: { flex: 1, color: theme.text, fontSize: 15, fontFamily: fonts.regular },
  subhead: { color: theme.text, fontSize: 15, fontFamily: fonts.bold, marginTop: 10 },
  entry: { gap: 10, padding: 12, borderRadius: 12, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border },
  pair: { flexDirection: 'row', gap: 10 },
  removeLink: { color: theme.hotSoft, fontSize: 13, fontFamily: fonts.bold, alignSelf: 'flex-start' },
  addBtn: { alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface2 },
  addText: { color: theme.primaryText, fontSize: 14, fontFamily: fonts.bold },
});

/** Edit name, email and password; sign out lives here too. */
export function ProfileScreen() {
  const { user, updateProfile, changePassword, logout } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [emailPw, setEmailPw] = useState('');
  const [dErr, setDErr] = useState<Fields>({});
  const [dMsg, setDMsg] = useState<Msg>(null);
  const [savingD, setSavingD] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [pErr, setPErr] = useState<Fields>({});
  const [pMsg, setPMsg] = useState<Msg>(null);
  const [savingP, setSavingP] = useState(false);
  if (!user) return null;
  const hasPassword = user.hasPassword !== false;

  const emailChanged = email.trim().toLowerCase() !== user.email;
  const dirty = name.trim().replace(/\s+/g, ' ') !== user.name || emailChanged;
  const strength = passwordStrength(next);

  const saveDetails = async () => {
    setDMsg(null);
    const errs: Fields = {};
    if (name.trim().length < 2) errs.name = 'Use at least 2 characters.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) errs.email = 'Enter an email like name@example.com.';
    if (emailChanged && hasPassword && !emailPw) errs.currentPassword = 'Enter your current password to change your email.';
    setDErr(errs);
    if (Object.keys(errs).length) return;
    setSavingD(true);
    try {
      const u = await updateProfile({ name: name.trim(), ...(emailChanged ? { email: email.trim(), ...(hasPassword ? { currentPassword: emailPw } : {}) } : {}) });
      setName(u.name);
      setEmail(u.email);
      setEmailPw('');
      setDMsg({ ok: true, text: 'Saved. People in your next call will see the new details.' });
    } catch (e) {
      const err = e instanceof ApiError ? e : null;
      setDErr(err?.fields ?? {});
      setDMsg({ ok: false, text: err?.message ?? 'Couldn’t save. Check your connection and try again.' });
    } finally {
      setSavingD(false);
    }
  };

  const savePassword = async () => {
    setPMsg(null);
    const errs: Fields = {};
    if (hasPassword && !current) errs.currentPassword = 'Enter your current password.';
    if (next.length < 8) errs.newPassword = 'Use at least 8 characters.';
    else if (!/[a-zA-Z]/.test(next) || !/\d/.test(next)) errs.newPassword = 'Mix in at least one letter and one number.';
    setPErr(errs);
    if (Object.keys(errs).length) return;
    setSavingP(true);
    try {
      await changePassword(hasPassword ? current : null, next);
      setCurrent('');
      setNext('');
      setPMsg({ ok: true, text: hasPassword ? 'Password changed. Your other devices have been signed out.' : 'Backup password added. You can now sign in with your email too.' });
    } catch (e) {
      const err = e instanceof ApiError ? e : null;
      setPErr(err?.fields ?? {});
      setPMsg({ ok: false, text: err?.message ?? 'Couldn’t change your password. Try again.' });
    } finally {
      setSavingP(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">

        <View style={styles.head}>
          <View style={[styles.avatar, { backgroundColor: colorFor(user.id) }]}>
            <Text style={styles.avatarText}>{initials(name || user.name)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Your profile</Text>
            <Text style={styles.sub}>Member since {new Date(user.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</Text>
          </View>
        </View>

        <ProfessionalProfile />

        <Text style={styles.section}>Account</Text>
        <View style={{ gap: 18 }}>
          <Field label="Name" value={name} onChangeText={setName} error={dErr.name} autoComplete="name" />
          <Field label="Email" value={email} onChangeText={setEmail} error={dErr.email} keyboardType="email-address" autoComplete="email" />
          {emailChanged && hasPassword && (
            <Field
              label="Current password (to confirm the new email)"
              value={emailPw}
              onChangeText={setEmailPw}
              error={dErr.currentPassword}
              secure
              autoComplete="password"
            />
          )}
        </View>
        {dMsg && <Text style={[styles.msg, dMsg.ok && styles.msgOk]}>{dMsg.text}</Text>}
        <Pressable style={[styles.primary, (!dirty || savingD) && { opacity: 0.5 }]} onPress={saveDetails} disabled={!dirty || savingD}>
          {savingD ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Save changes</Text>}
        </Pressable>

        <FaceSection />

        <Text style={[styles.section, { marginTop: 32 }]}>{hasPassword ? 'Password' : 'Backup password'}</Text>
        <View style={{ gap: 18 }}>
          {hasPassword && <Field label="Current password" value={current} onChangeText={setCurrent} error={pErr.currentPassword} secure autoComplete="password" />}
          <Field label={hasPassword ? 'New password' : 'Password'} value={next} onChangeText={setNext} error={pErr.newPassword} secure autoComplete="new-password" />
          {!!next && (
            <View style={styles.meter}>
              <View style={styles.meterTrack}>
                <View
                  style={{
                    width: `${strength.score * 25}%`,
                    height: '100%',
                    borderRadius: 4,
                    backgroundColor: [theme.hot, theme.hot, theme.amber, theme.cool, theme.cool][strength.score],
                  }}
                />
              </View>
              <Text style={styles.meterLabel}>{strength.label}</Text>
            </View>
          )}
        </View>
        {pMsg && <Text style={[styles.msg, pMsg.ok && styles.msgOk]}>{pMsg.text}</Text>}
        <Pressable style={[styles.secondary, ((hasPassword && !current) || !next || savingP) && { opacity: 0.5 }]}
          onPress={savePassword}
          disabled={(hasPassword && !current) || !next || savingP}
        >
          <Text style={styles.secondaryText}>{savingP ? 'Saving…' : hasPassword ? 'Change password' : 'Add password'}</Text>
        </Pressable>
        <Text style={styles.note}>
          {hasPassword ? 'Changing your password signs you out on your other devices.' : 'Add one so you can still sign in on a device without face unlock.'}
        </Text>

        <Pressable style={styles.signOut} onPress={() => void logout()} accessibilityRole="button">
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 22, paddingBottom: 48 },
  back: { color: theme.muted, fontSize: 16, fontFamily: fonts.bold, marginBottom: 18 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 26 },
  avatar: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: theme.accent },
  avatarText: { color: theme.ink, fontSize: 22, fontFamily: fonts.bold },
  title: { color: theme.text, fontSize: 28, fontFamily: fonts.bold, letterSpacing: -1 },
  sub: { color: theme.muted, fontSize: 14, fontFamily: fonts.regular, marginTop: 2 },
  section: { color: theme.muted, fontSize: 15, fontFamily: fonts.bold, marginBottom: 14 },
  label: { color: theme.muted, fontSize: 14, fontFamily: fonts.regular, marginBottom: 4 },
  input: { color: theme.text, fontSize: 19, fontFamily: fonts.regular, paddingVertical: 8 },
  rule: { height: 1, backgroundColor: theme.border },
  ruleFocus: { height: 2, backgroundColor: theme.accentText },
  ruleError: { backgroundColor: theme.hot },
  error: { color: theme.hotSoft, fontSize: 14, fontFamily: fonts.regular, marginTop: 6 },
  msg: { marginTop: 16, paddingLeft: 12, borderLeftWidth: 3, borderLeftColor: theme.hot, color: theme.hotSoft, fontSize: 14, lineHeight: 20, fontFamily: fonts.regular },
  msgOk: { borderLeftColor: theme.cool, color: theme.text },
  primary: { marginTop: 20, height: 48, borderRadius: 8, backgroundColor: theme.primary, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: theme.onPrimary, fontSize: 17, fontFamily: fonts.bold },
  secondary: { marginTop: 20, alignSelf: 'flex-start', paddingHorizontal: 18, paddingVertical: 12, borderRadius: 14, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface2 },
  secondaryText: { color: theme.text, fontSize: 15, fontFamily: fonts.bold },
  note: { color: theme.muted, fontSize: 13, fontFamily: fonts.regular, marginTop: 10 },
  meter: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  meterTrack: { flex: 1, height: 4, borderRadius: 4, backgroundColor: theme.surface2, overflow: 'hidden' },
  meterLabel: { color: theme.muted, fontSize: 13, minWidth: 70, textAlign: 'right', fontFamily: fonts.bold },
  card: { marginTop: 32, padding: 16, gap: 12, borderRadius: 14, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border },
  cardTitle: { color: theme.text, fontSize: 17, fontFamily: fonts.bold },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  switchLabel: { flex: 1, color: theme.text, fontSize: 15, fontFamily: fonts.regular },
  deviceRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: theme.border },
  deviceName: { color: theme.text, fontSize: 15, fontFamily: fonts.bold },
  deviceSub: { color: theme.muted, fontSize: 12.5, fontFamily: fonts.regular },
  remove: { color: theme.hotSoft, fontFamily: fonts.bold },
  signOut: { marginTop: 40, alignSelf: 'center', paddingHorizontal: 22, paddingVertical: 12 },
  signOutText: { color: theme.hotSoft, fontSize: 16, fontFamily: fonts.bold },
});
