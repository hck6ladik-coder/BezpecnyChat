/**
 * Decentralized Zero-Registration P2P Multi-Relay Network
 *
 * Connects browsers worldwide without requiring any account, cloud registration, or private servers.
 * Uses a resilient mesh of public open relays + local fallback + BroadcastChannel.
 */

export type PacketHandler = (packet: any) => void;

// Public open relays that allow free anonymous E2EE packet bridging (Zero-Registration)
const PUBLIC_OPEN_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.primal.net',
];

export class P2PMeshNetwork {
  private localWs: WebSocket | null = null;
  private openSockets: WebSocket[] = [];
  private broadcastChannel: BroadcastChannel | null = null;
  private onPacketCallback: PacketHandler | null = null;
  private myAddress: string = '';
  private myShortTag: string = '';
  private isDestroyed: boolean = false;
  private reconnectTimers: any[] = [];

  constructor(myAddress: string, myShortTag: string, onPacket: PacketHandler) {
    this.myAddress = myAddress.toLowerCase();
    this.myShortTag = myShortTag.replace('#', '').replace('-', '').toLowerCase();
    this.onPacketCallback = onPacket;

    this.initBroadcastChannel();
    this.initLocalRelay();
    this.initPublicRelays();
  }

  private initBroadcastChannel() {
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        this.broadcastChannel = new BroadcastChannel('keccak_p2p_mesh_v1');
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
          // Announce presence
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
          const timer = setTimeout(connect, 4000);
          this.reconnectTimers.push(timer);
        };

        ws.onerror = () => {
          try { ws.close(); } catch {}
        };
      } catch {}
    };

    connect();
  }

  private initPublicRelays() {
    PUBLIC_OPEN_RELAYS.forEach((relayUrl) => {
      this.connectOpenRelay(relayUrl);
    });
  }

  private connectOpenRelay(relayUrl: string) {
    if (this.isDestroyed) return;

    try {
      const ws = new WebSocket(relayUrl);

      ws.onopen = () => {
        this.openSockets.push(ws);

        // Subscribe via open nostr protocol filter for our address and short tag
        const subId = `sub_${Math.random().toString(36).slice(2, 9)}`;
        const filter = {
          kinds: [20000], // Ephemeral encrypted range
          '#t': [this.myAddress, this.myShortTag, 'keccak_discovery'],
          limit: 20,
        };
        const req = JSON.stringify(['REQ', subId, filter]);
        ws.send(req);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          // Nostr event format: ["EVENT", "sub_id", { content: "...", ... }]
          if (Array.isArray(msg) && msg[0] === 'EVENT' && msg[2]?.content) {
            const parsed = JSON.parse(msg[2].content);
            if (this.onPacketCallback) this.onPacketCallback(parsed);
          } else if (msg && msg.type && this.onPacketCallback) {
            this.onPacketCallback(msg);
          }
        } catch {}
      };

      ws.onclose = () => {
        this.openSockets = this.openSockets.filter((s) => s !== ws);
        const timer = setTimeout(() => this.connectOpenRelay(relayUrl), 8000);
        this.reconnectTimers.push(timer);
      };

      ws.onerror = () => {
        try { ws.close(); } catch {}
      };
    } catch {}
  }

  /**
   * Broadcast packet across all channels (Localhost, Public Decentralized Relays, BroadcastChannel)
   */
  public broadcast(packet: any) {
    const raw = JSON.stringify(packet);

    // 1. BroadcastChannel (same browser / tabs)
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage(packet);
      } catch {}
    }

    // 2. Localhost WebSocket (if running)
    if (this.localWs && this.localWs.readyState === WebSocket.OPEN) {
      try {
        this.localWs.send(raw);
      } catch {}
    }

    // 3. Open Public Relays (across the global internet without accounts)
    const targetTag = packet.targetHashedAddress
      ? packet.targetHashedAddress.replace('k256:0x', '').slice(0, 6).toLowerCase()
      : packet.recipientAddress
      ? packet.recipientAddress.replace('k256:0x', '').slice(0, 6).toLowerCase()
      : 'keccak_discovery';

    const targetAddr = packet.targetHashedAddress || packet.recipientAddress || 'keccak_discovery';

    const nostrEvent = [
      'EVENT',
      {
        kind: 20000,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ['t', targetAddr.toLowerCase()],
          ['t', targetTag.toLowerCase()],
          ['t', 'keccak_discovery'],
        ],
        content: raw,
      },
    ];

    const nostrRaw = JSON.stringify(nostrEvent);

    for (const ws of this.openSockets) {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(nostrRaw);
        } catch {}
      }
    }
  }

  public destroy() {
    this.isDestroyed = true;
    this.reconnectTimers.forEach(clearTimeout);
    if (this.broadcastChannel) {
      try { this.broadcastChannel.close(); } catch {}
    }
    if (this.localWs) {
      try { this.localWs.close(); } catch {}
    }
    this.openSockets.forEach((s) => {
      try { s.close(); } catch {}
    });
    this.openSockets = [];
  }
}
