// CallClient — the call engine shared by the web (React) and mobile (React Native) apps.
//
// It owns two things:
//   1. The WebSocket connection to the signaling server.
//   2. One RTCPeerConnection per remote participant (a "mesh").
//
// The UI never touches WebRTC directly. It calls join()/leave()/setAudioEnabled()…
// and re-renders whenever the client emits 'participants', 'status' or 'chat'.
//
// It relies only on standard WebRTC globals (RTCPeerConnection, MediaStream,
// WebSocket). In React Native, call registerGlobals() from react-native-webrtc
// first, or pass the implementations in the options.

import type {
  ChatMessage,
  ClientMessage,
  ErrorCode,
  MediaState,
  PeerInfo,
  ServerMessage,
  SignalData,
} from './protocol';

export type CallStatus = 'idle' | 'connecting' | 'joined' | 'reconnecting' | 'left' | 'error';

export type PeerConnectionState =
  | 'new'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'failed'
  | 'closed';

export interface Participant {
  id: string;
  name: string;
  isLocal: boolean;
  stream: MediaStream | null;
  media: MediaState;
  connection: PeerConnectionState;
}

export interface CallError {
  code: ErrorCode | 'signaling' | 'media';
  message: string;
}

interface CallEvents {
  participants: Participant[];
  status: CallStatus;
  chat: ChatMessage;
  error: CallError;
}

type Listener<T> = (payload: T) => void;

export interface CallClientOptions {
  /** e.g. "ws://localhost:3001/ws" or "wss://calls.example.com/ws" */
  signalingUrl: string;
  iceServers?: RTCIceServer[];
  /** Injected for React Native or tests; defaults to the global. */
  WebSocketImpl?: typeof WebSocket;
  RTCPeerConnectionImpl?: typeof RTCPeerConnection;
  /** Signaling reconnect attempts before giving up. */
  maxReconnectAttempts?: number;
}

export const DEFAULT_ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

interface RemotePeer {
  info: PeerInfo;
  pc: RTCPeerConnection | null;
  stream: MediaStream | null;
  connection: PeerConnectionState;
  /** ICE candidates that arrived before the remote description. */
  pendingCandidates: RTCIceCandidateInit[];
  /** True if we sent the offer (we're the newer participant). */
  initiator: boolean;
}

export class CallClient {
  private opts: Required<Omit<CallClientOptions, 'WebSocketImpl' | 'RTCPeerConnectionImpl'>>;
  private WS: typeof WebSocket;
  private PC: typeof RTCPeerConnection;

  private ws: WebSocket | null = null;
  private listeners: { [K in keyof CallEvents]?: Set<Listener<CallEvents[K]>> } = {};

  private _status: CallStatus = 'idle';
  private selfId = '';
  private roomId = '';
  private name = '';
  private localStream: MediaStream | null = null;
  private localMedia: MediaState = { audio: true, video: true, screen: false };
  private outgoingVideoTrack: MediaStreamTrack | null = null;
  private peers = new Map<string, RemotePeer>();
  private _chat: ChatMessage[] = [];
  private _maxPeers = 0;

  private intentionalClose = false;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: CallClientOptions) {
    this.opts = {
      signalingUrl: options.signalingUrl,
      iceServers: options.iceServers ?? DEFAULT_ICE_SERVERS,
      maxReconnectAttempts: options.maxReconnectAttempts ?? 5,
    };
    this.WS = options.WebSocketImpl ?? (globalThis as any).WebSocket;
    this.PC = options.RTCPeerConnectionImpl ?? (globalThis as any).RTCPeerConnection;
    if (!this.WS) throw new Error('No WebSocket implementation available');
    if (!this.PC) throw new Error('No RTCPeerConnection implementation available');
  }

  // ---- public API ----------------------------------------------------------

  get status(): CallStatus {
    return this._status;
  }
  get chat(): ChatMessage[] {
    return this._chat;
  }
  get maxPeers(): number {
    return this._maxPeers;
  }
  get media(): MediaState {
    return { ...this.localMedia };
  }

  on<K extends keyof CallEvents>(event: K, fn: Listener<CallEvents[K]>): () => void {
    const set = (this.listeners[event] ??= new Set() as any) as Set<Listener<CallEvents[K]>>;
    set.add(fn);
    return () => set.delete(fn);
  }

  /** Join a room with an already-acquired local stream (may be null for receive-only). */
  join(roomId: string, name: string, localStream: MediaStream | null): void {
    if (this._status === 'connecting' || this._status === 'joined') return;
    this.roomId = roomId;
    this.name = name;
    this.localStream = localStream;
    this.outgoingVideoTrack = localStream?.getVideoTracks()[0] ?? null;
    this.localMedia = {
      audio: !!localStream?.getAudioTracks().some((t) => t.enabled),
      video: !!localStream?.getVideoTracks().some((t) => t.enabled),
      screen: false,
    };
    this.intentionalClose = false;
    this.reconnectAttempts = 0;
    this._chat = [];
    this.connect();
  }

  leave(): void {
    this.intentionalClose = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.send({ type: 'leave' });
    this.ws?.close();
    this.ws = null;
    this.closeAllPeers();
    this.setStatus('left');
    this.emitParticipants();
  }

  setAudioEnabled(enabled: boolean): void {
    this.localStream?.getAudioTracks().forEach((t) => (t.enabled = enabled));
    this.updateMedia({ audio: enabled });
  }

  setVideoEnabled(enabled: boolean): void {
    this.localStream?.getVideoTracks().forEach((t) => (t.enabled = enabled));
    if (this.outgoingVideoTrack && !this.localMedia.screen) this.outgoingVideoTrack.enabled = enabled;
    this.updateMedia({ video: enabled });
  }

  /**
   * Swap the video we send to everyone without renegotiating — used for screen
   * share and for flipping the phone camera. Pass null to send nothing.
   */
  async replaceVideoTrack(track: MediaStreamTrack | null, opts: { screen?: boolean } = {}): Promise<void> {
    this.outgoingVideoTrack = track;
    await Promise.all(
      [...this.peers.values()].map(async (p) => {
        const sender = p.pc ? findVideoSender(p.pc) : undefined;
        if (sender) await sender.replaceTrack(track);
      }),
    );
    if (opts.screen !== undefined) this.updateMedia({ screen: opts.screen });
  }

  sendChat(text: string): void {
    const trimmed = text.trim();
    if (!trimmed) return;
    this.send({ type: 'chat', text: trimmed.slice(0, 1000) });
  }

  getParticipants(): Participant[] {
    const local: Participant = {
      id: this.selfId || 'local',
      name: this.name,
      isLocal: true,
      stream: this.localStream,
      media: { ...this.localMedia },
      connection: this._status === 'joined' ? 'connected' : 'new',
    };
    const remotes = [...this.peers.values()].map<Participant>((p) => ({
      id: p.info.id,
      name: p.info.name,
      isLocal: false,
      stream: p.stream,
      media: { ...p.info.media },
      connection: p.connection,
    }));
    return [local, ...remotes];
  }

  // ---- signaling -----------------------------------------------------------

  private connect(): void {
    this.setStatus(this.reconnectAttempts > 0 ? 'reconnecting' : 'connecting');
    const ws = new this.WS(this.opts.signalingUrl);
    this.ws = ws;

    ws.onopen = () => {
      this.send({ type: 'join', roomId: this.roomId, name: this.name, media: this.localMedia });
    };
    ws.onmessage = (ev: MessageEvent) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data));
      } catch {
        return;
      }
      void this.handleServerMessage(msg);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return; // an old socket
      this.ws = null;
      if (this.intentionalClose) return;
      this.closeAllPeers();
      this.emitParticipants();
      this.scheduleReconnect();
    };
    ws.onerror = () => {
      /* onclose follows and handles it */
    };
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.opts.maxReconnectAttempts) {
      this.setStatus('error');
      this.emit('error', { code: 'signaling', message: 'Lost connection to the server.' });
      return;
    }
    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 8000);
    this.reconnectAttempts++;
    this.setStatus('reconnecting');
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private send(msg: ClientMessage): void {
    if (this.ws && this.ws.readyState === 1 /* OPEN */) this.ws.send(JSON.stringify(msg));
  }

  private async handleServerMessage(msg: ServerMessage): Promise<void> {
    switch (msg.type) {
      case 'welcome': {
        this.selfId = msg.selfId;
        this._maxPeers = msg.maxPeers;
        this.reconnectAttempts = 0;
        this.setStatus('joined');
        // We're the newcomer: we call everyone who is already in the room.
        for (const info of msg.peers) {
          const peer = this.addPeer(info, true);
          await this.makeOffer(peer);
        }
        this.emitParticipants();
        return;
      }
      case 'peer-joined': {
        // They will call us; get ready to answer.
        this.addPeer(msg.peer, false);
        this.emitParticipants();
        return;
      }
      case 'peer-left': {
        this.removePeer(msg.id);
        this.emitParticipants();
        return;
      }
      case 'signal': {
        await this.handleSignal(msg.from, msg.data);
        return;
      }
      case 'media-state': {
        const p = this.peers.get(msg.id);
        if (p) {
          p.info.media = msg.media;
          this.emitParticipants();
        }
        return;
      }
      case 'chat': {
        this._chat = [...this._chat, msg.message];
        this.emit('chat', msg.message);
        return;
      }
      case 'error': {
        this.emit('error', { code: msg.code, message: msg.message });
        if (msg.code === 'room-full') {
          this.intentionalClose = true;
          this.ws?.close();
          this.setStatus('error');
        }
        return;
      }
    }
  }

  // ---- peers ---------------------------------------------------------------

  private addPeer(info: PeerInfo, initiator: boolean): RemotePeer {
    const existing = this.peers.get(info.id);
    if (existing) return existing;
    const peer: RemotePeer = {
      info,
      pc: null,
      stream: null,
      connection: 'new',
      pendingCandidates: [],
      initiator,
    };
    this.peers.set(info.id, peer);
    peer.pc = this.createPeerConnection(peer);
    return peer;
  }

  private createPeerConnection(peer: RemotePeer): RTCPeerConnection {
    const pc = new this.PC({ iceServers: this.opts.iceServers });
    const stream = this.localStream;

    // Always negotiate one audio + one video slot so tracks can be swapped later
    // (screen share, camera flip, or turning the camera on after joining).
    const audio = stream?.getAudioTracks()[0];
    if (audio && stream) pc.addTrack(audio, stream);
    else pc.addTransceiver('audio', { direction: 'sendrecv' });

    const video = this.outgoingVideoTrack;
    if (video && stream && stream.getVideoTracks().includes(video)) pc.addTrack(video, stream);
    else {
      const t = pc.addTransceiver('video', { direction: 'sendrecv' });
      if (video) void t.sender.replaceTrack(video);
    }

    pc.addEventListener('icecandidate', (e: RTCPeerConnectionIceEvent) => {
      if (e.candidate) {
        const c = e.candidate.toJSON ? e.candidate.toJSON() : (e.candidate as RTCIceCandidateInit);
        this.send({ type: 'signal', to: peer.info.id, data: { candidate: c as any } });
      }
    });

    pc.addEventListener('track', (e: RTCTrackEvent) => {
      const incoming = e.streams && e.streams[0];
      if (incoming) {
        peer.stream = incoming;
      } else {
        // No stream attached (e.g. sender had no camera when joining): build one.
        const MS = (globalThis as any).MediaStream;
        const tracks = [...(peer.stream?.getTracks() ?? []), e.track];
        peer.stream = MS ? new MS(tracks) : peer.stream;
      }
      this.emitParticipants();
    });

    pc.addEventListener('connectionstatechange', () => {
      peer.connection = pc.connectionState as PeerConnectionState;
      this.emitParticipants();
      // The side that made the original offer is responsible for ICE restarts,
      // so both sides never offer at once.
      if (pc.connectionState === 'failed' && peer.initiator) void this.makeOffer(peer, true);
    });

    return pc;
  }

  private async makeOffer(peer: RemotePeer, iceRestart = false): Promise<void> {
    const pc = peer.pc;
    if (!pc) return;
    try {
      const offer = await pc.createOffer(iceRestart ? { iceRestart: true } : undefined);
      await pc.setLocalDescription(offer);
      this.send({
        type: 'signal',
        to: peer.info.id,
        data: { sdp: { type: 'offer', sdp: pc.localDescription?.sdp } },
      });
    } catch (err) {
      this.emit('error', { code: 'media', message: `Could not call ${peer.info.name}: ${String(err)}` });
    }
  }

  private async handleSignal(from: string, data: SignalData): Promise<void> {
    let peer = this.peers.get(from);
    if (!peer) {
      // Signal raced ahead of peer-joined; create a placeholder.
      peer = this.addPeer({ id: from, name: 'Guest', media: { audio: true, video: true, screen: false } }, false);
    }
    const pc = peer.pc;
    if (!pc) return;

    try {
      if ('sdp' in data) {
        await pc.setRemoteDescription(data.sdp as RTCSessionDescriptionInit);
        for (const c of peer.pendingCandidates.splice(0)) await pc.addIceCandidate(c).catch(() => {});
        if (data.sdp.type === 'offer') {
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          this.send({
            type: 'signal',
            to: from,
            data: { sdp: { type: 'answer', sdp: pc.localDescription?.sdp } },
          });
        }
      } else if ('candidate' in data) {
        if (pc.remoteDescription) await pc.addIceCandidate(data.candidate as RTCIceCandidateInit);
        else peer.pendingCandidates.push(data.candidate as RTCIceCandidateInit);
      }
    } catch (err) {
      this.emit('error', { code: 'media', message: `Connection problem with ${peer.info.name}: ${String(err)}` });
    }
  }

  private removePeer(id: string): void {
    const p = this.peers.get(id);
    if (!p) return;
    p.pc?.close();
    this.peers.delete(id);
  }

  private closeAllPeers(): void {
    for (const id of [...this.peers.keys()]) this.removePeer(id);
  }

  // ---- helpers -------------------------------------------------------------

  private updateMedia(patch: Partial<MediaState>): void {
    this.localMedia = { ...this.localMedia, ...patch };
    this.send({ type: 'media-state', media: this.localMedia });
    this.emitParticipants();
  }

  private setStatus(s: CallStatus): void {
    if (this._status === s) return;
    this._status = s;
    this.emit('status', s);
  }

  private emitParticipants(): void {
    this.emit('participants', this.getParticipants());
  }

  private emit<K extends keyof CallEvents>(event: K, payload: CallEvents[K]): void {
    this.listeners[event]?.forEach((fn) => {
      try {
        (fn as Listener<CallEvents[K]>)(payload);
      } catch (err) {
        console.error(err);
      }
    });
  }
}

/**
 * Find the sender for our outgoing video. Its track may be null (camera off or
 * not yet available), so match on the transceiver's receiving side, which
 * always has a track of the transceiver's kind.
 */
function findVideoSender(pc: RTCPeerConnection): RTCRtpSender | undefined {
  const byTrack = pc.getSenders().find((s) => s.track?.kind === 'video');
  if (byTrack) return byTrack;
  if (typeof pc.getTransceivers !== 'function') return undefined;
  return pc.getTransceivers().find((t) => t.receiver?.track?.kind === 'video')?.sender;
}
