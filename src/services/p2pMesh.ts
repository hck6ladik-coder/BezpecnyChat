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
  private pendingPackets: Map<string, any[]> = new Map();
  private broadcastChannel: BroadcastChannel | null = null;
  private localWs: WebSocket | null = null;
  private onPacketCallback: PacketHandler | null = null;
  private myAddress: string = '';
  private myShortTag: string = '';
  private isDestroyed: boolean = false;
  private pingInterval: any = null;

  constructor(myAddress: string, myShortTag: string, onPacket: PacketHandler) {
    this.myAddress = myAddress.toLowerCase();
    this.myShortTag = myShortTag.replace('#', '').replace('-', '').slice(0, 6).toLowerCase();
    this.onPacketCallback = onPacket;

    this.initBroadcastChannel();
    this.initLocalRelay();
    this.initPeerJS();

    // Keepalive ping for WebRTC connections
    this.pingInterval = setInterval(() => {
      this.connections.forEach((conn) => {
        if (conn.open) {
          try {
            conn.send({ type: 'p2p_ping', timestamp: Date.now() });
          } catch {}
        }
      });
    }, 5000);
  }

  private getPrimaryPeerId(): string {
    const tag = this.myAddress.replace('k256:0x', '').slice(0, 6).toLowerCase();
    return `k256_${tag}`;
  }

  private initBroadcastChannel() {
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        this.broadcastChannel = new BroadcastChannel('keccak_p2p_mesh_v3');
        this.broadcastChannel.onmessage = (e) => {
          if (this.onPacketCallback && e.data && e.data.type !== 'p2p_ping') {
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
            if (this.onPacketCallback && data.type !== 'p2p_ping') {
              this.onPacketCallback(data);
            }
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
            { urls: 'stun:stun3.l.google.com:19302' },
            { urls: 'stun:stun4.l.google.com:19302' },
          ],
        },
      });

      this.peer = p;

      p.on('open', (id) => {
        console.log('[P2P Mesh] Connected to global peer network with ID:', id);
        // Announce presence locally
        if (this.broadcastChannel) {
          try {
            this.broadcastChannel.postMessage({
              type: 'peer_presence',
              address: this.myAddress,
            });
          } catch {}
        }
      });

      p.on('connection', (conn) => {
        console.log('[P2P Mesh] Incoming connection from:', conn.peer);
        this.setupConnection(conn);
      });

      p.on('error', (err: any) => {
        console.warn('[P2P Mesh] Peer error:', err?.type || err);
      });

      p.on('disconnected', () => {
        if (!this.isDestroyed && !p.destroyed) {
          try {
            p.reconnect();
          } catch {}
        }
      });
    } catch (err) {
      console.warn('[P2P Mesh] PeerJS init error:', err);
    }
  }

  private setupConnection(conn: DataConnection) {
    conn.on('open', () => {
      console.log('[P2P Mesh] WebRTC DataChannel OPEN with:', conn.peer);
      this.connections.set(conn.peer, conn);

      // Send our presence immediately to establish identity
      try {
        conn.send({
          type: 'peer_presence',
          address: this.myAddress,
        });
      } catch {}

      // Flush any pending packets queued while connection was establishing
      const pending = this.pendingPackets.get(conn.peer);
      if (pending && pending.length > 0) {
        console.log(`[P2P Mesh] Flushing ${pending.length} pending packets to ${conn.peer}`);
        pending.forEach((pkt) => {
          try {
            conn.send(pkt);
          } catch (e) {
            console.error('[P2P Mesh] Error sending flushed packet:', e);
          }
        });
        this.pendingPackets.delete(conn.peer);
      }
    });

    conn.on('data', (data: any) => {
      try {
        const parsed = typeof data === 'string' ? JSON.parse(data) : data;
        if (parsed?.type === 'p2p_ping') return; // Ignore keepalives
        if (this.onPacketCallback && parsed) {
          this.onPacketCallback(parsed);
        }
      } catch {}
    });

    conn.on('close', () => {
      console.log('[P2P Mesh] WebRTC DataChannel closed with:', conn.peer);
      this.connections.delete(conn.peer);
    });

    conn.on('error', (err) => {
      console.warn('[P2P Mesh] DataChannel error on', conn.peer, err);
      this.connections.delete(conn.peer);
    });
  }

  private getTargetPeerId(targetAddressOrTag: string): string {
    const cleanTag = targetAddressOrTag
      .replace('k256:0x', '')
      .replace('#', '')
      .replace('-', '')
      .slice(0, 6)
      .toLowerCase();
    return `k256_${cleanTag}`;
  }

  public sendDirectToPeer(targetAddressOrTag: string, packet: any) {
    if (!this.peer || this.peer.destroyed) return;

    const targetPeerId = this.getTargetPeerId(targetAddressOrTag);
    if (targetPeerId === this.getPrimaryPeerId()) return; // Don't send to self

    const existing = this.connections.get(targetPeerId);

    if (existing && existing.open) {
      try {
        existing.send(packet);
        console.log('[P2P Mesh] Sent message directly to:', targetPeerId);
        return;
      } catch (err) {
        console.warn('[P2P Mesh] Send failed, re-queueing:', err);
      }
    }

    // If connection not open or does not exist, queue packet and initiate connection
    const queue = this.pendingPackets.get(targetPeerId) || [];
    queue.push(packet);
    this.pendingPackets.set(targetPeerId, queue);

    if (!existing) {
      try {
        console.log('[P2P Mesh] Connecting to peer:', targetPeerId);
        const conn = this.peer.connect(targetPeerId, { reliable: true });
        this.setupConnection(conn);
      } catch (err) {
        console.warn('[P2P Mesh] Connect error:', err);
      }
    }
  }

  /**
   * Broadcast packet across all local and P2P channels
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

    // 3. Direct WebRTC P2P target
    const target = packet.recipientAddress || packet.targetHashedAddress;
    if (target && target.toLowerCase() !== this.myAddress) {
      this.sendDirectToPeer(target, packet);
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
    if (this.pingInterval) clearInterval(this.pingInterval);
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
    this.pendingPackets.clear();
    if (this.peer && !this.peer.destroyed) {
      try { this.peer.destroy(); } catch {}
    }
    this.peer = null;
  }
}
