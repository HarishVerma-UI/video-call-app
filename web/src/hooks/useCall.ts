import {
  CallClient,
  type CallError,
  type CallStatus,
  type ChatMessage,
  type Participant,
} from '@vca/shared';
import { useEffect, useRef, useState } from 'react';
import { ICE_SERVERS, SIGNALING_URL } from '../config';

/** React binding for the shared CallClient: one client per mounted call. */
export function useCall(roomId: string, name: string, localStream: MediaStream | null) {
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
    setMessages([]);
    client.join(roomId, name, localStream);
    setParticipants(client.getParticipants());

    // Expose for debugging and automated tests.
    (window as any).__call = client;

    return () => {
      offs.forEach((off) => off());
      client.leave();
      if (clientRef.current === client) clientRef.current = null;
    };
    // The stream is chosen in the lobby and stays the same for the whole call.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, name]);

  return { client: clientRef, participants, status, messages, error, clearError: () => setError(null) };
}
