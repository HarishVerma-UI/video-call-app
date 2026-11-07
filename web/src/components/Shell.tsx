import { generateRoomId, normalizeRoomId, type AuthUser } from '@vca/shared';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '../auth/AuthContext';
import type { LocalMedia } from '../hooks/useLocalMedia';
import { AdminView } from './AdminView';
import { Aperture } from './Aperture';
import { CallsView } from './CallsView';
import { ChatView } from './ChatView';
import { ChatIcon, LogsIcon, SearchIcon, ShieldIcon, SparkIcon, UserIcon, VideoIcon } from './Icons';
import { LogsView } from './LogsView';
import { MeetView } from './MeetView';
import { ModeToggle } from './ModeToggle';
import { ProfileView } from './ProfileView';
import { ProfileAvatar } from './social/common';
import { FeedView } from './social/FeedView';
import { NotificationBell } from './NotificationBell';
import { MessagesView } from './social/MessagesView';
import { NetworkView } from './social/NetworkView';
import { PeopleView } from './social/PeopleView';
import { PersonView } from './social/PersonView';

export type Route =
  | { view: 'feed' }
  | { view: 'people' }
  | { view: 'network' }
  | { view: 'messages'; user: string }
  | { view: 'person'; id: string }
  | { view: 'meet'; room: string }
  | { view: 'chat'; room: string }
  | { view: 'calls' }
  | { view: 'profile' }
  | { view: 'admin' }
  | { view: 'logs' }
  | { view: 'not-found' };

export function parseRoute(path = location.pathname): Route {
  const seg = path.split('/').filter(Boolean).map(decodeURIComponent);
  if (seg[0] === 'r') return { view: 'meet', room: normalizeRoomId(seg[1] ?? '') ?? '' };
  if (seg[0] === 'meet') return { view: 'meet', room: '' };
  if (seg[0] === 'chat') return { view: 'chat', room: normalizeRoomId(seg[1] ?? '') ?? '' };
  if (seg[0] === 'calls') return { view: 'calls' };
  if (seg[0] === 'profile') return { view: 'profile' };
  if (seg[0] === 'admin') return { view: 'admin' };
  if (seg[0] === 'logs') return { view: 'logs' };
  if (seg[0] === 'people') return { view: 'people' };
  if (seg[0] === 'network') return { view: 'network' };
  if (seg[0] === 'messages') return { view: 'messages', user: seg[1] ?? '' };
  if (seg[0] === 'u') return { view: 'person', id: seg[1] ?? '' };
  if (seg.length === 0) return { view: 'feed' };
  return { view: 'not-found' };
}

export function routePath(r: Route): string {
  if (r.view === 'feed') return '/';
  if (r.view === 'meet') return r.room ? `/r/${encodeURIComponent(r.room)}` : '/meet';
  if (r.view === 'chat') return r.room ? `/chat/${encodeURIComponent(r.room)}` : '/chat';
  if (r.view === 'messages') return r.user ? `/messages/${encodeURIComponent(r.user)}` : '/messages';
  if (r.view === 'person') return `/u/${encodeURIComponent(r.id)}`;
  if (r.view === 'not-found') return location.pathname;
  return `/${r.view}`;
}

/** Tiny router: the URL is the source of truth, Back/Forward work. */
export function useRoute(): [Route, (r: Route, replace?: boolean) => void] {
  const [route, setRoute] = useState<Route>(() => parseRoute());
  useEffect(() => {
    const onPop = () => setRoute(parseRoute());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const go = (r: Route, replace = false) => {
    const path = routePath(r);
    if (path !== location.pathname) history[replace ? 'replaceState' : 'pushState'](null, '', path);
    setRoute(r);
  };
  return [route, go];
}

// People + Feed are merged into the Home feed, so People is no longer a separate rail item.
const RAIL: { view: Route['view']; label: string; icon: ReactNode; testId: string }[] = [
  { view: 'feed', label: 'Home', icon: <SparkIcon />, testId: 'rail-feed' },
  { view: 'network', label: 'Network', icon: <UserIcon />, testId: 'rail-network' },
  { view: 'messages', label: 'Messages', icon: <ChatIcon />, testId: 'rail-messages' },
  { view: 'meet', label: 'Meet', icon: <VideoIcon />, testId: 'rail-meet' },
];

interface Props {
  user: AuthUser;
  media: LocalMedia;
  route: Route;
  go: (r: Route, replace?: boolean) => void;
  notice: string | null;
  onJoin: (roomId: string) => void;
}

export function Shell({ user, media, route, go, notice, onJoin }: Props) {
  const { api, photoUrl } = useAuth();
  const [search, setSearch] = useState('');
  const [pendingReqs, setPendingReqs] = useState(0);

  const loadRequests = useCallback(() => {
    api.listRequests().then(({ requests }) => setPendingReqs(requests.length)).catch(() => {});
  }, [api]);
  useEffect(() => {
    loadRequests();
    const t = setInterval(loadRequests, 30000);
    return () => clearInterval(t);
  }, [loadRequests]);
  // Refresh the badge whenever the user visits the network page (where requests are actioned).
  useEffect(() => {
    if (route.view === 'network') loadRequests();
  }, [route.view, loadRequests]);

  // One global search for posts + people. Typing jumps to the Home feed, which
  // shows the results.
  const onSearch = (v: string) => {
    setSearch(v);
    if (v && route.view !== 'feed') go({ view: 'feed' });
  };

  const open = (view: Route['view']) => {
    if (view === 'meet') go({ view: 'meet', room: '' });
    else if (view === 'chat') go({ view: 'chat', room: '' });
    else if (view === 'messages') go({ view: 'messages', user: '' });
    else if (view === 'person') return;
    else go({ view });
  };

  return (
    <div className="app" data-view={route.view}>
      <header className="titlebar">
        <a
          className="titlebar__logo"
          href="/"
          onClick={(e) => {
            e.preventDefault();
            open('feed');
          }}
        >
          <Aperture open={0.42} className="mark" />
          <span>Huddle</span>
        </a>
        <form className="titlebar__search" onSubmit={(e) => e.preventDefault()} role="search">
          <SearchIcon width={16} height={16} />
          <input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search posts and people"
            aria-label="Search posts and people"
            spellCheck={false}
            data-testid="global-search"
          />
          {search && (
            <button type="button" className="titlebar__search-clear" onClick={() => setSearch('')} aria-label="Clear search">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          )}
        </form>
        <div className="titlebar__end">
          <NotificationBell onOpenPost={() => go({ view: 'feed' })} />
          <button className="titlebar__icon" onClick={() => go({ view: 'messages', user: '' })} aria-label="Messages" title="Messages" data-testid="top-messages">
            <ChatIcon width={20} height={20} />
          </button>
          <button className="titlebar__icon" onClick={() => go({ view: 'network' })} aria-label={pendingReqs > 0 ? `Requests (${pendingReqs} pending)` : 'Requests'} title="Connection requests" data-testid="top-requests">
            <UserIcon width={20} height={20} />
            {pendingReqs > 0 && <span className="titlebar__badge">{pendingReqs > 9 ? '9+' : pendingReqs}</span>}
          </button>
          <ModeToggle />
          <button className="titlebar__me" onClick={() => go({ view: 'profile' })} data-testid="open-profile" aria-label="Your profile" title={user.name}>
            <ProfileAvatar profile={{ userId: user.id, name: user.name, photoUrl }} size={32} />
            <i className="presence" />
          </button>
        </div>
      </header>

      <nav className="rail" aria-label="Sections">
        {RAIL.map((item) => (
          <button
            key={item.view}
            className={`rail__item${route.view === item.view ? ' is-on' : ''}`}
            onClick={() => open(item.view)}
            aria-current={route.view === item.view ? 'page' : undefined}
            data-testid={item.testId}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
        {user.role === 'admin' && (
          <>
            <button
              className={`rail__item${route.view === 'admin' ? ' is-on' : ''}`}
              onClick={() => go({ view: 'admin' })}
              aria-current={route.view === 'admin' ? 'page' : undefined}
              data-testid="rail-admin"
            >
              <ShieldIcon />
              <span>Admin</span>
            </button>
            <button
              className={`rail__item${route.view === 'logs' ? ' is-on' : ''}`}
              onClick={() => go({ view: 'logs' })}
              aria-current={route.view === 'logs' ? 'page' : undefined}
              data-testid="rail-logs"
            >
              <LogsIcon />
              <span>Logs</span>
            </button>
          </>
        )}
        <button
          className={`rail__item rail__item--me${route.view === 'profile' ? ' is-on' : ''}`}
          onClick={() => go({ view: 'profile' })}
          aria-current={route.view === 'profile' ? 'page' : undefined}
          data-testid="rail-profile"
        >
          <ProfileAvatar profile={{ userId: user.id, name: user.name, photoUrl }} size={26} />
          <span>Profile</span>
        </button>
      </nav>

      <div className="workspace">
        {route.view === 'meet' && (
          <MeetView
            user={user}
            media={media}
            room={route.room}
            setRoom={(room) => go({ view: 'meet', room }, true)}
            notice={notice}
            onJoin={onJoin}
            openChat={(room) => go({ view: 'chat', room })}
          />
        )}
        {route.view === 'chat' && <ChatView user={user} room={route.room} openRoom={(room) => go({ view: 'chat', room })} onJoin={onJoin} />}
        {route.view === 'calls' && <CallsView onJoin={onJoin} openChat={(room) => go({ view: 'chat', room })} />}
        {route.view === 'profile' && <ProfileView />}
        {route.view === 'admin' && <AdminView />}
        {route.view === 'logs' && <LogsView />}
        {route.view === 'feed' && <FeedView openUser={(id) => go({ view: 'person', id })} openMeet={() => go({ view: 'meet', room: '' })} query={search} onQueryChange={setSearch} />}
        {route.view === 'people' && <PeopleView openUser={(id) => go({ view: 'person', id })} />}
        {route.view === 'network' && <NetworkView openUser={(id) => go({ view: 'person', id })} openMessages={(id) => go({ view: 'messages', user: id })} />}
        {route.view === 'messages' && <MessagesView key={route.user} initialUser={route.user || undefined} startCall={(roomId) => onJoin(roomId)} />}
        {route.view === 'person' && (
          <PersonView
            key={route.id}
            userId={route.id}
            openMessages={(id) => go({ view: 'messages', user: id })}
            startCall={() => onJoin(generateRoomId())}
            back={() => go({ view: 'people' })}
          />
        )}
        {route.view === 'not-found' && (
          <section className="page" aria-label="Page not found" style={{ textAlign: 'center', paddingTop: '4rem' }}>
            <h1 style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>404</h1>
            <p style={{ marginBottom: '1.5rem', color: 'var(--muted)' }}>Page not found. The page you are looking for does not exist.</p>
            <button className="btn btn--primary" onClick={() => go({ view: 'feed' })}>Back to Feed</button>
          </section>
        )}
      </div>
    </div>
  );
}
