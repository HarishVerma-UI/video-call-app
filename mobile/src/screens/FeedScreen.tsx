import { ApiError, type Ad, type AuthUser, type Post } from '@vca/shared';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAuth } from '../auth';
import { Avatar } from '../components/Avatar';
import { fonts, theme } from '../config';
import { ago } from '../format';

const replacePost = (posts: Post[], p: Post) => posts.map((x) => (x.id === p.id ? p : x));

/** One post with like + comments, matching the web feed. */
function PostCard({ post, me, onChange, onOpenPerson }: { post: Post; me: AuthUser; onChange: (p: Post) => void; onOpenPerson: (id: string) => void }) {
  const { api } = useAuth();
  const [busy, setBusy] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);

  const like = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { post: updated } = await api.likePost(post.id);
      onChange(updated);
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  };
  const addComment = async () => {
    const t = comment.trim();
    if (!t || sending) return;
    setSending(true);
    try {
      const { post: updated } = await api.commentPost(post.id, t);
      onChange(updated);
      setComment('');
      setShowComments(true);
    } catch {
      /* ignore */
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={styles.post}>
      <Pressable style={styles.postHead} onPress={() => onOpenPerson(post.authorId)}>
        <Avatar id={post.authorId} name={post.authorName} photoUrl={post.authorPhotoUrl} size={40} />
        <View style={{ flex: 1 }}>
          <Text style={styles.author} numberOfLines={1}>{post.authorName}</Text>
          <Text style={styles.time}>{ago(post.createdAt)}</Text>
        </View>
      </Pressable>
      {!!post.text && <Text style={styles.body}>{post.text}</Text>}
      {!!post.imageUrl && <Image source={{ uri: post.imageUrl }} style={styles.image} resizeMode="cover" />}

      <View style={styles.actions}>
        <Pressable style={styles.action} onPress={() => void like()} accessibilityLabel={post.likedByMe ? 'Unlike' : 'Like'}>
          <Text style={[styles.actionIcon, post.likedByMe && { color: theme.hot }]}>{post.likedByMe ? '♥' : '♡'}</Text>
          <Text style={[styles.actionText, post.likedByMe && { color: theme.hot }]}>{post.likeCount}</Text>
        </Pressable>
        <Pressable style={styles.action} onPress={() => setShowComments((s) => !s)}>
          <Text style={styles.actionIcon}>💬</Text>
          <Text style={styles.actionText}>{post.comments.length}</Text>
        </Pressable>
      </View>

      {showComments && (
        <View style={styles.comments}>
          {post.comments.map((c) => (
            <View key={c.id} style={styles.comment}>
              <Pressable onPress={() => onOpenPerson(c.userId)}>
                <Avatar id={c.userId} name={c.name} size={28} />
              </Pressable>
              <View style={styles.commentBubble}>
                <Text style={styles.commentName}>{c.name} · <Text style={styles.commentTime}>{ago(c.ts)}</Text></Text>
                <Text style={styles.commentText}>{c.text}</Text>
              </View>
            </View>
          ))}
          <View style={styles.commentCompose}>
            <Avatar id={me.id} name={me.name} size={28} />
            <TextInput
              value={comment}
              onChangeText={setComment}
              placeholder="Write a comment…"
              placeholderTextColor={theme.faint}
              style={styles.commentInput}
              multiline
              maxLength={500}
            />
            <Pressable onPress={() => void addComment()} disabled={!comment.trim() || sending} hitSlop={8}>
              <Text style={[styles.commentSend, (!comment.trim() || sending) && { color: theme.faint }]}>➤</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

function AdCard({ ad }: { ad: Ad }) {
  return (
    <Pressable style={styles.ad} onPress={() => ad.linkUrl && void Linking.openURL(ad.linkUrl).catch(() => {})}>
      <Text style={styles.adTag}>Sponsored</Text>
      {!!ad.imageUrl && <Image source={{ uri: ad.imageUrl }} style={styles.adImage} resizeMode="cover" />}
      <Text style={styles.adTitle}>{ad.title}</Text>
      {!!ad.body && <Text style={styles.adBody}>{ad.body}</Text>}
    </Pressable>
  );
}

export function FeedScreen({ user, onOpenPerson }: { user: AuthUser; onOpenPerson: (id: string) => void }) {
  const { api } = useAuth();
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [ads, setAds] = useState<Ad[]>([]);
  const [stat, setStat] = useState<{ totalUsers: number; online: number } | null>(null);
  const [text, setText] = useState('');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  const load = useCallback(async () => {
    const [feed, adRes, statRes] = await Promise.allSettled([api.getFeed(), api.ads(), api.stats()]);
    if (feed.status === 'fulfilled') {
      setPosts(feed.value.posts);
      setHasMore(feed.value.posts.length >= 20);
    } else setPosts((p) => p ?? []);
    if (adRes.status === 'fulfilled') setAds(adRes.value.ads.filter((a) => a.active));
    if (statRes.status === 'fulfilled') setStat(statRes.value);
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };
  const loadMore = async () => {
    if (!posts?.length || loadingMore || !hasMore) return;
    const oldest = posts[posts.length - 1];
    const before = oldest.createdAt ? new Date(oldest.createdAt).getTime() : undefined;
    if (!before) return;
    setLoadingMore(true);
    try {
      const { posts: older } = await api.getFeed(before);
      setPosts((cur) => [...(cur ?? []), ...older.filter((o) => !(cur ?? []).some((p) => p.id === o.id))]);
      setHasMore(older.length >= 20);
    } catch {
      /* ignore */
    } finally {
      setLoadingMore(false);
    }
  };

  const submit = async () => {
    const t = text.trim();
    if (!t || posting) return;
    setPosting(true);
    setError(null);
    try {
      const { post } = await api.createPost({ text: t });
      setPosts((cur) => [post, ...(cur ?? [])]);
      setText('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Couldn’t share your post.');
    } finally {
      setPosting(false);
    }
  };

  const change = (p: Post) => setPosts((cur) => (cur ? replacePost(cur, p) : cur));

  const header = (
    <View>
      {stat && (
        <View style={styles.statRow}>
          <Text style={styles.stat}>
            <Text style={styles.statNum}>{stat.totalUsers.toLocaleString()}</Text> members on Huddle
            {stat.online > 0 ? <Text>  ·  <Text style={{ color: theme.live }}>{stat.online} online now</Text></Text> : null}
          </Text>
        </View>
      )}
      <View style={styles.composer}>
        <Avatar id={user.id} name={user.name} size={40} />
        <View style={{ flex: 1 }}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Share an update with your network…"
            placeholderTextColor={theme.faint}
            style={styles.composerInput}
            multiline
            maxLength={2000}
          />
          <View style={styles.composerBar}>
            {!!error && <Text style={styles.error}>{error}</Text>}
            <Pressable style={[styles.postBtn, (!text.trim() || posting) && { opacity: 0.5 }]} onPress={() => void submit()} disabled={!text.trim() || posting}>
              {posting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.postBtnText}>Post</Text>}
            </Pressable>
          </View>
        </View>
      </View>
      {ads[0] && <AdCard ad={ads[0]} />}
    </View>
  );

  if (posts === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.primaryText} size="large" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <FlatList
        data={posts}
        keyExtractor={(p) => p.id}
        ListHeaderComponent={header}
        contentContainerStyle={{ padding: 14, paddingBottom: 30, gap: 12 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={theme.primaryText} />}
        onEndReachedThreshold={0.4}
        onEndReached={() => void loadMore()}
        ListEmptyComponent={<Text style={styles.empty}>No posts yet. Share the first update with your network.</Text>}
        ListFooterComponent={loadingMore ? <ActivityIndicator style={{ marginVertical: 16 }} color={theme.primaryText} /> : null}
        renderItem={({ item, index }) => (
          <View style={{ gap: 12 }}>
            <PostCard post={item} me={user} onChange={change} onOpenPerson={onOpenPerson} />
            {index === 2 && ads[1] ? <AdCard ad={ads[1]} /> : null}
          </View>
        )}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  statRow: { marginBottom: 12, paddingHorizontal: 2 },
  stat: { color: theme.muted, fontSize: 13, fontFamily: fonts.regular },
  statNum: { color: theme.text, fontFamily: fonts.bold },
  composer: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: 14, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border },
  composerInput: { color: theme.text, fontSize: 15, minHeight: 38, maxHeight: 140, paddingTop: 6, fontFamily: fonts.regular },
  composerBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 10, marginTop: 6 },
  error: { flex: 1, color: theme.hotSoft, fontSize: 12.5, fontFamily: fonts.regular },
  postBtn: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 8, backgroundColor: theme.primary },
  postBtnText: { color: theme.onPrimary, fontFamily: fonts.bold, fontSize: 14 },
  post: { padding: 14, borderRadius: 14, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border },
  postHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  author: { color: theme.text, fontSize: 15, fontFamily: fonts.bold },
  time: { color: theme.faint, fontSize: 12, fontFamily: fonts.regular, marginTop: 1 },
  body: { color: theme.text, fontSize: 15, lineHeight: 21, marginTop: 10, fontFamily: fonts.regular },
  image: { width: '100%', aspectRatio: 4 / 3, borderRadius: 10, marginTop: 10, backgroundColor: theme.well },
  actions: { flexDirection: 'row', gap: 22, marginTop: 12 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionIcon: { fontSize: 18, color: theme.muted },
  actionText: { color: theme.muted, fontSize: 14, fontFamily: fonts.bold },
  comments: { marginTop: 12, gap: 10, borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 12 },
  comment: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  commentBubble: { flex: 1, backgroundColor: theme.surface2, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  commentName: { color: theme.text, fontSize: 13, fontFamily: fonts.bold },
  commentTime: { color: theme.faint, fontSize: 12, fontFamily: fonts.regular },
  commentText: { color: theme.text, fontSize: 14, lineHeight: 19, marginTop: 2, fontFamily: fonts.regular },
  commentCompose: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  commentInput: { flex: 1, color: theme.text, fontSize: 14, maxHeight: 100, minHeight: 36, backgroundColor: theme.surface2, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 8, fontFamily: fonts.regular },
  commentSend: { color: theme.primaryText, fontSize: 18, paddingHorizontal: 4 },
  ad: { padding: 14, borderRadius: 14, backgroundColor: theme.sparkSoft, borderWidth: 1, borderColor: theme.border, gap: 6 },
  adTag: { color: theme.accentText, fontSize: 11, letterSpacing: 0.8, fontFamily: fonts.bold },
  adImage: { width: '100%', aspectRatio: 16 / 9, borderRadius: 10, backgroundColor: theme.well },
  adTitle: { color: theme.text, fontSize: 16, fontFamily: fonts.bold },
  adBody: { color: theme.muted, fontSize: 14, lineHeight: 19, fontFamily: fonts.regular },
  empty: { color: theme.muted, textAlign: 'center', padding: 36, lineHeight: 20, fontFamily: fonts.regular },
});
