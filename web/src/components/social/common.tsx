import type { ApiClient, ConnectionState, Profile } from '@vca/shared';
import { useState } from 'react';
import { Avatar } from '../RoomBadge';

/** A photo if the profile has one, otherwise initials. */
export function ProfileAvatar({ profile, size = 48 }: { profile: { userId: string; name: string; photoUrl?: string | null }; size?: number }) {
  if (profile.photoUrl)
    return <img className="pf-avatar" src={profile.photoUrl} alt="" style={{ width: size, height: size }} />;
  return <Avatar id={profile.userId} name={profile.name || '?'} size={size} />;
}

/** Connect / Accept / Requested / Connected button, driven by the profile's connection state. */
export function ConnectButton({ profile, api, onChange }: { profile: Profile; api: ApiClient; onChange: (s: ConnectionState) => void }) {
  const [busy, setBusy] = useState(false);
  const act = async (fn: () => Promise<{ status: ConnectionState }>) => {
    setBusy(true);
    try {
      onChange((await fn()).status);
    } catch {
      /* surfaced by caller refresh */
    } finally {
      setBusy(false);
    }
  };
  if (profile.connection === 'self') return null;
  if (profile.connection === 'connected') return <span className="pill pill--ok">Connected</span>;
  if (profile.connection === 'pending_outgoing')
    return (
      <button className="btn btn--secondary btn--small" disabled>
        Requested
      </button>
    );
  if (profile.connection === 'pending_incoming')
    return (
      <button className="btn btn--primary btn--small" disabled={busy} onClick={() => void act(() => api.acceptConnect(profile.userId))}>
        Accept
      </button>
    );
  return (
    <button className="btn btn--primary btn--small" disabled={busy} onClick={() => void act(() => api.requestConnect(profile.userId))}>
      Connect
    </button>
  );
}

export function roleBadges(p: { mentor: boolean; mentee: boolean }) {
  const out: string[] = [];
  if (p.mentor) out.push('Mentor');
  if (p.mentee) out.push('Looking for mentorship');
  return out;
}
