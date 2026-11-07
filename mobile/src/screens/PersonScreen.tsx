import type { ConnectionState, Post, Profile } from '@vca/shared';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth';
import { useCalling } from '../calling';
import { Avatar } from '../components/Avatar';
import { fonts, theme } from '../config';
import { ago } from '../format';

export function roleBadges(p: Pick<Profile, 'mentor' | 'mentee' | 'focusAreas'>): string[] {
  const out: string[] = [];
  if (p.mentor) out.push('Mentor');
  if (p.mentee) out.push('Mentee');
  for (const f of p.focusAreas ?? []) out.push(f);
  return out;
}

/** Someone else's profile: header, connect/message/call, details and recent posts. */
export function PersonScreen({ userId, onBack, onOpenMessages }: { userId: string; onBack: () => void; onOpenMessages: (id: string, name: string) => void }) {
  const { api } = useAuth();
  const { callUser } = useCalling();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const { profile, posts } = await api.getProfile(userId);
      setProfile(profile);
      setPosts(posts);
    } catch {
      setMissing(true);
    }
  }, [api, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (fn: () => Promise<{ status: ConnectionState }>) => {
    if (busy) return;
    setBusy(true);
    try {
      const { status } = await fn();
      setProfile((p) => (p ? { ...p, connection: status } : p));
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  };

  if (missing) {
    return (
      <View style={styles.page}>
        <Pressable onPress={onBack} hitSlop={10}><Text style={styles.back}>‹ Back</Text></Pressable>
        <Text style={styles.empty}>This person doesn’t have a profile yet.</Text>
      </View>
    );
  }
  if (!profile) {
    return (
      <View style={[styles.page, styles.center]}>
        <ActivityIndicator color={theme.primaryText} size="large" />
      </View>
    );
  }

  const full = profile.connection === 'connected' || profile.connection === 'self';
  const sub = [profile.headline, profile.location].filter(Boolean).join(' · ');
  const badges = roleBadges(profile);

  return (
    <ScrollView style={styles.page} contentContainerStyle={{ paddingBottom: 36 }}>
      <Pressable onPress={onBack} hitSlop={10}><Text style={styles.back}>‹ Back</Text></Pressable>

      <View style={styles.card}>
        <View style={styles.hero}>
          <Avatar id={profile.userId} name={profile.name} photoUrl={profile.photoUrl} size={82} />
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{profile.name || 'Member'}</Text>
            {!!sub && <Text style={styles.sub}>{sub}</Text>}
            {badges.length > 0 && (
              <View style={styles.badgeRow}>
                {badges.map((b) => <Text key={b} style={styles.badge}>{b}</Text>)}
              </View>
            )}
          </View>
        </View>

        {profile.connection !== 'self' && (
          <View style={styles.actions}>
            {busy ? (
              <ActivityIndicator color={theme.primaryText} />
            ) : profile.connection === 'connected' ? (
              <>
                <Pressable style={[styles.btn, styles.btnSecondary]} onPress={() => onOpenMessages(profile.userId, profile.name)}>
                  <Text style={styles.btnSecondaryText}>Message</Text>
                </Pressable>
                <Pressable style={[styles.btn, styles.btnPrimary]} onPress={() => callUser(profile.userId, profile.name)}>
                  <Text style={styles.btnPrimaryText}>📹  Video call</Text>
                </Pressable>
              </>
            ) : profile.connection === 'pending_incoming' ? (
              <>
                <Pressable style={[styles.btn, styles.btnPrimary]} onPress={() => void act(() => api.acceptConnect(profile.userId))}>
                  <Text style={styles.btnPrimaryText}>Accept invitation</Text>
                </Pressable>
                <Pressable style={[styles.btn, styles.btnSecondary]} onPress={() => void act(() => api.declineConnect(profile.userId))}>
                  <Text style={styles.btnSecondaryText}>Decline</Text>
                </Pressable>
              </>
            ) : profile.connection === 'pending_outgoing' ? (
              <Pressable style={[styles.btn, styles.btnSecondary]} onPress={() => void act(() => api.removeConnect(profile.userId))}>
                <Text style={styles.btnSecondaryText}>Requested — cancel</Text>
              </Pressable>
            ) : (
              <Pressable style={[styles.btn, styles.btnPrimary]} onPress={() => void act(() => api.requestConnect(profile.userId))}>
                <Text style={styles.btnPrimaryText}>Connect</Text>
              </Pressable>
            )}
          </View>
        )}

        {profile.skills.length > 0 && (
          <View style={styles.skills}>
            {profile.skills.map((s) => <Text key={s} style={styles.skillPill}>{s}</Text>)}
          </View>
        )}

        {full ? (
          <>
            {!!profile.bio && <Text style={styles.bio}>{profile.bio}</Text>}
            {!!profile.mobile && <Text style={styles.field}><Text style={styles.fieldLabel}>Mobile: </Text>{profile.mobile}</Text>}
            {!!profile.cvUrl && (
              <Pressable style={[styles.btn, styles.btnSecondary, { alignSelf: 'flex-start', marginTop: 10 }]} onPress={() => void Linking.openURL(profile.cvUrl as string).catch(() => {})}>
                <Text style={styles.btnSecondaryText}>Download CV</Text>
              </Pressable>
            )}
            {(profile.experience ?? []).length > 0 && (
              <View style={styles.detailSection}>
                <Text style={styles.detailTitle}>Experience</Text>
                {(profile.experience ?? []).map((x, i) => (
                  <Text key={i} style={styles.field}>
                    <Text style={styles.fieldLabel}>{x.title}</Text>
                    {x.company ? ` · ${x.company}` : ''}{x.start || x.end ? ` (${x.start}–${x.end})` : ''}
                  </Text>
                ))}
              </View>
            )}
            {(profile.education ?? []).length > 0 && (
              <View style={styles.detailSection}>
                <Text style={styles.detailTitle}>Education</Text>
                {(profile.education ?? []).map((x, i) => (
                  <Text key={i} style={styles.field}>
                    <Text style={styles.fieldLabel}>{x.school}</Text>
                    {x.degree ? ` · ${x.degree}` : ''}{x.year ? ` (${x.year})` : ''}
                  </Text>
                ))}
              </View>
            )}
          </>
        ) : (
          <Text style={styles.locked}>Connect to see {profile.name || 'this person'}’s full profile, CV and contact details.</Text>
        )}
      </View>

      {posts.length > 0 && (
        <View style={styles.posts}>
          <Text style={styles.postsTitle}>Recent posts</Text>
          {posts.map((p) => (
            <View key={p.id} style={styles.post}>
              <Text style={styles.postBy}>{p.authorName} · <Text style={styles.postTime}>{ago(p.createdAt)}</Text></Text>
              {!!p.text && <Text style={styles.postText}>{p.text}</Text>}
              {!!p.imageUrl && <Image source={{ uri: p.imageUrl }} style={styles.postImage} resizeMode="cover" />}
              <Text style={styles.postMeta}>♥ {p.likeCount}   💬 {p.comments.length}</Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, paddingHorizontal: 16, paddingTop: 10 },
  center: { alignItems: 'center', justifyContent: 'center' },
  back: { color: theme.primaryText, fontSize: 16, fontFamily: fonts.bold, paddingVertical: 6 },
  card: { marginTop: 8, padding: 16, borderRadius: 16, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  name: { color: theme.text, fontSize: 22, fontFamily: fonts.bold },
  sub: { color: theme.muted, fontSize: 14, fontFamily: fonts.regular, marginTop: 2 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  badge: { color: theme.accentText, backgroundColor: theme.sparkSoft, fontSize: 12, fontFamily: fonts.bold, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, overflow: 'hidden' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  btn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  btnPrimary: { backgroundColor: theme.primary },
  btnPrimaryText: { color: theme.onPrimary, fontFamily: fonts.bold, fontSize: 14 },
  btnSecondary: { backgroundColor: theme.surface2, borderWidth: 1, borderColor: theme.border },
  btnSecondaryText: { color: theme.text, fontFamily: fonts.bold, fontSize: 14 },
  skills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 16 },
  skillPill: { color: theme.text, backgroundColor: theme.surface2, borderWidth: 1, borderColor: theme.border, fontSize: 12.5, fontFamily: fonts.regular, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, overflow: 'hidden' },
  bio: { color: theme.text, fontSize: 15, lineHeight: 22, marginTop: 16, fontFamily: fonts.regular },
  field: { color: theme.text, fontSize: 14.5, lineHeight: 21, marginTop: 6, fontFamily: fonts.regular },
  fieldLabel: { fontFamily: fonts.bold },
  detailSection: { marginTop: 16 },
  detailTitle: { color: theme.muted, fontSize: 13, fontFamily: fonts.bold, marginBottom: 2, letterSpacing: 0.3 },
  locked: { color: theme.muted, fontSize: 14, lineHeight: 20, marginTop: 16, fontFamily: fonts.regular },
  posts: { marginTop: 20, gap: 12 },
  postsTitle: { color: theme.text, fontSize: 16, fontFamily: fonts.bold, paddingHorizontal: 2 },
  post: { padding: 14, borderRadius: 14, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border },
  postBy: { color: theme.text, fontSize: 14, fontFamily: fonts.bold },
  postTime: { color: theme.faint, fontSize: 12, fontFamily: fonts.regular },
  postText: { color: theme.text, fontSize: 15, lineHeight: 21, marginTop: 8, fontFamily: fonts.regular },
  postImage: { width: '100%', aspectRatio: 4 / 3, borderRadius: 10, marginTop: 8, backgroundColor: theme.well },
  postMeta: { color: theme.muted, fontSize: 13, marginTop: 10, fontFamily: fonts.bold },
  empty: { color: theme.muted, textAlign: 'center', padding: 36, lineHeight: 20, fontFamily: fonts.regular },
});
