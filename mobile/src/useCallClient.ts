import {
  CallClient,
  type CallError,
  type CallStatus,
  type ChatMessage,
  type Participant,
} from '@vca/shared';
import { useEffect, useRef, useState } from 'react';
import type { MediaStream as RNMediaStream } from 'react-native-webrtc';
import { useAuth } from './auth';
import { ICE_SERVERS, SIGNALING_URL } from './config';

/** Same engine as the web app; this hook just binds it to React state. */
export function useCallClient(roomId: string, auth: { token: string; name: string; userId?: string }, localStream: RNMediaStream | null) {
  const clientRef = useRef<CallClient | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [status, setStatus] = useState<CallStatus>('idle');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<CallError | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [historyCount, setHistoryCount] = useState(0);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const { api } = useAuth();

  useEffect(() => {
    const client = new CallClient({ signalingUrl: SIGNALING_URL, iceServers: ICE_SERVERS });
    clientRef.current = client;
    const offs = [
      client.on('participants', setParticipants),
      client.on('status', setStatus),
      client.on('chat', (m) => setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]))),
      client.on('history', ({ messages: history, hasMore: more }) => {
        setMessages(history);
        setHistoryCount(history.length);
        setHasMore(more);
      }),
      client.on('error', setError),
    ];
    client.join(roomId, auth, localStream as unknown as MediaStream);
    setParticipants(client.getParticipants());
    return () => {
      offs.forEach((off) => off());
      client.leave();
      if (clientRef.current === client) clientRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, auth.token]);

  const loadEarlier = async () => {
    if (loadingEarlier || !messages.length) return;
    setLoadingEarlier(true);
    try {
      const page = await api.roomMessages(roomId, { before: messages[0].ts, limit: 50 });
      setMessages((prev) => [...page.messages.filter((m) => !prev.some((p) => p.id === m.id)), ...prev]);
      setHistoryCount((n) => n + page.messages.length);
      setHasMore(page.hasMore);
    } catch {
      setError({ code: 'chat-failed', message: 'Couldn’t load earlier messages.' });
    } finally {
      setLoadingEarlier(false);
    }
  };

  return {
    client: clientRef,
    participants,
    status,
    messages,
    historyCount,
    hasMore,
    loadingEarlier,
    loadEarlier,
    error,
    clearError: () => setError(null),
  };
}
