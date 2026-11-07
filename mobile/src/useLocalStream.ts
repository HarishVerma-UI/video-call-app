import { useCallback, useEffect, useRef, useState } from 'react';
import { mediaDevices, type MediaStream } from 'react-native-webrtc';

/**
 * Camera + mic for the phone. Asks for permission on first use (the OS prompt
 * text comes from app.json). Falls back to audio-only if the camera is refused.
 *
 * `enabled` gates the permission prompt: the camera/mic are only acquired while
 * it is true (the Meet screen or an active call), so signing in and browsing the
 * feed, network or messages never triggers a permission prompt.
 */
export function useLocalStream(enabled = true) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [audioOn, setAudioOn] = useState(true);
  const [videoOn, setVideoOn] = useState(true);
  const [facing, setFacing] = useState<'user' | 'environment'>('user');
  const [attempt, setAttempt] = useState(0);
  const ref = useRef<MediaStream | null>(null);

  useEffect(() => {
    // Not on a call/meet screen yet — release the camera and mic.
    if (!enabled) {
      ref.current?.getTracks().forEach((t) => t.stop());
      ref.current?.release?.();
      ref.current = null;
      setStream(null);
      setReady(false);
      setProblem(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setReady(false);
      let s: MediaStream | null = null;
      try {
        s = await mediaDevices.getUserMedia({
          audio: true,
          video: { facingMode: 'user', width: 1280, height: 720, frameRate: 30 },
        });
        setProblem(null);
      } catch {
        try {
          s = await mediaDevices.getUserMedia({ audio: true, video: false });
          setProblem('Camera permission was denied — you can still join with audio.');
        } catch {
          setProblem('Camera and microphone are blocked. Enable them in Settings to talk.');
        }
      }
      if (cancelled) {
        s?.getTracks().forEach((t) => t.stop());
        return;
      }
      ref.current = s;
      setStream(s);
      setFacing('user');
      setReady(true);
    })();
    return () => {
      cancelled = true;
      ref.current?.getTracks().forEach((t) => t.stop());
      ref.current?.release?.();
      ref.current = null;
    };
  }, [attempt, enabled]);

  useEffect(() => {
    stream?.getAudioTracks().forEach((t) => (t.enabled = audioOn));
  }, [stream, audioOn]);
  useEffect(() => {
    stream?.getVideoTracks().forEach((t) => (t.enabled = videoOn));
  }, [stream, videoOn]);

  /** Swap front/back camera on the same track — no renegotiation needed. */
  const flipCamera = useCallback(async () => {
    const track: any = stream?.getVideoTracks()[0];
    if (!track) return;
    const next = facing === 'user' ? 'environment' : 'user';
    try {
      if (typeof track.applyConstraints === 'function') await track.applyConstraints({ facingMode: next });
      else track._switchCamera?.();
      setFacing(next);
    } catch {
      track._switchCamera?.();
      setFacing(next);
    }
  }, [stream, facing]);

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
    facing,
    setAudioOn,
    setVideoOn,
    flipCamera,
    retry: () => setAttempt((n) => n + 1),
  };
}

export type LocalStream = ReturnType<typeof useLocalStream>;
