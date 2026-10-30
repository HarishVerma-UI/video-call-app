import { ApiError, type ApiClient, type Post, type Profile } from '@vca/shared';
import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { ago } from '../../format';
import { uploadFile } from '../../upload';
import { ProfileAvatar } from './common';

/* ── Post card ── */

function PostCard({ post, api, me, isAdmin, onChange, onDelete }: { post: Post; api: ApiClient; me: string; isAdmin: boolean; onChange: (p: Post) => void; onDelete: (id: string) => void }) {
  const [comment, setComment] = useState('');
  const [showComments, setShowComments] = useState(false);
  const like = async () => {
    try {
      onChange((await api.likePost(post.id)).post);
    } catch {
      /* ignore */
    }
  };
  const addComment = async (e: FormEvent) => {
    e.preventDefault();
    if (!comment.trim()) return;
    try {
      onChange((await api.commentPost(post.id, comment.trim())).post);
      setComment('');
    } catch {
      /* ignore */
    }
  };
  const del = async () => {
    if (!window.confirm('Delete this post?')) return;
    try {
      await api.deletePost(post.id);
      onDelete(post.id);
    } catch {
      /* ignore */
    }
  };
  return (
    <article className="post" data-testid="post">
      <header className="post__head">
        <ProfileAvatar profile={{ userId: post.authorId, name: post.authorName, photoUrl: post.authorPhotoUrl }} size={40} />
        <div className="post__by">
          <strong>{post.authorName}</strong>
          <span>{ago(post.createdAt)}</span>
        </div>
        {(post.authorId === me || isAdmin) && (
          <button className="link-btn post__del" onClick={() => void del()} aria-label="Delete post">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        )}
      </header>
      {post.text && <p className="post__text">{post.text}</p>}
      {post.imageUrl && <img className="post__img" src={post.imageUrl} alt="" loading="lazy" />}
      <div className="post__actions">
        <button className={`post__action-btn${post.likedByMe ? ' is-on' : ''}`} onClick={() => void like()}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill={post.likedByMe ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
          {post.likeCount > 0 ? post.likeCount : ''} Like
        </button>
        <button className="post__action-btn" onClick={() => setShowComments((s) => !s)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
          {post.comments.length} Comment{post.comments.length !== 1 ? 's' : ''}
        </button>
      </div>
      {(showComments || post.comments.length > 0) && (
        <>
          {post.comments.length > 0 && (
            <ul className="post__comments">
              {post.comments.map((c) => (
                <li key={c.id}>
                  <strong>{c.name}</strong> {c.text}
                </li>
              ))}
            </ul>
          )}
          <form className="post__comment" onSubmit={addComment}>
            <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Write a comment…" aria-label="Write a comment" />
            <button className="btn btn--primary btn--small" type="submit" disabled={!comment.trim()}>
              Send
            </button>
          </form>
        </>
      )}
    </article>
  );
}

/* ── Right sidebar ── */

function FeedSidebar({ connections }: { connections: Profile[] }) {
  return (
    <aside className="feed-sidebar" aria-label="Feed sidebar">
      <div className="sidebar-card">
        <h3 className="sidebar-card__title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4F6BED" strokeWidth="2" strokeLinecap="round"><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" /></svg>
          Active Huddles
        </h3>
        <p className="sidebar-card__empty">No active video calls right now.</p>
        <button className="btn btn--primary btn--small btn--full">Start a Huddle</button>
      </div>
      <div className="sidebar-card">
        <h3 className="sidebar-card__title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#43a047" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /></svg>
          Online Connections
        </h3>
        {connections.length === 0 ? (
          <p className="sidebar-card__empty">Connect with people to see who's online.</p>
        ) : (
          <ul className="sidebar-card__list">
            {connections.slice(0, 8).map((c) => (
              <li key={c.userId} className="sidebar-card__person">
                <ProfileAvatar profile={c} size={28} />
                <span>{c.name || 'Member'}</span>
                <i className="online-dot" />
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

/* ── Feed page ── */

export function FeedView() {
  const { api, user } = useAuth();
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [connections, setConnections] = useState<Profile[]>([]);
  const [text, setText] = useState('');
  const [imageKey, setImageKey] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.getFeed().then(({ posts }) => setPosts(posts)).catch(() => setPosts([]));
    api.listConnections().then(({ connections: c }) => setConnections(c)).catch(() => {});
  }, [api]);

  const loadMore = useCallback(async () => {
    if (!posts || posts.length === 0) return;
    const last = posts[posts.length - 1];
    const ts = last.createdAt ? new Date(last.createdAt).getTime() : undefined;
    try {
      const { posts: more } = await api.getFeed(ts);
      if (more.length > 0) setPosts((xs) => [...(xs ?? []), ...more]);
    } catch {
      /* ignore */
    }
  }, [api, posts]);

  const onImage = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr(null);
    try {
      const key = await uploadFile(api, 'post', file);
      setImageKey(key);
      setPreview(URL.createObjectURL(file));
    } catch (ex) {
      setErr(ex instanceof ApiError ? ex.message : (ex as Error).message);
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim() && !imageKey) return;
    setBusy(true);
    setErr(null);
    try {
      const { post } = await api.createPost({ text: text.trim(), imageKey });
      setPosts((xs) => [post, ...(xs ?? [])]);
      setText('');
      setImageKey(null);
      setPreview(null);
    } catch (ex) {
      setErr(ex instanceof ApiError ? ex.message : "Couldn't post. Try again.");
    } finally {
      setBusy(false);
    }
  };

  if (!user) return null;
  const update = (p: Post) => setPosts((xs) => (xs ?? []).map((x) => (x.id === p.id ? p : x)));
  const remove = (id: string) => setPosts((xs) => (xs ?? []).filter((x) => x.id !== id));

  return (
    <section className="feed-layout" aria-label="Feed" data-testid="feed">
      <div className="feed-main">
        <form className="card post-composer" onSubmit={submit}>
          <div className="post-composer__top">
            <ProfileAvatar profile={{ userId: user.id, name: user.name }} size={40} />
            <textarea className="pp-textarea post-composer__input" value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="Share an update, a question, or a win…" />
          </div>
          {preview && <img className="post-composer__preview" src={preview} alt="" />}
          {err && <p className="form-msg" role="alert">{err}</p>}
          <div className="post-composer__bar">
            <div className="post-composer__actions">
              <button type="button" className="post-composer__action" onClick={() => fileInput.current?.click()}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#43a047" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
                Add photo
              </button>
            </div>
            <input ref={fileInput} type="file" accept="image/*" hidden onChange={(e) => void onImage(e)} />
            <button className="btn btn--primary btn--small" type="submit" disabled={busy || (!text.trim() && !imageKey)} data-testid="submit-post">
              {busy ? 'Posting…' : 'Post'}
            </button>
          </div>
        </form>

        {posts === null ? (
          <div className="skeleton-list" aria-hidden="true"><i /><i /></div>
        ) : posts.length === 0 ? (
          <p className="card card__empty">No posts yet. Share something, or connect with people to see theirs.</p>
        ) : (
          <>
            {posts.map((p) => <PostCard key={p.id} post={p} api={api} me={user.id} isAdmin={user.role === 'admin'} onChange={update} onDelete={remove} />)}
            <button className="btn btn--secondary btn--full load-more" onClick={() => void loadMore()}>Load more</button>
          </>
        )}
      </div>

      <FeedSidebar connections={connections} />
    </section>
  );
}
