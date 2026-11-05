import { ApiError, type Ad, type ApiClient, type ConnectionState, type Post, type Profile } from '@vca/shared';
import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { ago } from '../../format';
import { uploadFile } from '../../upload';
import { ConnectButton, ProfileAvatar, roleBadges } from './common';

type FeedNav = {
  openUser: (id: string) => void;
  openMeet: () => void;
};

/* ── People result row (shown in search + "people you may know") ── */

function PersonRow({ profile, api, nav, onConn }: { profile: Profile; api: ApiClient; nav: FeedNav; onConn: (id: string, s: ConnectionState) => void }) {
  return (
    <li className="people-row">
      <button className="people-row__main" onClick={() => nav.openUser(profile.userId)}>
        <ProfileAvatar profile={profile} size={44} />
        <span className="people-row__text">
          <strong>{profile.name || 'Member'}</strong>
          {profile.headline && <span className="people-row__headline">{profile.headline}</span>}
          {roleBadges(profile).length > 0 && <span className="people-row__roles">{roleBadges(profile).join(' · ')}</span>}
        </span>
      </button>
      <ConnectButton profile={profile} api={api} onChange={(s) => onConn(profile.userId, s)} />
    </li>
  );
}

/* ── Post card ── */

function PostCard({ post, api, me, isAdmin, onChange, onDelete, nav }: { post: Post; api: ApiClient; me: string; isAdmin: boolean; onChange: (p: Post) => void; onDelete: (id: string) => void; nav: FeedNav }) {
  const [comment, setComment] = useState('');
  const [showComments, setShowComments] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(post.text);
  const [editBusy, setEditBusy] = useState(false);
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
  const saveEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editText.trim()) return;
    setEditBusy(true);
    try {
      const { post: updated } = await api.editPost(post.id, editText.trim());
      onChange(updated);
      setEditing(false);
    } catch {
      /* ignore */
    } finally {
      setEditBusy(false);
    }
  };
  const delComment = async (commentId: string) => {
    try {
      await api.deleteComment(post.id, commentId);
      onChange({ ...post, comments: post.comments.filter((c) => c.id !== commentId) });
    } catch {
      /* ignore */
    }
  };
  return (
    <article className="post" data-testid="post">
      <header className="post__head">
        <button className="post__author-link" onClick={() => nav.openUser(post.authorId)} aria-label={`View ${post.authorName}'s profile`}>
          <ProfileAvatar profile={{ userId: post.authorId, name: post.authorName, photoUrl: post.authorPhotoUrl }} size={40} />
        </button>
        <div className="post__by">
          <button className="post__author-link" onClick={() => nav.openUser(post.authorId)}>
            <strong>{post.authorName}</strong>
          </button>
          <span>{ago(post.createdAt)}</span>
        </div>
        {(post.authorId === me || isAdmin) && (
          <span className="post__head-actions">
            {post.authorId === me && (
              <button className="link-btn post__del" onClick={() => { setEditing(true); setEditText(post.text); }} aria-label="Edit post">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
              </button>
            )}
            <button className="link-btn post__del" onClick={() => void del()} aria-label="Delete post">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </span>
        )}
      </header>
      {editing ? (
        <form className="post__edit-form" onSubmit={saveEdit}>
          <textarea className="pp-textarea" value={editText} onChange={(e) => setEditText(e.target.value)} rows={3} />
          <div className="post__edit-actions">
            <button className="btn btn--secondary btn--small" type="button" onClick={() => setEditing(false)}>Cancel</button>
            <button className="btn btn--primary btn--small" type="submit" disabled={editBusy || !editText.trim()}>{editBusy ? 'Saving...' : 'Save'}</button>
          </div>
        </form>
      ) : (
        <>
          {post.text && <p className="post__text">{post.text}</p>}
          {post.imageUrl && <img className="post__img" src={post.imageUrl} alt="" loading="lazy" />}
        </>
      )}
      <div className="post__actions">
        <button className={`post__action-btn${post.likedByMe ? ' is-on' : ''}`} onClick={() => void like()}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill={post.likedByMe ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
          {post.likeCount > 0 ? `${post.likeCount} ` : ''}{post.likedByMe ? 'Unlike' : 'Like'}
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
                  {(c.userId === me || post.authorId === me || isAdmin) && (
                    <button className="link-btn post__comment-del" onClick={() => void delComment(c.id)} aria-label="Delete comment" title="Delete comment">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <form className="post__comment" onSubmit={addComment}>
            <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Write a comment..." aria-label="Write a comment" />
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

function FeedSidebar({ suggestions, ads, api, nav, onConn }: { suggestions: Profile[]; ads: Ad[]; api: ApiClient; nav: FeedNav; onConn: (id: string, s: ConnectionState) => void }) {
  return (
    <aside className="feed-sidebar" aria-label="Feed sidebar">
      <div className="sidebar-card">
        <h3 className="sidebar-card__title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4F6BED" strokeWidth="2" strokeLinecap="round"><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" /></svg>
          Active Huddles
        </h3>
        <p className="sidebar-card__empty">No active video calls right now.</p>
        <button className="btn btn--primary btn--small btn--full" onClick={() => nav.openMeet()}>Start a Huddle</button>
      </div>

      <div className="sidebar-card">
        <h3 className="sidebar-card__title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#43a047" strokeWidth="2" strokeLinecap="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="8.5" cy="7" r="4" /><path d="M20 8v6M23 11h-6" /></svg>
          People you may know
        </h3>
        {suggestions.length === 0 ? (
          <p className="sidebar-card__empty">No suggestions right now.</p>
        ) : (
          <ul className="sidebar-people">
            {suggestions.slice(0, 5).map((p) => (
              <li key={p.userId} className="sidebar-people__item">
                <button className="post__author-link" onClick={() => nav.openUser(p.userId)}>
                  <ProfileAvatar profile={p} size={34} />
                  <span className="sidebar-people__text">
                    <strong>{p.name || 'Member'}</strong>
                    {p.headline && <em>{p.headline}</em>}
                  </span>
                </button>
                <ConnectButton profile={p} api={api} onChange={(s) => onConn(p.userId, s)} />
              </li>
            ))}
          </ul>
        )}
      </div>

      {ads.length > 0 && (
        <div className="sidebar-card">
          <h3 className="sidebar-card__title sidebar-card__title--sponsored">Sponsored</h3>
          <ul className="sidebar-ads">
            {ads.map((ad) => {
              const inner = (
                <>
                  {ad.imageUrl && <img className="sidebar-ads__img" src={ad.imageUrl} alt="" loading="lazy" />}
                  <strong className="sidebar-ads__title">{ad.title}</strong>
                  {ad.body && <span className="sidebar-ads__body">{ad.body}</span>}
                </>
              );
              return (
                <li key={ad.id} className="sidebar-ads__item">
                  {ad.linkUrl ? (
                    <a href={ad.linkUrl} target="_blank" rel="noopener noreferrer nofollow" className="sidebar-ads__link">{inner}</a>
                  ) : (
                    <div className="sidebar-ads__link">{inner}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </aside>
  );
}

/* ── Feed page ── */

export function FeedView({ openUser, openMeet }: { openUser: (id: string) => void; openMeet: () => void }) {
  const { api, user } = useAuth();
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [suggestions, setSuggestions] = useState<Profile[]>([]);
  const [ads, setAds] = useState<Ad[]>([]);
  const [text, setText] = useState('');
  const [imageKey, setImageKey] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Post[] | null>(null);
  const [peopleResults, setPeopleResults] = useState<Profile[] | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const fileInput = useRef<HTMLInputElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadingMore = useRef(false);

  const nav: FeedNav = { openUser, openMeet };

  useEffect(() => {
    api.getFeed().then(({ posts: p }) => {
      setPosts(p);
      setHasMore(p.length >= 10);
    }).catch(() => setPosts([]));
    // "People you may know": anyone not yet connected (server already excludes pending).
    api.searchPeople({}).then(({ people }) => setSuggestions(people.filter((p) => p.connection === 'none'))).catch(() => {});
    api.ads().then(({ ads: a }) => setAds(a)).catch(() => {});
  }, [api]);

  // Debounced unified search: posts AND people.
  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      setSearchResults(null);
      setPeopleResults(null);
      return;
    }
    const t = setTimeout(() => {
      api.searchPosts(q).then(({ posts: p }) => setSearchResults(p)).catch(() => setSearchResults([]));
      api.searchPeople({ q }).then(({ people }) => setPeopleResults(people)).catch(() => setPeopleResults([]));
    }, 300);
    return () => clearTimeout(t);
  }, [api, searchQuery]);

  const onConn = (id: string, connection: ConnectionState) => {
    setSuggestions((xs) => xs.map((p) => (p.userId === id ? { ...p, connection } : p)));
    setPeopleResults((xs) => (xs ? xs.map((p) => (p.userId === id ? { ...p, connection } : p)) : xs));
  };

  const loadMore = useCallback(async () => {
    if (!posts || posts.length === 0 || loadingMore.current || !hasMore) return;
    loadingMore.current = true;
    const last = posts[posts.length - 1];
    const ts = last.createdAt ? new Date(last.createdAt).getTime() : undefined;
    try {
      const { posts: more } = await api.getFeed(ts);
      if (more.length > 0) {
        setPosts((xs) => [...(xs ?? []), ...more]);
      }
      if (more.length < 10) setHasMore(false);
    } catch {
      /* ignore */
    } finally {
      loadingMore.current = false;
    }
  }, [api, posts, hasMore]);

  // IntersectionObserver for infinite scroll
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) void loadMore();
      },
      { rootMargin: '200px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore]);

  const onImage = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr(null);
    setUploading(true);
    try {
      const key = await uploadFile(api, 'post', file);
      setImageKey(key);
      setPreview(URL.createObjectURL(file));
    } catch (ex) {
      setErr(ex instanceof ApiError ? ex.message : (ex as Error).message);
    } finally {
      setUploading(false);
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
  const update = (p: Post) => {
    setPosts((xs) => (xs ?? []).map((x) => (x.id === p.id ? p : x)));
    setSearchResults((xs) => xs && xs.map((x) => (x.id === p.id ? p : x)));
  };
  const remove = (id: string) => {
    setPosts((xs) => (xs ?? []).filter((x) => x.id !== id));
    setSearchResults((xs) => xs && xs.filter((x) => x.id !== id));
  };

  const displayPosts = searchResults ?? posts;

  return (
    <section className="feed-layout" aria-label="Feed" data-testid="feed">
      <div className="feed-main">
        <div className="feed-search card">
          <svg className="feed-search__icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          <input
            className="feed-search__input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search posts and people..."
            aria-label="Search posts and people"
          />
          {searchQuery && (
            <button className="link-btn feed-search__clear" onClick={() => setSearchQuery('')} aria-label="Clear search">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          )}
        </div>

        {searchQuery.trim() && peopleResults && peopleResults.length > 0 && (
          <div className="card feed-people">
            <h3 className="feed-people__title">People</h3>
            <ul className="people-list">
              {peopleResults.map((p) => <PersonRow key={p.userId} profile={p} api={api} nav={nav} onConn={onConn} />)}
            </ul>
          </div>
        )}

        <form className="card post-composer" onSubmit={submit}>
          <div className="post-composer__top">
            <ProfileAvatar profile={{ userId: user.id, name: user.name }} size={40} />
            <textarea className="pp-textarea post-composer__input" value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="Share an update, a question, or a win..." />
          </div>
          {uploading && <p className="form-msg">Uploading image...</p>}
          {preview && <img className="post-composer__preview" src={preview} alt="" />}
          {err && <p className="form-msg" role="alert">{err}</p>}
          <div className="post-composer__bar">
            <div className="post-composer__actions">
              <button type="button" className="post-composer__action" onClick={() => fileInput.current?.click()} disabled={uploading}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#43a047" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
                {uploading ? 'Uploading...' : 'Add photo'}
              </button>
            </div>
            <input ref={fileInput} type="file" accept="image/*" hidden onChange={(e) => void onImage(e)} />
            <button className="btn btn--primary btn--small" type="submit" disabled={busy || uploading || (!text.trim() && !imageKey)} data-testid="submit-post">
              {busy ? 'Posting...' : 'Post'}
            </button>
          </div>
        </form>

        {displayPosts === null ? (
          <div className="skeleton-list" aria-hidden="true"><i /><i /></div>
        ) : displayPosts.length === 0 ? (
          <p className="card card__empty">
            {searchQuery
              ? (peopleResults && peopleResults.length > 0 ? 'No posts match — see people above.' : 'Nothing matches your search.')
              : 'No posts yet. Share something, or connect with people to see theirs.'}
          </p>
        ) : (
          <>
            {searchQuery.trim() && <h3 className="feed-people__title feed-people__title--posts">Posts</h3>}
            {displayPosts.map((p) => <PostCard key={p.id} post={p} api={api} me={user.id} isAdmin={user.role === 'admin'} onChange={update} onDelete={remove} nav={nav} />)}
            {!searchQuery && hasMore && <div ref={sentinelRef} className="feed-sentinel" aria-hidden="true" />}
          </>
        )}
      </div>

      <FeedSidebar suggestions={suggestions} ads={ads} api={api} nav={nav} onConn={onConn} />
    </section>
  );
}
