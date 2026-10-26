import {
  CallClient,
  type CallError,
  type CallStatus,
  type ChatMessage,
  type Participant,
} from '@vca/shared';
import { useEffect, useRef, useState } from 'react';
import type { MediaStream as RNMediaStream } from 'react-native-webrtc';
import { ICE_SERVERS, SIGNALING_URL } from './config';

/** Same engine as the web app; this hook just binds it to React state. */
export function useCallClient(roomId: string, auth: { token: string; name: string }, localStream: RNMediaStream | null) {
  const clientRef = useRef<CallClient | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [status, setStatus] = useState<CallStatus>('idle');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<CallError | null>(null);

  useEffect(() => {
    const client = new CallClient({ signalingUrl: SIGNALING_URL, iceServers: ICE_SERVERS });
    clientRef.current = client;
    const offs = [
      client.on('participants', setParticipants),
      client.on('status', setStatus),
      client.on('chat', (m) => setMessages((prev) => [...prev, m])),
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

  return { client: clientRef, participants, status, messages, error, clearError: () => setError(null) };
}
