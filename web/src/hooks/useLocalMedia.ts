import { useCallback, useEffect, useRef, useState } from 'react';

export type MediaProblem = 'denied' | 'no-device' | 'insecure' | 'other' | null;

export interface LocalMedia {
  stream: MediaStream | null;
  ready: boolean;
  problem: MediaProblem;
  hasAudio: boolean;
  hasVideo: boolean;
  audioOn: boolean;
  videoOn: boolean;
  setAudioOn: (on: boolean) => void;
  setVideoOn: (on: boolean) => void;
  retry: () => void;
}

const VIDEO: MediaTrackConstraints = { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' };
const AUDIO: MediaTrackConstraints = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };

function classify(err: unknown): MediaProblem {
  const name = (err as DOMException)?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'no-device';
  return 'other';
}

/**
 * Grab camera + mic, falling back to mic-only and then to nothing, so people
 * without a camera (or who deny it) can still join and listen.
 */
export function useLocalMedia(): LocalMedia {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [problem, setProblem] = useState<MediaProblem>(null);
  const [audioOn, setAudioOnState] = useState(true);
  const [videoOn, setVideoOnState] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setReady(false);
      if (!navigator.mediaDevices?.getUserMedia) {
        setProblem(window.isSecureContext ? 'other' : 'insecure');
        setReady(true);
        return;
      }
      let s: MediaStream | null = null;
      let firstErr: unknown = null;
      try {
        s = await navigator.mediaDevices.getUserMedia({ video: VIDEO, audio: AUDIO });
      } catch (e) {
        firstErr = e;
        try {
          s = await navigator.mediaDevices.getUserMedia({ audio: AUDIO });
        } catch {
          s = null;
        }
      }
      if (cancelled) {
        s?.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = s;
      setStream(s);
      setProblem(firstErr ? classify(firstErr) : null);
      setReady(true);
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [attempt]);

  // Keep track.enabled in sync with the toggles (also covers a fresh stream after retry).
  useEffect(() => {
    stream?.getAudioTracks().forEach((t) => (t.enabled = audioOn));
  }, [stream, audioOn]);
  useEffect(() => {
    stream?.getVideoTracks().forEach((t) => (t.enabled = videoOn));
  }, [stream, videoOn]);

  const hasAudio = !!stream?.getAudioTracks().length;
  const hasVideo = !!stream?.getVideoTracks().length;

  return {
    stream,
    ready,
    problem,
    hasAudio,
    hasVideo,
    audioOn: hasAudio && audioOn,
    videoOn: hasVideo && videoOn,
    setAudioOn: useCallback((on: boolean) => setAudioOnState(on), []),
    setVideoOn: useCallback((on: boolean) => setVideoOnState(on), []),
    retry: useCallback(() => setAttempt((n) => n + 1), []),
  };
}
