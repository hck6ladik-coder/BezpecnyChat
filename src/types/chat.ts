import { EncryptedFileMetadata } from '../crypto/aes';

export type SelfDestructDuration =
  | 'off'
  | '5s'
  | '1m'
  | '1h'
  | '1d'
  | '3d'
  | '7d'
  | '30d';

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderAddress: string;
  senderName?: string;
  recipientAddress?: string;
  groupId?: string;
  content: string; // Plaintext when in memory
  timestamp: number;
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  isSelf: boolean;
  type: 'text' | 'image' | 'audio' | 'video' | 'file' | 'system' | 'call';
  fileMetadata?: EncryptedFileMetadata & { dataUrl?: string; previewUrl?: string };
  keccakIntegrityTag: string;
  selfDestructTimer?: SelfDestructDuration;
  expiresAt?: number; // timestamp in ms
  isBurned?: boolean;
  sentiment?: {
    label: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
    score: number;
    emoji: string;
    czechLabel: string;
  };
  isCrisisFlagged?: boolean;
}

export interface ChatConversation {
  id: string;
  name: string;
  type: 'direct' | 'group';
  peerAddress?: string;
  peerIdentityKeyHex?: string;
  safetyNumberVerified: boolean;
  safetyNumber?: string;
  avatar: string;
  unreadCount: number;
  lastMessage?: ChatMessage;
  selfDestructSetting: SelfDestructDuration;
  groupMembers?: string[];
  isOnline?: boolean;
  isBlocked?: boolean;
  customNickname?: string;
}

export interface UserProfile {
  address: string;
  username: string;
  bio: string;
  avatar: string;
  identityKeyHex: string;
  signingKeyHex: string;
  has2FA: boolean;
  totpSecretHex?: string;
  backupCodeHashes?: string[];
  torRoutingEnabled: boolean;
  autoLockMinutes: number;
  createdAt: number;
}

export interface WebRTCCallSession {
  callId: string;
  peerAddress: string;
  peerName: string;
  peerAvatar: string;
  type: 'audio' | 'video';
  status: 'idle' | 'calling' | 'incoming' | 'connected' | 'ended';
  sasCode: string; // Short Authentication String for E2EE voice check
  isMuted: boolean;
  isVideoOff: boolean;
  isScreenSharing: boolean;
  durationSec: number;
}

export interface FriendContact {
  address: string;
  username: string;
  shortTag: string;
  avatar: string;
  addedAt: number;
  isOnline?: boolean;
  notes?: string;
}

export interface SecurityAuditEntry {
  id: string;
  timestamp: number;
  type: 'handshake' | 'ratchet_step' | 'integrity_check' | 'key_rotation' | 'blocked_leak' | 'security';
  title: string;
  description: string;
  details: Record<string, unknown>;
  severity: 'info' | 'success' | 'warning' | 'security';
}
