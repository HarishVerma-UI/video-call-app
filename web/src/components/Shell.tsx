import { generateRoomId, normalizeRoomId, type AuthUser } from '@vca/shared';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import type { LocalMedia } from '../hooks/useLocalMedia';
import { AdminView } from './AdminView';
import { Aperture } from './Aperture';
import { CallsView } from './CallsView';
import { ChatView } from './ChatView';
import { ChatIcon, PeopleIcon, SearchIcon, ShieldIcon, SparkIcon, UserIcon, VideoIcon } from './Icons';
import { MeetView } from './MeetView';
import { ModeToggle } from './ModeToggle';
import { ProfileView } from './ProfileView';
import { Avatar } from './RoomBadge';
import { FeedView } from './social/FeedView';
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
  | { view: 'admin' };

export function parseRoute(path = location.pathname): Route {
  const seg = path.split('/').filter(Boolean).map(decodeURIComponent);
  if (seg[0] === 'r') return { view: 'meet', room: normalizeRoomId(seg[1] ?? '') ?? '' };
  if (seg[0] === 'meet') return { view: 'meet', room: '' };
  if (seg[0] === 'chat') return { view: 'chat', room: normalizeRoomId(seg[1] ?? '') ?? '' };
  if (seg[0] === 'calls') return { view: 'calls' };
  if (seg[0] === 'profile') return { view: 'profile' };
  if (seg[0] === 'admin') return { view: 'admin' };
  if (seg[0] === 'people') return { view: 'people' };
  if (seg[0] === 'network') return { view: 'network' };
  if (seg[0] === 'messages') return { view: 'messages', user: seg[1] ?? '' };
  if (seg[0] === 'u') return { view: 'person', id: seg[1] ?? '' };
  return { view: 'feed' };
}

export function routePath(r: Route): string {
  if (r.view === 'feed') return '/';
  if (r.view === 'meet') return r.room ? `/r/${encodeURIComponent(r.room)}` : '/meet';
  if (r.view === 'chat') return r.room ? `/chat/${encodeURIComponent(r.room)}` : '/chat';
  if (r.view === 'messages') return r.user ? `/messages/${encodeURIComponent(r.user)}` : '/messages';
  if (r.view === 'person') return `/u/${encodeURIComponent(r.id)}`;
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

const RAIL: { view: Route['view']; label: string; icon: ReactNode; testId: string }[] = [
  { view: 'feed', label: 'Feed', icon: <SparkIcon />, testId: 'rail-feed' },
  { view: 'people', label: 'People', icon: <PeopleIcon />, testId: 'rail-people' },
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
  const [query, setQuery] = useState('');

  const search = (e: FormEvent) => {
    e.preventDefault();
    const id = normalizeRoomId(query);
    if (!id) return;
    setQuery('');
    go({ view: 'chat', room: id });
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
        <form className="titlebar__search" onSubmit={search} role="search">
          <SearchIcon width={16} height={16} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Go to a room: type its code and press Enter"
            aria-label="Go to a room by code"
            spellCheck={false}
          />
        </form>
        <div className="titlebar__end">
          <ModeToggle />
          <button className="titlebar__me" onClick={() => go({ view: 'profile' })} data-testid="open-profile" aria-label="Your profile" title={user.name}>
            <Avatar id={user.id} name={user.name} size={32} />
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
          <button
            className={`rail__item${route.view === 'admin' ? ' is-on' : ''}`}
            onClick={() => go({ view: 'admin' })}
            aria-current={route.view === 'admin' ? 'page' : undefined}
            data-testid="rail-admin"
          >
            <ShieldIcon />
            <span>Admin</span>
          </button>
        )}
        <button
          className={`rail__item rail__item--me${route.view === 'profile' ? ' is-on' : ''}`}
          onClick={() => go({ view: 'profile' })}
          aria-current={route.view === 'profile' ? 'page' : undefined}
          data-testid="rail-profile"
        >
          <Avatar id={user.id} name={user.name} size={26} />
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
        {route.view === 'feed' && <FeedView />}
        {route.view === 'people' && <PeopleView openUser={(id) => go({ view: 'person', id })} />}
        {route.view === 'network' && <NetworkView openUser={(id) => go({ view: 'person', id })} openMessages={(id) => go({ view: 'messages', user: id })} />}
        {route.view === 'messages' && <MessagesView key={route.user} initialUser={route.user || undefined} />}
        {route.view === 'person' && (
          <PersonView
            key={route.id}
            userId={route.id}
            openMessages={(id) => go({ view: 'messages', user: id })}
            startCall={() => onJoin(generateRoomId())}
            back={() => go({ view: 'people' })}
          />
        )}
      </div>
    </div>
  );
}
