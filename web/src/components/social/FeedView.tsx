import { ApiError, isSuperAdmin, type Ad, type ApiClient, type ConnectionState, type Post, type Profile } from '@vca/shared';
import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { ago } from '../../format';
import { uploadFile } from '../../upload';
import { ConnectButton, EmojiPicker, ProfileAvatar, roleBadges } from './common';

type FeedNav = {
  openUser: (id: string) => void;
  openMeet: () => void;
  openJobs: () => void;
  openCareer: () => void;
  openProfile: () => void;
  openNetwork: () => void;
};

type FeedCategory = 'Hiring & Referrals';
type FeedTab = 'For You' | FeedCategory | 'Saved';
const FEED_TABS: FeedTab[] = ['For You', 'Hiring & Referrals', 'Saved'];

function postCategory(post: Post): FeedCategory | null {
  if (post.text.startsWith('Role: ')) return 'Hiring & Referrals';
  return null;
}

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

function PostCard({ post, api, me, isAdmin, onChange, onDelete, nav, saved, onToggleSave }: { post: Post; api: ApiClient; me: string; isAdmin: boolean; onChange: (p: Post) => void; onDelete: (id: string) => void; nav: FeedNav; saved: boolean; onToggleSave: (id: string) => void }) {
  const [comment, setComment] = useState('');
  const [showComments, setShowComments] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(post.text);
  const [editBusy, setEditBusy] = useState(false);
  const category = postCategory(post);
  const [roleHeading, roleMeta, ...roleDescription] = category === 'Hiring & Referrals' ? post.text.split('\n') : [];
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
      {category && <span className="post__category">{category}</span>}
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
          {category === 'Hiring & Referrals' ? (
            <div className="post__role">
              <h3>{roleHeading?.replace(/^Role:\s*/, '')}</h3>
              {roleMeta && <span>{roleMeta}</span>}
              {roleDescription.join('\n').trim() && <p className="post__text">{roleDescription.join('\n').trim()}</p>}
            </div>
          ) : post.text ? <p className="post__text">{post.text}</p> : null}
          {post.imageUrl && <img className="post__img" src={post.imageUrl} alt="" loading="lazy" />}
        </>
      )}
      <div className="post__actions">
        <button className={`post__action-btn${post.likedByMe ? ' is-on' : ''}`} onClick={() => void like()} aria-pressed={post.likedByMe}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill={post.likedByMe ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
          {post.likeCount} Like{post.likeCount !== 1 ? 's' : ''}
        </button>
        <button className="post__action-btn" onClick={() => setShowComments((s) => !s)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
          {post.comments.length} Comment{post.comments.length !== 1 ? 's' : ''}
        </button>
        <button className={`post__action-btn${saved ? ' is-on' : ''}`} onClick={() => onToggleSave(post.id)} aria-pressed={saved} aria-label={saved ? 'Remove saved post' : 'Save post'}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill={saved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2"><path d="M6 4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18l-6-4-6 4V4z" /></svg>
          {saved ? 'Saved' : 'Save'}
        </button>
      </div>
      {(showComments || post.comments.length > 0) && (
        <>
          {post.comments.length > 0 && (
            <ul className="post__comments">
              {post.comments.map((c) => (
                <li key={c.id} className="post__comment-row">
                  <ProfileAvatar profile={{ userId: c.userId, name: c.name }} size={32} />
                  <div className="post__comment-body">
                    <div className="post__comment-main">
                      <strong>{c.name}</strong> <span className="post__comment-text">{c.text}</span>
                    </div>
                    <time className="post__comment-time">{ago(c.ts)}</time>
                  </div>
                  {(c.userId === me || post.authorId === me || isAdmin) && (
                    <button className="link-btn post__comment-del" onClick={() => void delComment(c.id)} aria-label="Delete comment" title="Delete comment">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <form className="post__comment" onSubmit={addComment}>
            <div className="post__comment-field">
              <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Write a comment…" aria-label="Write a comment" />
              <EmojiPicker onPick={(em) => setComment((c) => c + em)} />
            </div>
            <button className="btn btn--primary post__comment-send" type="submit" disabled={!comment.trim()}>
              Send
            </button>
          </form>
        </>
      )}
    </article>
  );
}

/* ── Left profile rail ── */

function FeedLeft({ nav, savedCount, onSaved }: { nav: FeedNav; savedCount: number; onSaved: () => void }) {
  const { api, user, photoUrl } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [connCount, setConnCount] = useState<number | null>(null);
  useEffect(() => {
    api.myProfile().then(({ profile: p }) => setProfile(p)).catch(() => {});
    api.listConnections().then(({ connections }) => setConnCount(connections.length)).catch(() => setConnCount(0));
  }, [api]);
  if (!user) return null;
  const headline = profile?.headline?.trim();
  const location = profile?.location?.trim();
  const profileFields = [profile?.headline, profile?.bio, profile?.location, profile?.skills?.length, profile?.experience?.length, profile?.education?.length, photoUrl];
  const profileStrength = Math.round((profileFields.filter(Boolean).length / profileFields.length) * 100);
  return (
    <aside className="feed-left" aria-label="Your summary">
      <div className="sidebar-card feed-me">
        <div className="feed-me__cover" aria-hidden="true" />
        <a className="feed-me__id" href="/profile" onClick={(e) => { e.preventDefault(); nav.openProfile(); }}>
          <ProfileAvatar profile={{ userId: user.id, name: user.name, photoUrl }} size={52} />
          <strong className="feed-me__name">{user.name}<span className="feed-me__member">Member</span></strong>
          {headline ? <span className="feed-me__headline">{headline}</span> : <span className="feed-me__headline feed-me__headline--muted">Add a headline to your profile</span>}
          {location && <span className="feed-me__loc"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></svg>{location}</span>}
        </a>
        <div className="feed-me__strength">
          <div className="feed-me__strength-head"><strong>Profile strength</strong><span>{profileStrength}%</span></div>
          <div className="feed-me__progress"><span style={{ width: `${profileStrength}%` }} /></div>
          <small>{profileStrength < 100 ? 'Add profile details to improve your visibility.' : 'Your profile is looking great.'}</small>
        </div>
        <div className="feed-me__stats">
          <a className="feed-me__stat" href="/network" onClick={(e) => { e.preventDefault(); nav.openNetwork(); }}>
            <b>{connCount ?? '—'}</b>
            <span>Connections</span>
          </a>
          <button className="feed-me__stat" type="button" onClick={onSaved}>
            <b>{savedCount}</b>
            <span>Saved items</span>
          </button>
        </div>
      </div>

      <nav className="sidebar-card feed-left__nav" aria-label="Shortcuts">
        <a className="feed-left__link" href="/profile" onClick={(e) => { e.preventDefault(); nav.openProfile(); }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
          <span>Your profile</span>
        </a>
        <a className="feed-left__link" href="/network" onClick={(e) => { e.preventDefault(); nav.openNetwork(); }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>
          <span>My network</span>
          {connCount !== null && <span className="feed-left__badge">{connCount}</span>}
        </a>
        <a className="feed-left__link" href="/jobs" onClick={(e) => { e.preventDefault(); nav.openJobs(); }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></svg>
          <span>Open roles &amp; referrals</span>
          <span className="feed-left__badge">New</span>
        </a>
        <button className="feed-left__link" type="button" onClick={nav.openCareer}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="10" cy="7" r="4" /><path d="M20 8v6M23 11h-6" /></svg>
          <span>Expert CV review (30m)</span>
          <span className="feed-left__badge">1:1</span>
        </button>
      </nav>
    </aside>
  );
}

/* ── Right sidebar ── */

function FeedSidebar({ suggestions, ads, api, nav, onConn }: { suggestions: Profile[]; ads: Ad[]; api: ApiClient; nav: FeedNav; onConn: (id: string, s: ConnectionState) => void }) {
  return (
    <aside className="feed-sidebar" aria-label="Feed sidebar">
      <div className="sidebar-card">
        <h3 className="sidebar-card__title">
          <span>People &amp; Mentors</span>
          <span className="feed-sidebar__context">On Huddle</span>
        </h3>
        {suggestions.length === 0 ? (
          <p className="sidebar-card__empty">No suggestions right now.</p>
        ) : (
          <ul className="sidebar-people">
            {suggestions.slice(0, 5).map((p) => (
              <li key={p.userId} className="sidebar-people__item">
                <button className="post__author-link" onClick={() => nav.openUser(p.userId)}>
                  <ProfileAvatar profile={p} size={46} />
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

      <div className="sidebar-card feed-expert-card">
        <div className="feed-expert-card__top">
          <span>1:1 Career Studio</span>
          <span><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>30 mins</span>
        </div>
        <div>
          <h3>Generate or review your CV with domain experts</h3>
          <p>Book a focused session with experienced professionals across industries.</p>
        </div>
        <button type="button" className="feed-expert-card__button" onClick={nav.openCareer}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
          Open Career Studio
        </button>
      </div>

      <div className="sidebar-card feed-team-card">
        <div>
          <span>Huddle for teams</span>
          <p>Explore open roles and referrals from your network.</p>
        </div>
        <button type="button" className="feed-team-card__button" onClick={nav.openJobs}>Explore jobs</button>
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

export function FeedView({ openUser, openMeet, openJobs, openCareer, openProfile, openNetwork, composeRoleSignal, savedPostIds, onToggleSavedPost, query, onQueryChange }: { openUser: (id: string) => void; openMeet: () => void; openJobs: () => void; openCareer: () => void; openProfile: () => void; openNetwork: () => void; composeRoleSignal: number; savedPostIds: Set<string>; onToggleSavedPost: (id: string) => void; query: string; onQueryChange: (v: string) => void }) {
  const { api, user, photoUrl } = useAuth();
  const searchQuery = query;
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [suggestions, setSuggestions] = useState<Profile[]>([]);
  const [ads, setAds] = useState<Ad[]>([]);
  const [composerMode, setComposerMode] = useState<'update' | 'job'>('update');
  const [activeFeedTab, setActiveFeedTab] = useState<FeedTab>('For You');
  const [text, setText] = useState('');
  const [roleTitle, setRoleTitle] = useState('');
  const [roleCompany, setRoleCompany] = useState('');
  const [roleLocation, setRoleLocation] = useState('Work from home');
  const [roleSalary, setRoleSalary] = useState('');
  const [imageKey, setImageKey] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<Post[] | null>(null);
  const [peopleResults, setPeopleResults] = useState<Profile[] | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const composerRef = useRef<HTMLFormElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadingMore = useRef(false);

  const nav: FeedNav = { openUser, openMeet, openJobs, openCareer, openProfile, openNetwork };

  useEffect(() => {
    if (composeRoleSignal === 0) return;
    setComposerMode('job');
    composerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [composeRoleSignal]);

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
    if ((composerMode === 'job' && !roleTitle.trim()) || (!text.trim() && !imageKey && composerMode === 'update')) return;
    setBusy(true);
    setErr(null);
    try {
      const postText = composerMode === 'job'
        ? `Role: ${roleTitle.trim()}${roleCompany.trim() ? ` at ${roleCompany.trim()}` : ''}\n${[roleLocation.trim(), roleSalary.trim()].filter(Boolean).join(' · ')}${text.trim() ? `\n\n${text.trim()}` : ''}`
        : text.trim();
      const { post } = await api.createPost({ text: postText, imageKey });
      setPosts((xs) => [post, ...(xs ?? [])]);
      setText('');
      setRoleTitle('');
      setRoleCompany('');
      setRoleLocation('Work from home');
      setRoleSalary('');
      setComposerMode('update');
      setImageKey(null);
      setPreview(null);
      setActiveFeedTab('For You');
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
    if (savedPostIds.has(id)) onToggleSavedPost(id);
  };

  const displayPosts = searchResults ?? posts;
  const filteredPosts = displayPosts?.filter((post) => (
    activeFeedTab === 'For You' ||
    (activeFeedTab === 'Saved' ? savedPostIds.has(post.id) : postCategory(post) === activeFeedTab)
  ));
  return (
    <section className="feed-layout" aria-label="Feed" data-testid="feed">
      <FeedLeft nav={nav} savedCount={savedPostIds.size} onSaved={() => setActiveFeedTab('Saved')} />
      <div className="feed-main">
        {searchQuery.trim() && (
          <div className="feed-results-head">
            <span>Results for “{searchQuery.trim()}”</span>
            <button className="link-btn" onClick={() => onQueryChange('')}>Clear</button>
          </div>
        )}

        {searchQuery.trim() && peopleResults && peopleResults.length > 0 && (
          <div className="card feed-people">
            <h3 className="feed-people__title">People</h3>
            <ul className="people-list">
              {peopleResults.map((p) => <PersonRow key={p.userId} profile={p} api={api} nav={nav} onConn={onConn} />)}
            </ul>
          </div>
        )}

        <form ref={composerRef} className={`card post-composer post-composer--${composerMode}`} onSubmit={submit}>
          <div className="post-composer__switcher">
            <div className="post-composer__modes" role="group" aria-label="Post type">
              {([
                ['update', 'Share Update'],
                ['job', 'Post a Role'],
              ] as const).map(([mode, label]) => (
                <button key={mode} type="button" className={`post-composer__mode${composerMode === mode ? ' is-on' : ''}`} onClick={() => setComposerMode(mode)} aria-pressed={composerMode === mode}>
                  {label}
                </button>
              ))}
            </div>
            <span className="post-composer__hint">Clear, structured posts</span>
          </div>
          {composerMode === 'job' && (
            <div className="post-composer__role-fields">
              <input value={roleTitle} onChange={(e) => setRoleTitle(e.target.value)} placeholder="Role title" aria-label="Role title" required />
              <input value={roleCompany} onChange={(e) => setRoleCompany(e.target.value)} placeholder="Company or team" aria-label="Company or team" />
              <input value={roleLocation} onChange={(e) => setRoleLocation(e.target.value)} placeholder="Location or work mode" aria-label="Location or work mode" />
              <input value={roleSalary} onChange={(e) => setRoleSalary(e.target.value)} placeholder="Pay or bonus (optional)" aria-label="Pay or bonus" />
            </div>
          )}
          <div className="post-composer__top">
            <textarea
              className="pp-textarea post-composer__input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={2}
              placeholder={composerMode === 'job' ? 'Describe the role and ideal candidate...' : 'Share a project win, career milestone, or insight...'}
              aria-label={composerMode === 'job' ? 'Role description' : 'Share an update'}
            />
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
              <EmojiPicker className="post-composer__action post-composer__action--emoji" onPick={(em) => setText((t) => t + em)} />
            </div>
            <input ref={fileInput} type="file" accept="image/*" hidden onChange={(e) => void onImage(e)} />
            <button className="btn btn--primary btn--small" type="submit" disabled={busy || uploading || (composerMode === 'job' ? !roleTitle.trim() : !text.trim() && !imageKey)} data-testid="submit-post">
              {busy ? 'Posting...' : composerMode === 'job' ? 'Publish Role' : 'Post'}
            </button>
          </div>
        </form>

        <div className="feed-tabs" role="tablist" aria-label="Feed categories">
          <div className="feed-tabs__buttons">
            {FEED_TABS.map((tab) => (
              <button key={tab} type="button" role="tab" className={`feed-tab${activeFeedTab === tab ? ' is-on' : ''}`} aria-selected={activeFeedTab === tab} onClick={() => setActiveFeedTab(tab)}>
                {tab}
              </button>
            ))}
          </div>
          <span className="feed-tabs__count">{filteredPosts?.length ?? 0} items</span>
        </div>

        {displayPosts === null ? (
          <div className="skeleton-list" aria-hidden="true"><i /><i /></div>
        ) : !filteredPosts?.length ? (
          <p className="card card__empty">
            {activeFeedTab === 'Saved'
              ? 'No saved posts yet. Save a post to keep it here during this session.'
              : activeFeedTab !== 'For You'
                ? `No ${activeFeedTab.toLowerCase()} posts yet. Share one to start the conversation.`
                : searchQuery
                  ? (peopleResults && peopleResults.length > 0 ? 'No posts match — see people above.' : 'Nothing matches your search.')
                  : 'No posts yet. Share something, or connect with people to see theirs.'}
          </p>
        ) : (
          <>
            {searchQuery.trim() && <h3 className="feed-people__title feed-people__title--posts">Posts</h3>}
            {filteredPosts.map((p) => <PostCard key={p.id} post={p} api={api} me={user.id} isAdmin={isSuperAdmin(user.role)} onChange={update} onDelete={remove} nav={nav} saved={savedPostIds.has(p.id)} onToggleSave={onToggleSavedPost} />)}
            {!searchQuery && activeFeedTab === 'For You' && hasMore && <div ref={sentinelRef} className="feed-sentinel" aria-hidden="true" />}
          </>
        )}
      </div>

      <FeedSidebar suggestions={suggestions} ads={ads} api={api} nav={nav} onConn={onConn} />
    </section>
  );
}
