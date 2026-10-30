import { ApiError, type ApiClient, type Post } from '@vca/shared';
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { ago } from '../../format';
import { uploadFile } from '../../upload';
import { ProfileAvatar } from './common';

function PostCard({ post, api, me, isAdmin, onChange, onDelete }: { post: Post; api: ApiClient; me: string; isAdmin: boolean; onChange: (p: Post) => void; onDelete: (id: string) => void }) {
  const [comment, setComment] = useState('');
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
          <button className="link-btn post__del" onClick={() => void del()}>
            Delete
          </button>
        )}
      </header>
      {post.text && <p className="post__text">{post.text}</p>}
      {post.imageUrl && <img className="post__img" src={post.imageUrl} alt="" />}
      <div className="post__actions">
        <button className={`post__like${post.likedByMe ? ' is-on' : ''}`} onClick={() => void like()}>
          ♥ {post.likeCount > 0 ? post.likeCount : ''} Like
        </button>
        <span>{post.comments.length} comments</span>
      </div>
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
        <button className="btn btn--secondary btn--small" type="submit" disabled={!comment.trim()}>
          Send
        </button>
      </form>
    </article>
  );
}

export function FeedView() {
  const { api, user } = useAuth();
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [text, setText] = useState('');
  const [imageKey, setImageKey] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.getFeed().then(({ posts }) => setPosts(posts)).catch(() => setPosts([]));
  }, [api]);

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
      setErr(ex instanceof ApiError ? ex.message : 'Couldn’t post. Try again.');
    } finally {
      setBusy(false);
    }
  };

  if (!user) return null;
  const update = (p: Post) => setPosts((xs) => (xs ?? []).map((x) => (x.id === p.id ? p : x)));
  const remove = (id: string) => setPosts((xs) => (xs ?? []).filter((x) => x.id !== id));

  return (
    <section className="page page--narrow" aria-label="Feed" data-testid="feed">
      <form className="card composer" onSubmit={submit}>
        <textarea className="pp-textarea" value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="Share an update, a question, or a win…" />
        {preview && <img className="composer__preview" src={preview} alt="" />}
        {err && <p className="form-msg" role="alert">{err}</p>}
        <div className="composer__bar">
          <button type="button" className="btn btn--secondary btn--small" onClick={() => fileInput.current?.click()}>
            Add photo
          </button>
          <input ref={fileInput} type="file" accept="image/*" hidden onChange={(e) => void onImage(e)} />
          <button className="btn btn--primary btn--small" type="submit" disabled={busy || (!text.trim() && !imageKey)} data-testid="submit-post">
            {busy ? 'Posting…' : 'Post'}
          </button>
        </div>
      </form>

      {posts === null ? (
        <div className="skeleton-list" aria-hidden="true"><i /><i /></div>
      ) : posts.length === 0 ? (
        <p className="card__empty">No posts yet. Share something, or connect with people to see theirs.</p>
      ) : (
        posts.map((p) => <PostCard key={p.id} post={p} api={api} me={user.id} isAdmin={user.role === 'admin'} onChange={update} onDelete={remove} />)
      )}
    </section>
  );
}
