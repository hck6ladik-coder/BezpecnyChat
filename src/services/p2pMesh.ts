/**
 * Decentralized Zero-Registration P2P WebRTC Mesh Network
 *
 * Uses PeerJS (0.peerjs.com + Google STUN) for direct browser-to-browser P2P DataChannels
 * across the global internet with ZERO registration, ZERO accounts, and ZERO cloud config.
 * Supports fallback to BroadcastChannel (local tabs) and local WebSocket relay.
 */
import { Peer, DataConnection } from 'peerjs';

export type PacketHandler = (packet: any) => void;

export class P2PMeshNetwork {
  private peer: Peer | null = null;
  private connections: Map<string, DataConnection> = new Map();
  private broadcastChannel: BroadcastChannel | null = null;
  private localWs: WebSocket | null = null;
  private onPacketCallback: PacketHandler | null = null;
  private myAddress: string = '';
  private myShortTag: string = '';
  private isDestroyed: boolean = false;
  private reconnectTimer: any = null;

  constructor(myAddress: string, myShortTag: string, onPacket: PacketHandler) {
    this.myAddress = myAddress.toLowerCase();
    this.myShortTag = myShortTag.replace('#', '').replace('-', '').toLowerCase();
    this.onPacketCallback = onPacket;

    this.initBroadcastChannel();
    this.initLocalRelay();
    this.initPeerJS();
  }

  private cleanId(str: string): string {
    return str.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
  }

  private getPrimaryPeerId(): string {
    const cleanAddr = this.myAddress.replace('k256:0x', '').slice(0, 16);
    return `k256_${this.cleanId(cleanAddr)}`;
  }

  private initBroadcastChannel() {
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        this.broadcastChannel = new BroadcastChannel('keccak_p2p_mesh_v2');
        this.broadcastChannel.onmessage = (e) => {
          if (this.onPacketCallback && e.data) {
            this.onPacketCallback(e.data);
          }
        };
      } catch (err) {
        console.warn('BroadcastChannel error:', err);
      }
    }
  }

  private initLocalRelay() {
    const host = window.location.hostname || 'localhost';
    const localUrl = `ws://${host}:8080`;

    const connect = () => {
      if (this.isDestroyed) return;
      try {
        const ws = new WebSocket(localUrl);
        this.localWs = ws;

        ws.onopen = () => {
          this.broadcast({
            type: 'peer_presence',
            address: this.myAddress,
          });
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (this.onPacketCallback) this.onPacketCallback(data);
          } catch {}
        };

        ws.onclose = () => {
          this.localWs = null;
          if (!this.isDestroyed) {
            setTimeout(connect, 4000);
          }
        };

        ws.onerror = () => {
          try { ws.close(); } catch {}
        };
      } catch {}
    };

    connect();
  }

  private initPeerJS() {
    if (this.isDestroyed) return;

    try {
      const peerId = this.getPrimaryPeerId();
      const p = new Peer(peerId, {
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
          ],
        },
      });

      this.peer = p;

      p.on('open', (id) => {
        console.log('[P2P Mesh] Connected with Peer ID:', id);
        // Announce presence
        this.broadcast({
          type: 'peer_presence',
          address: this.myAddress,
        });
      });

      p.on('connection', (conn) => {
        this.setupConnection(conn);
      });

      p.on('error', (err: any) => {
        console.warn('[P2P Mesh] Peer error:', err?.type || err);
        // If ID taken or server error, retry gracefully
        if (err?.type === 'unavailable-id') {
          // ID already in use in another tab or instance
          return;
        }
      });

      p.on('disconnected', () => {
        if (!this.isDestroyed && !p.destroyed) {
          p.reconnect();
        }
      });
    } catch (err) {
      console.warn('[P2P Mesh] PeerJS init error:', err);
    }
  }

  private setupConnection(conn: DataConnection) {
    conn.on('open', () => {
      this.connections.set(conn.peer, conn);
      console.log('[P2P Mesh] Direct P2P DataChannel open with:', conn.peer);
    });

    conn.on('data', (data: any) => {
      try {
        const parsed = typeof data === 'string' ? JSON.parse(data) : data;
        if (this.onPacketCallback && parsed) {
          this.onPacketCallback(parsed);
        }
      } catch {}
    });

    conn.on('close', () => {
      this.connections.delete(conn.peer);
    });

    conn.on('error', () => {
      this.connections.delete(conn.peer);
    });
  }

  private connectToPeer(targetAddressOrTag: string): DataConnection | null {
    if (!this.peer || this.peer.destroyed) return null;

    const clean = targetAddressOrTag.replace('k256:0x', '').replace('#', '').replace('-', '').slice(0, 16);
    const targetPeerId = `k256_${this.cleanId(clean)}`;

    if (this.connections.has(targetPeerId)) {
      const existing = this.connections.get(targetPeerId);
      if (existing?.open) return existing;
    }

    try {
      const conn = this.peer.connect(targetPeerId, { reliable: true });
      this.setupConnection(conn);
      return conn;
    } catch {
      return null;
    }
  }

  /**
   * Broadcast or send packet directly to peer across all available transports
   */
  public broadcast(packet: any) {
    const raw = typeof packet === 'string' ? packet : JSON.stringify(packet);

    // 1. BroadcastChannel (same browser tabs)
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage(packet);
      } catch {}
    }

    // 2. Localhost WebSocket (if running locally)
    if (this.localWs && this.localWs.readyState === WebSocket.OPEN) {
      try {
        this.localWs.send(raw);
      } catch {}
    }

    // 3. Direct P2P WebRTC DataChannel (across any 2 computers on the internet)
    const target = packet.recipientAddress || packet.targetHashedAddress;
    if (target && target.toLowerCase() !== this.myAddress) {
      const conn = this.connectToPeer(target);
      if (conn && conn.open) {
        try {
          conn.send(packet);
        } catch {}
      }
    }

    // Also send to all established active direct connections
    this.connections.forEach((conn) => {
      if (conn.open) {
        try {
          conn.send(packet);
        } catch {}
      }
    });
  }

  public destroy() {
    this.isDestroyed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.broadcastChannel) {
      try { this.broadcastChannel.close(); } catch {}
    }
    if (this.localWs) {
      try { this.localWs.close(); } catch {}
    }
    this.connections.forEach((c) => {
      try { c.close(); } catch {}
    });
    this.connections.clear();
    if (this.peer && !this.peer.destroyed) {
      try { this.peer.destroy(); } catch {}
    }
    this.peer = null;
  }
}
