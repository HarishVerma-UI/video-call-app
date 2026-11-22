import { isStaff, isSuperAdmin, normalizeRoomId, type AuthUser } from '@vca/shared';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext';
import type { LocalMedia } from '../hooks/useLocalMedia';
import { AdminView } from './AdminView';
import { RecruiterDashboard } from './RecruiterDashboard';
import { Aperture } from './Aperture';
import { CallsView } from './CallsView';
import { ChatView } from './ChatView';
import { BriefcaseIcon, ChatIcon, LogsIcon, SearchIcon, ShieldIcon, SignOutIcon, SparkIcon, UserIcon, VideoIcon } from './Icons';
import { JobsView } from './JobsView';
import { LogsView } from './LogsView';
import { MeetView } from './MeetView';
import { ModeToggle } from './ModeToggle';
import { ProfileView } from './ProfileView';
import { ProfileAvatar } from './social/common';
import { FeedView } from './social/FeedView';
import { NotificationBell } from './NotificationBell';
import { MessagesView } from './social/MessagesView';
import { NetworkView } from './social/NetworkView';
import { PersonView } from './social/PersonView';

export type Route =
  | { view: 'feed' }
  | { view: 'network' }
  | { view: 'messages'; user: string }
  | { view: 'person'; id: string }
  | { view: 'meet'; room: string }
  | { view: 'chat'; room: string }
  | { view: 'jobs'; job?: string }
  | { view: 'calls' }
  | { view: 'profile'; section?: 'basics' }
  | { view: 'career'; section?: 'expert' }
  | { view: 'admin' }
  | { view: 'recruiter' }
  | { view: 'logs' }
  | { view: 'not-found' };

export function parseRoute(path = location.pathname): Route {
  const seg = path.split('/').filter(Boolean).map(decodeURIComponent);
  if (seg[0] === 'r') return { view: 'meet', room: normalizeRoomId(seg[1] ?? '') ?? '' };
  if (seg[0] === 'meet') return { view: 'meet', room: '' };
  if (seg[0] === 'chat') return { view: 'chat', room: normalizeRoomId(seg[1] ?? '') ?? '' };
  if (seg[0] === 'jobs') return seg[1] ? { view: 'jobs', job: seg[1] } : { view: 'jobs' };
  if (seg[0] === 'calls') return { view: 'calls' };
  if (seg[0] === 'profile') return seg[1] === 'basics' ? { view: 'profile', section: 'basics' } : { view: 'profile' };
  if (seg[0] === 'career') return { view: 'career' };
  if (seg[0] === 'admin') return { view: 'admin' };
  if (seg[0] === 'recruiter') return { view: 'recruiter' };
  if (seg[0] === 'logs') return { view: 'logs' };
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
  if (r.view === 'jobs') return r.job ? `/jobs/${encodeURIComponent(r.job)}` : '/jobs';
  if (r.view === 'career') return r.section ? `/career/${r.section}` : '/career';
  if (r.view === 'profile') return r.section ? `/profile/${r.section}` : '/profile';
  if (r.view === 'not-found') return location.pathname;
  return `/${r.view}`;
}

function readRoute(): Route {
  const path = location.pathname.replace(/\/+$/, '') || '/';
  if (path === '/people') {
    history.replaceState(null, '', '/');
    return { view: 'feed' };
  }
  // Career keeps its sub-path (/career/expert…): the Resume page reads its section from it.
  if (/^\/(admin|recruiter)\//.test(path)) {
    const root = path.startsWith('/admin/') ? '/admin' : '/recruiter';
    history.replaceState(null, '', root);
    return root === '/admin' ? { view: 'admin' } : { view: 'recruiter' };
  }
  return parseRoute();
}

/** Tiny router: the URL is the source of truth, Back/Forward work. */
export function useRoute(): [Route, (r: Route, replace?: boolean) => void] {
  const [route, setRoute] = useState<Route>(readRoute);
  useEffect(() => {
    const onPop = () => setRoute(readRoute());
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

// People + Feed are merged into the Home feed. Network and Messages live in the
// top bar (with the request badge), so they aren't repeated in the rail.
const RAIL: { view: Route['view']; label: 'home' | 'jobs' | 'career' | 'meet'; icon: ReactNode; testId: string }[] = [
  { view: 'feed', label: 'home', icon: <SparkIcon />, testId: 'rail-feed' },
  { view: 'jobs', label: 'jobs', icon: <BriefcaseIcon />, testId: 'rail-jobs' },
  { view: 'career', label: 'career', icon: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M9 13h6M9 17h4" /></svg>
  ), testId: 'rail-career' },
  { view: 'meet', label: 'meet', icon: <VideoIcon />, testId: 'rail-meet' },
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
  const { api, photoUrl, logout } = useAuth();
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [pendingReqs, setPendingReqs] = useState(0);
  const [composeRoleSignal, setComposeRoleSignal] = useState(0);
  const [savedPostIds, setSavedPostIds] = useState<Set<string>>(() => new Set());
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!accountMenuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!accountMenuRef.current?.contains(event.target as Node)) setAccountMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setAccountMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [accountMenuOpen]);

  useEffect(() => {
    if (route.view === 'admin' && !isSuperAdmin(user.role)) {
      go(isStaff(user.role) ? { view: 'recruiter' } : { view: 'feed' }, true);
    } else if (route.view === 'recruiter') {
      if (isSuperAdmin(user.role)) go({ view: 'admin' }, true);
      else if (!isStaff(user.role)) go({ view: 'feed' }, true);
    }
  }, [route.view, user.role, go]);

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

  const startRolePost = () => {
    if (route.view !== 'feed') go({ view: 'feed' });
    setComposeRoleSignal((signal) => signal + 1);
  };

  const toggleSavedPost = useCallback((id: string) => {
    setSavedPostIds((saved) => {
      const next = new Set(saved);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

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
          {route.view === 'feed' && <span className="titlebar__home-tag">Home</span>}
        </a>
        <form className="titlebar__search" onSubmit={(e) => e.preventDefault()} role="search">
          <SearchIcon width={16} height={16} />
          <input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder={t('top.searchPlaceholder')}
            aria-label={t('top.searchPlaceholder')}
            spellCheck={false}
            data-testid="global-search"
          />
          {search && (
            <button type="button" className="titlebar__search-clear" onClick={() => setSearch('')} aria-label={t('top.clearSearch')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          )}
        </form>
        <div className="titlebar__end">
          {route.view === 'feed' && (
            <>
              <button className="titlebar__action titlebar__action--quiet" onClick={() => go({ view: 'career' })}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
                <span>{t('top.cvHelp')}</span>
              </button>
              <button className="titlebar__action titlebar__action--primary" onClick={startRolePost}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                <span>{t('top.postRole')}</span>
              </button>
            </>
          )}
          <NotificationBell onOpenPost={() => go({ view: 'feed' })} onJoinCall={onJoin} />
          <button className="titlebar__icon" onClick={() => go({ view: 'messages', user: '' })} aria-label={t('top.messages')} title={t('top.messages')} data-testid="top-messages">
            <ChatIcon width={20} height={20} />
          </button>
          <button className="titlebar__icon" onClick={() => go({ view: 'network' })} aria-label={pendingReqs > 0 ? t('top.requestsPending', { count: pendingReqs }) : t('top.requests')} title={t('top.requests')} data-testid="top-requests">
            <UserIcon width={20} height={20} />
            {pendingReqs > 0 && <span className="titlebar__badge">{pendingReqs > 9 ? '9+' : pendingReqs}</span>}
          </button>
          <ModeToggle />
          <div className="titlebar__account" ref={accountMenuRef}>
            <button className="titlebar__me" type="button" onClick={() => setAccountMenuOpen((open) => !open)} data-testid="open-profile" aria-label={t('top.accountMenu')} aria-haspopup="menu" aria-expanded={accountMenuOpen} title={user.name}>
              <ProfileAvatar profile={{ userId: user.id, name: user.name, photoUrl }} size={32} />
              <i className="presence" />
            </button>
            {accountMenuOpen && (
              <div className="titlebar__account-menu" role="menu" aria-label="Account options">
                <div className="titlebar__account-identity">
                  <strong>{user.name}</strong>
                  <span>{user.email}</span>
                </div>
                <button type="button" role="menuitem" onClick={() => { setAccountMenuOpen(false); go({ view: 'profile' }); }}>
                  <UserIcon width={17} height={17} />
                  {t('top.profileSettings')}
                </button>
                <button type="button" role="menuitem" onClick={() => logout()} data-testid="account-sign-out">
                  <SignOutIcon width={17} height={17} />
                  {t('top.signOut')}
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <nav className="rail" aria-label={t('nav.sections')}>
        {RAIL.map((item) => (
          <button
            key={item.view}
            className={`rail__item${route.view === item.view ? ' is-on' : ''}`}
            onClick={() => open(item.view)}
            aria-current={route.view === item.view ? 'page' : undefined}
            data-testid={item.testId}
          >
            {item.icon}
            <span>{t(`nav.${item.label}`)}</span>
          </button>
        ))}
        {isStaff(user.role) && (
          <button
            className={`rail__item${route.view === 'admin' || route.view === 'recruiter' ? ' is-on' : ''}`}
            onClick={() => isSuperAdmin(user.role) ? go({ view: 'admin' }) : go({ view: 'recruiter' })}
            aria-current={route.view === 'admin' || route.view === 'recruiter' ? 'page' : undefined}
            data-testid="rail-admin"
          >
            {isSuperAdmin(user.role) ? <ShieldIcon /> : <BriefcaseIcon />}
            <span>{isSuperAdmin(user.role) ? t('nav.admin') : t('nav.recruiter')}</span>
          </button>
        )}
        {isSuperAdmin(user.role) && (
          <button
            className={`rail__item${route.view === 'logs' ? ' is-on' : ''}`}
            onClick={() => go({ view: 'logs' })}
            aria-current={route.view === 'logs' ? 'page' : undefined}
            data-testid="rail-logs"
          >
            <LogsIcon />
            <span>{t('nav.logs')}</span>
          </button>
        )}
        <button
          className={`rail__item rail__item--me${route.view === 'profile' ? ' is-on' : ''}`}
          onClick={() => go({ view: 'profile' })}
          aria-current={route.view === 'profile' ? 'page' : undefined}
          data-testid="rail-profile"
        >
          <ProfileAvatar profile={{ userId: user.id, name: user.name, photoUrl }} size={26} />
          <span>{t('nav.profile')}</span>
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
        {route.view === 'profile' && <ProfileView key={route.section ?? 'account'} initialTab={route.section} onPreviewPublicProfile={() => go({ view: 'person', id: user.id })} onOpenCareerStudio={() => go({ view: 'career' })} />}
        {route.view === 'admin' && isSuperAdmin(user.role) && <AdminView />}
        {route.view === 'recruiter' && isStaff(user.role) && !isSuperAdmin(user.role) && <RecruiterDashboard />}
        {route.view === 'logs' && <LogsView />}
        {route.view === 'jobs' && (
          <JobsView
            jobId={route.job}
            onJobChange={(id) => go(id ? { view: 'jobs', job: id } : { view: 'jobs' })}
            openUser={(id) => go({ view: 'person', id })}
            openCvExperts={() => go({ view: 'career', section: 'expert' })}
            openProfile={() => go({ view: 'profile', section: 'basics' })}
          />
        )}
        {route.view === 'feed' && <FeedView openUser={(id) => go({ view: 'person', id })} openMeet={() => go({ view: 'meet', room: '' })} openJobs={() => go({ view: 'jobs' })} openCareer={() => go({ view: 'career' })} openProfile={() => go({ view: 'profile' })} openNetwork={() => go({ view: 'network' })} composeRoleSignal={composeRoleSignal} savedPostIds={savedPostIds} onToggleSavedPost={toggleSavedPost} query={search} onQueryChange={setSearch} />}
        {route.view === 'network' && <NetworkView openUser={(id) => go({ view: 'person', id })} openMessages={(id) => go({ view: 'messages', user: id })} />}
        {route.view === 'messages' && <MessagesView key={route.user} initialUser={route.user || undefined} />}
        {route.view === 'person' && (
          <PersonView
            key={route.id}
            userId={route.id}
            openMessages={(id) => go({ view: 'messages', user: id })}
            back={() => go({ view: 'feed' })}
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
