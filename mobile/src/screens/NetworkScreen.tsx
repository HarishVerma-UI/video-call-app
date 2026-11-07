import type { ConnectionState, Profile } from '@vca/shared';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '../auth';
import { useCalling } from '../calling';
import { Avatar } from '../components/Avatar';
import { fonts, theme } from '../config';

interface Nav {
  onOpenPerson: (id: string) => void;
  onOpenMessages: (id: string, name: string) => void;
}

/** A person row with connect / accept / message + call controls. */
function PersonRow({ profile, onChange, nav }: { profile: Profile; onChange: (userId: string, next: ConnectionState) => void; nav: Nav }) {
  const { api } = useAuth();
  const { callUser } = useCalling();
  const [busy, setBusy] = useState(false);

  const act = async (fn: () => Promise<{ status: ConnectionState }>) => {
    if (busy) return;
    setBusy(true);
    try {
      const { status } = await fn();
      onChange(profile.userId, status);
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  };

  const sub = [profile.headline, profile.location].filter(Boolean).join(' · ');

  return (
    <View style={styles.row}>
      <Pressable style={styles.rowMain} onPress={() => nav.onOpenPerson(profile.userId)}>
        <Avatar id={profile.userId} name={profile.name} photoUrl={profile.photoUrl} size={46} />
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={1}>{profile.name || 'Member'}</Text>
          {!!sub && <Text style={styles.sub} numberOfLines={1}>{sub}</Text>}
          {profile.skills.length > 0 && <Text style={styles.skills} numberOfLines={1}>{profile.skills.slice(0, 3).join(' · ')}</Text>}
        </View>
      </Pressable>

      <View style={styles.rowActions}>
        {busy ? (
          <ActivityIndicator color={theme.primaryText} />
        ) : profile.connection === 'connected' ? (
          <>
            <Pressable style={styles.iconBtn} onPress={() => nav.onOpenMessages(profile.userId, profile.name)} accessibilityLabel={`Message ${profile.name}`}>
              <Text style={styles.iconBtnText}>💬</Text>
            </Pressable>
            <Pressable style={[styles.iconBtn, styles.iconBtnPrimary]} onPress={() => callUser(profile.userId, profile.name)} accessibilityLabel={`Video call ${profile.name}`}>
              <Text style={styles.iconBtnText}>📹</Text>
            </Pressable>
          </>
        ) : profile.connection === 'pending_incoming' ? (
          <>
            <Pressable style={[styles.pill, styles.pillPrimary]} onPress={() => void act(() => api.acceptConnect(profile.userId))}>
              <Text style={styles.pillPrimaryText}>Accept</Text>
            </Pressable>
            <Pressable style={styles.pill} onPress={() => void act(() => api.declineConnect(profile.userId))}>
              <Text style={styles.pillText}>Decline</Text>
            </Pressable>
          </>
        ) : profile.connection === 'pending_outgoing' ? (
          <Pressable style={styles.pill} onPress={() => void act(() => api.removeConnect(profile.userId))}>
            <Text style={styles.pillText}>Requested</Text>
          </Pressable>
        ) : profile.connection === 'none' ? (
          <Pressable style={[styles.pill, styles.pillPrimary]} onPress={() => void act(() => api.requestConnect(profile.userId))}>
            <Text style={styles.pillPrimaryText}>Connect</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export function NetworkScreen({ onOpenPerson, onOpenMessages }: Nav) {
  const { api } = useAuth();
  const nav = { onOpenPerson, onOpenMessages };
  const [requests, setRequests] = useState<Profile[]>([]);
  const [connections, setConnections] = useState<Profile[]>([]);
  const [people, setPeople] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    const [req, conn, ppl] = await Promise.allSettled([api.listRequests(), api.listConnections(), api.searchPeople()]);
    if (req.status === 'fulfilled') setRequests(req.value.requests);
    if (conn.status === 'fulfilled') setConnections(conn.value.connections);
    if (ppl.status === 'fulfilled') setPeople(ppl.value.people.filter((p) => p.connection === 'none'));
    setLoading(false);
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  // Debounced people search.
  useEffect(() => {
    const term = q.trim();
    const t = setTimeout(() => {
      api
        .searchPeople(term ? { q: term } : undefined)
        .then(({ people }) => setPeople(term ? people : people.filter((p) => p.connection === 'none')))
        .catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [q, api]);

  // When a connection state changes anywhere, move the person between buckets.
  const onChange = (userId: string, next: ConnectionState) => {
    const patch = (list: Profile[]) => list.map((p) => (p.userId === userId ? { ...p, connection: next } : p));
    setRequests((r) => (next === 'connected' || next === 'none' ? r.filter((p) => p.userId !== userId) : patch(r)));
    setPeople(patch);
    setConnections(patch);
    if (next === 'connected') void load();
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.primaryText} size="large" />
      </View>
    );
  }

  type Section = { key: string; title: string; data: Profile[] };
  const sections: Section[] = [];
  if (requests.length) sections.push({ key: 'req', title: `Invitations (${requests.length})`, data: requests });
  sections.push({ key: 'conn', title: `Your connections (${connections.length})`, data: connections });
  sections.push({ key: 'ppl', title: q.trim() ? 'Search results' : 'People you may know', data: people });

  // Flatten into a single list with header rows so one FlatList covers all sections.
  type Item = { kind: 'header'; title: string; key: string } | { kind: 'person'; profile: Profile };
  const items: Item[] = [];
  for (const s of sections) {
    items.push({ kind: 'header', title: s.title, key: s.key });
    if (s.data.length === 0) items.push({ kind: 'header', title: '', key: `${s.key}-empty` });
    for (const p of s.data) items.push({ kind: 'person', profile: p });
  }

  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.h1}>Network</Text>
      <View style={styles.searchRow}>
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Search people by name or skill"
          placeholderTextColor={theme.faint}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.search}
        />
      </View>
      <FlatList
        data={items}
        keyExtractor={(it) => (it.kind === 'header' ? it.key : it.profile.userId)}
        contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 24 }}
        renderItem={({ item }) =>
          item.kind === 'header' ? (
            item.title ? <Text style={styles.section}>{item.title}</Text> : <Text style={styles.sectionEmpty}>Nothing here yet.</Text>
          ) : (
            <PersonRow profile={item.profile} onChange={onChange} nav={nav} />
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  h1: { color: theme.text, fontSize: 26, fontFamily: fonts.bold, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 6 },
  searchRow: { paddingHorizontal: 16, paddingBottom: 8 },
  search: { height: 42, borderRadius: 10, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface2, color: theme.text, paddingHorizontal: 14, fontSize: 15, fontFamily: fonts.regular },
  section: { color: theme.muted, fontSize: 13, fontFamily: fonts.bold, marginTop: 18, marginBottom: 6, paddingHorizontal: 4, letterSpacing: 0.3 },
  sectionEmpty: { color: theme.faint, fontSize: 13, fontFamily: fonts.regular, paddingHorizontal: 4, paddingVertical: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.border },
  rowMain: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  name: { color: theme.text, fontSize: 15, fontFamily: fonts.bold },
  sub: { color: theme.muted, fontSize: 13, fontFamily: fonts.regular, marginTop: 1 },
  skills: { color: theme.faint, fontSize: 12, fontFamily: fonts.regular, marginTop: 1 },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface },
  pillText: { color: theme.text, fontFamily: fonts.bold, fontSize: 13 },
  pillPrimary: { backgroundColor: theme.primary, borderColor: 'transparent' },
  pillPrimaryText: { color: theme.onPrimary, fontFamily: fonts.bold, fontSize: 13 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface },
  iconBtnPrimary: { backgroundColor: theme.primarySoft, borderColor: 'transparent' },
  iconBtnText: { fontSize: 17 },
});
