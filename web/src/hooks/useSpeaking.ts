import { useEffect, useState } from 'react';

let sharedCtx: AudioContext | null = null;
function audioContext(): AudioContext | null {
  const Ctx = window.AudioContext ?? (window as any).webkitAudioContext;
  if (!Ctx) return null;
  sharedCtx ??= new Ctx();
  if (sharedCtx.state === 'suspended') void sharedCtx.resume();
  return sharedCtx;
}

/** True while the stream's audio is above a speaking threshold. */
export function useSpeaking(stream: MediaStream | null, enabled = true): boolean {
  const [speaking, setSpeaking] = useState(false);
  const trackId = stream?.getAudioTracks()[0]?.id;

  useEffect(() => {
    if (!stream || !enabled || !trackId) {
      setSpeaking(false);
      return;
    }
    const ctx = audioContext();
    if (!ctx) return;

    const source = ctx.createMediaStreamSource(new MediaStream(stream.getAudioTracks()));
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.4;
    source.connect(analyser);
    const data = new Uint8Array(analyser.fftSize);

    let lastLoud = 0;
    const id = window.setInterval(() => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / data.length);
      const now = performance.now();
      if (rms > 0.04) lastLoud = now;
      // Hold "speaking" briefly so the ring doesn't flicker between words.
      setSpeaking(now - lastLoud < 350);
    }, 120);

    return () => {
      window.clearInterval(id);
      source.disconnect();
      analyser.disconnect();
    };
  }, [stream, trackId, enabled]);

  return speaking;
}
