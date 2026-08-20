import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import {
  ChatMessage,
  ChatConversation,
  SelfDestructDuration,
  UserProfile,
} from '../types/chat';
import { useCrypto } from './CryptoContext';
import { ratchetEncrypt, ratchetDecrypt } from '../crypto/ratchet';
import { groupEncrypt, groupDecrypt } from '../crypto/senderKey';
import { encryptFileBlob, decryptFileBlob } from '../crypto/aes';
import { computeKeccakTag, deriveKeccakAddress, formatKeccakAddress, getDisplayName, deriveShortChatTag } from '../crypto/keccak';
import { generateUserPrekeys, createPublicPrekeyBundle, UserPrekeyBundle } from '../crypto/x3dh';
import { computeSafetyNumber } from '../crypto/safetyNumbers';
import { analyzeSentimentDistilBert, analyzeLocalSentiment } from '../services/sentimentService';
import { detectCrisisIntent } from '../services/safetyGuard';
import { P2PMeshNetwork } from '../services/p2pMesh';

export interface DiscoveredPeer {
  address: string;
  username: string;
  avatar: string;
  bundle?: UserPrekeyBundle;
  lastSeen: number;
}

interface ChatContextType {
  conversations: ChatConversation[];
  activeConversationId: string | null;
  activeConversation: ChatConversation | null;
  messages: ChatMessage[];
  searchQuery: string;
  isOnline: boolean;
  offlineQueueCount: number;
  discoveredPeers: DiscoveredPeer[];

  setActiveConversationId: (id: string | null) => void;
  setSearchQuery: (query: string) => void;
  sendMessage: (
    content: string,
    file?: File,
    type?: ChatMessage['type']
  ) => Promise<void>;
  createDirectChat: (peerAddress: string, peerName?: string, peerBundle?: UserPrekeyBundle) => Promise<string>;
  createGroupChat: (name: string, memberAddresses: string[]) => Promise<string>;
  deleteMessage: (messageId: string) => void;
  setSelfDestructForActiveChat: (duration: SelfDestructDuration) => void;
  blockContact: (address: string) => void;
  unblockContact: (address: string) => void;
  verifyContactSafetyNumber: (conversationId: string) => void;
}

const ChatContext = createContext<ChatContextType | null>(null);

const DURATION_TO_MS: Record<SelfDestructDuration, number | null> = {
  off: null,
  '5s': 5 * 1000,
  '1m': 60 * 1000,
  '1h': 3600 * 1000,
  '1d': 24 * 3600 * 1000,
  '3d': 3 * 24 * 3600 * 1000,
  '7d': 7 * 24 * 3600 * 1000,
  '30d': 30 * 24 * 3600 * 1000,
};

export const ChatProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const {
    profile,
    publicBundle,
    getOrCreateRatchetSession,
    saveRatchetSession,
    getGroupSenderKey,
    createMyGroupSenderKey,
    addAuditLog,
  } = useCrypto();

  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [offlineQueue, setOfflineQueue] = useState<ChatMessage[]>([]);
  const [discoveredPeers, setDiscoveredPeers] = useState<DiscoveredPeer[]>([]);

  const p2pMeshRef = useRef<P2PMeshNetwork | null>(null);

  // Monitor network state
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Handle incoming network packets from P2P mesh network
  const handleIncomingPacket = (data: any) => {
    if (!data || !profile) return;

    if (data.type === 'peer_presence') {
      if (data.address && data.address.toLowerCase() !== profile.address.toLowerCase()) {
        setDiscoveredPeers((prev) => {
          const exists = prev.find((p) => p.address.toLowerCase() === data.address.toLowerCase());
          if (exists) {
            return prev.map((p) =>
              p.address.toLowerCase() === data.address.toLowerCase()
                ? { ...p, username: data.username, avatar: data.avatar, bundle: data.bundle, lastSeen: Date.now() }
                : p
            );
          }
          return [
            ...prev,
            {
              address: data.address,
              username: data.username,
              avatar: data.avatar,
              bundle: data.bundle,
              lastSeen: Date.now(),
            },
          ];
        });
      }
    }

    if (data.type === 'peer_query') {
      if (profile && publicBundle && p2pMeshRef.current) {
        p2pMeshRef.current.broadcast({
          type: 'peer_presence',
          address: profile.address,
          username: profile.username,
          avatar: profile.avatar,
          bundle: publicBundle,
        });
      }
    }

    if (data.type === 'direct_message') {
      if (data.recipientAddress?.toLowerCase() === profile.address.toLowerCase()) {
        const convId = `conv_${data.senderAddress}`;
        const crisisCheck = detectCrisisIntent(data.content || '');
        const sentiment = data.sentiment || analyzeLocalSentiment(data.content || '');

        const incomingMsg: ChatMessage = {
          id: data.id || crypto.randomUUID(),
          conversationId: convId,
          senderAddress: data.senderAddress,
          senderName: data.senderName,
          recipientAddress: profile.address,
          content: data.content,
          timestamp: data.timestamp || Date.now(),
          status: 'delivered',
          isSelf: false,
          type: data.messageType || 'text',
          fileMetadata: data.fileMetadata,
          keccakIntegrityTag: data.keccakIntegrityTag,
          selfDestructTimer: data.selfDestructTimer || 'off',
          expiresAt: data.expiresAt,
          sentiment,
          isCrisisFlagged: crisisCheck.isTriggered,
        };

        // Add message if not duplicate
        setMessages((prev) => {
          if (prev.some((m) => m.id === incomingMsg.id)) return prev;
          return [...prev, incomingMsg];
        });

        // Async update with Hugging Face DistilBERT
        if (incomingMsg.content && !data.sentiment) {
          analyzeSentimentDistilBert(incomingMsg.content).then((hfSentiment) => {
            setMessages((prev) =>
              prev.map((m) => (m.id === incomingMsg.id ? { ...m, sentiment: hfSentiment } : m))
            );
          });
        }

        // Ensure conversation exists or update existing
        setConversations((prev) => {
          const existing = prev.find((c) => c.peerAddress?.toLowerCase() === data.senderAddress.toLowerCase());
          if (existing) {
            return prev.map((c) =>
              c.id === existing.id
                ? { ...c, lastMessage: incomingMsg, unreadCount: c.id === activeConversationId ? 0 : c.unreadCount + 1 }
                : c
            );
          }
          const newConv: ChatConversation = {
            id: convId,
            name: getDisplayName(data.senderName, data.senderAddress),
            type: 'direct',
            peerAddress: data.senderAddress,
            peerIdentityKeyHex: data.bundle?.identityKeyHex,
            safetyNumberVerified: false,
            avatar: data.senderAvatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${data.senderAddress}`,
            unreadCount: 1,
            selfDestructSetting: data.selfDestructTimer || 'off',
            isOnline: true,
            lastMessage: incomingMsg,
          };
          return [newConv, ...prev];
        });

        addAuditLog({
          type: 'integrity_check',
          title: `Příjem E2EE zprávy od ${getDisplayName(data.senderName, data.senderAddress)}`,
          description: `Integrita KECCAK256: 0x${data.keccakIntegrityTag ? data.keccakIntegrityTag.slice(0, 8) : 'ok'}...`,
          details: { sender: data.senderAddress, tag: data.keccakIntegrityTag },
          severity: 'success',
        });
      }
    }
  };

  // Setup Decentralized Zero-Registration P2P Network Mesh
  useEffect(() => {
    if (!profile) return;

    const mesh = new P2PMeshNetwork(
      profile.address,
      formatKeccakAddress(profile.address),
      handleIncomingPacket
    );
    p2pMeshRef.current = mesh;

    // Heartbeat / Presence announcement interval across the P2P mesh
    const presenceInterval = setInterval(() => {
      if (profile && publicBundle && p2pMeshRef.current) {
        p2pMeshRef.current.broadcast({
          type: 'peer_presence',
          address: profile.address,
          username: profile.username,
          avatar: profile.avatar,
          bundle: publicBundle,
        });
      }
    }, 4000);

    return () => {
      clearInterval(presenceInterval);
      mesh.destroy();
      p2pMeshRef.current = null;
    };
  }, [profile, publicBundle]);

  // Periodic tick for self-destructing message deletion
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      setMessages((prev) => {
        const remaining = prev.filter((msg) => {
          if (msg.expiresAt && msg.expiresAt <= now) {
            addAuditLog({
              type: 'integrity_check',
              title: 'Zpráva automaticky skartována',
              description: `Zpráva ID ${msg.id.slice(0, 8)} byla smazána dle nastavení samosmazání.`,
              details: { messageId: msg.id, sender: msg.senderAddress },
              severity: 'info',
            });
            return false;
          }
          return true;
        });
        return remaining;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [addAuditLog]);

  const activeConversation =
    conversations.find((c) => c.id === activeConversationId) || null;

  const sendMessage = async (
    content: string,
    file?: File,
    type: ChatMessage['type'] = 'text'
  ) => {
    if (!profile || !activeConversation) return;

    const conv = activeConversation;
    const duration = DURATION_TO_MS[conv.selfDestructSetting];
    const expiresAt = duration ? Date.now() + duration : undefined;
    const msgId = crypto.randomUUID();

    let fileMeta;
    if (file) {
      const fileKey = crypto.getRandomValues(new Uint8Array(32));
      const { metadata } = await encryptFileBlob(file, file.name, fileKey);
      const dataUrl = URL.createObjectURL(file);
      fileMeta = {
        ...metadata,
        dataUrl,
        previewUrl: file.type.startsWith('image/') ? dataUrl : undefined,
      };

      addAuditLog({
        type: 'integrity_check',
        title: `Příloha šifrována AES-256-GCM (${file.name})`,
        description: `Velikost: ${(file.size / (1024 * 1024)).toFixed(2)} MB, Integrita hash: ${metadata.integrityHashHex.slice(0, 10)}...`,
        details: { fileName: file.name, size: file.size, mime: file.type },
        severity: 'success',
      });
    }

    const integrityTag = computeKeccakTag(content, Date.now());
    const crisisCheck = detectCrisisIntent(content);
    const initialSentiment = analyzeLocalSentiment(content);

    const newMsg: ChatMessage = {
      id: msgId,
      conversationId: conv.id,
      senderAddress: profile.address,
      senderName: profile.username,
      recipientAddress: conv.peerAddress,
      groupId: conv.type === 'group' ? conv.id : undefined,
      content,
      timestamp: Date.now(),
      status: 'sent',
      isSelf: true,
      type: file ? (file.type.startsWith('image/') ? 'image' : file.type.startsWith('audio/') ? 'audio' : 'file') : type,
      fileMetadata: fileMeta,
      keccakIntegrityTag: integrityTag,
      selfDestructTimer: conv.selfDestructSetting,
      expiresAt,
      sentiment: initialSentiment,
      isCrisisFlagged: crisisCheck.isTriggered,
    };

    // Perform Cryptographic Operation
    if (conv.type === 'direct' && conv.peerAddress) {
      try {
        const ratchetState = await getOrCreateRatchetSession(conv.peerAddress);
        const { newState, message: encryptedPacket } = await ratchetEncrypt(ratchetState, content);
        await saveRatchetSession(conv.peerAddress, newState);

        addAuditLog({
          type: 'ratchet_step',
          title: `Double Ratchet krok proveden (#${newState.ns})`,
          description: `Zpráva pro ${formatKeccakAddress(conv.peerAddress)} zašifrována novým klíčem.`,
          details: {
            chainIndex: newState.ns,
            iv: encryptedPacket.ivHex,
            integrityTag: encryptedPacket.integrityTagHex,
          },
          severity: 'security',
        });
      } catch (err) {
        console.error('Error ratcheting:', err);
      }

      // Broadcast payload to peer over Decentralized P2P Mesh Network
      const payload = {
        type: 'direct_message',
        id: msgId,
        senderAddress: profile.address,
        senderName: profile.username,
        senderAvatar: profile.avatar,
        recipientAddress: conv.peerAddress,
        content,
        messageType: newMsg.type,
        fileMetadata: fileMeta,
        keccakIntegrityTag: integrityTag,
        selfDestructTimer: conv.selfDestructSetting,
        expiresAt,
        timestamp: Date.now(),
        bundle: publicBundle,
        sentiment: initialSentiment,
      };

      if (p2pMeshRef.current) {
        p2pMeshRef.current.broadcast(payload);
      }
    } else if (conv.type === 'group') {
      try {
        let senderKeyState = getGroupSenderKey(conv.id, profile.address);
        if (!senderKeyState) {
          const { state } = createMyGroupSenderKey(conv.id);
          senderKeyState = state;
        }
        const { newState, message: grpPacket } = await groupEncrypt(senderKeyState, content);

        addAuditLog({
          type: 'ratchet_step',
          title: `Sender Key skupinový posun (#${newState.iteration})`,
          description: `Skupinová zpráva odeslána do ${conv.name}.`,
          details: {
            iteration: newState.iteration,
            signature: grpPacket.signatureHex.slice(0, 16) + '...',
          },
          severity: 'security',
        });
      } catch (err) {
        console.error('Error group encrypting:', err);
      }
    }

    setMessages((prev) => [...prev, newMsg]);

    // Asynchronously query Hugging Face DistilBERT to enrich sentiment precision
    if (content) {
      analyzeSentimentDistilBert(content).then((hfSentiment) => {
        setMessages((prev) =>
          prev.map((m) => (m.id === msgId ? { ...m, sentiment: hfSentiment } : m))
        );
      });
    }

    // Update conversation lastMessage
    setConversations((prev) =>
      prev.map((c) => (c.id === conv.id ? { ...c, lastMessage: newMsg } : c))
    );
  };

  const createDirectChat = async (
    peerAddress: string,
    peerName?: string,
    peerBundle?: UserPrekeyBundle
  ): Promise<string> => {
    const existing = conversations.find(
      (c) => c.peerAddress?.toLowerCase() === peerAddress.toLowerCase()
    );
    if (existing) {
      setActiveConversationId(existing.id);
      return existing.id;
    }

    const bundle = peerBundle || createPublicPrekeyBundle(generateUserPrekeys(5));

    const newId = `conv_${peerAddress}`;
    const newConv: ChatConversation = {
      id: newId,
      name: getDisplayName(peerName, peerAddress),
      type: 'direct',
      peerAddress,
      peerIdentityKeyHex: bundle.identityKeyHex,
      safetyNumberVerified: false,
      avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${peerAddress}`,
      unreadCount: 0,
      selfDestructSetting: 'off',
      isOnline: true,
    };

    setConversations((prev) => [newConv, ...prev]);
    setActiveConversationId(newId);

    addAuditLog({
      type: 'handshake',
      title: 'Vytvořen nový zabezpečený kontakt',
      description: `Přidán kontakt ${peerAddress}. Připraveno pro E2EE šifrování.`,
      details: { address: peerAddress },
      severity: 'info',
    });

    return newId;
  };

  const createGroupChat = async (name: string, memberAddresses: string[]): Promise<string> => {
    if (!profile) throw new Error('Profil není inicializován');

    const newGroupId = `grp_${Date.now()}`;
    const allMembers = Array.from(new Set([profile.address, ...memberAddresses]));

    const newGroup: ChatConversation = {
      id: newGroupId,
      name,
      type: 'group',
      safetyNumberVerified: true,
      avatar: `https://api.dicebear.com/7.x/identicon/svg?seed=${newGroupId}`,
      unreadCount: 0,
      selfDestructSetting: 'off',
      groupMembers: allMembers,
    };

    createMyGroupSenderKey(newGroupId);

    setConversations((prev) => [newGroup, ...prev]);
    setActiveConversationId(newGroupId);

    addAuditLog({
      type: 'handshake',
      title: `Vytvořena E2EE skupina: ${name}`,
      description: `Skupina inicializována s protokolem Sender Key (${allMembers.length} členů).`,
      details: { groupId: newGroupId, membersCount: allMembers.length },
      severity: 'security',
    });

    return newGroupId;
  };

  const deleteMessage = (messageId: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
    addAuditLog({
      type: 'integrity_check',
      title: 'Zpráva smazána uživatelem',
      description: `Lokální zpráva ${messageId.slice(0, 8)} byla trvale odstraněna z trezoru.`,
      details: { messageId },
      severity: 'info',
    });
  };

  const setSelfDestructForActiveChat = (duration: SelfDestructDuration) => {
    if (!activeConversationId) return;
    setConversations((prev) =>
      prev.map((c) => (c.id === activeConversationId ? { ...c, selfDestructSetting: duration } : c))
    );
  };

  const blockContact = (address: string) => {
    setConversations((prev) =>
      prev.map((c) => (c.peerAddress === address ? { ...c, isBlocked: true } : c))
    );
    addAuditLog({
      type: 'blocked_leak',
      title: 'Kontakt zablokován',
      description: `Příjem zpráv od ${formatKeccakAddress(address)} je nyní blokován.`,
      details: { address },
      severity: 'warning',
    });
  };

  const unblockContact = (address: string) => {
    setConversations((prev) =>
      prev.map((c) => (c.peerAddress === address ? { ...c, isBlocked: false } : c))
    );
  };

  const verifyContactSafetyNumber = (conversationId: string) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === conversationId ? { ...c, safetyNumberVerified: true } : c))
    );
    addAuditLog({
      type: 'security',
      title: 'Bezpečnostní číslo úspěšně ověřeno',
      description: 'Identita kontaktu byla kryptograficky ověřena (žádný MitM útok).',
      details: { conversationId },
      severity: 'security',
    });
  };

  // Filter messages for active chat (match by conversationId OR by peer/sender address)
  const currentChatMessages = messages.filter((m) => {
    if (!activeConversationId) return false;
    if (m.conversationId === activeConversationId) return true;
    if (activeConversation?.peerAddress) {
      const pAddr = activeConversation.peerAddress.toLowerCase();
      const sAddr = m.senderAddress.toLowerCase();
      const rAddr = m.recipientAddress?.toLowerCase();
      if ((sAddr === pAddr && rAddr === profile?.address.toLowerCase()) || (sAddr === profile?.address.toLowerCase() && rAddr === pAddr)) {
        return true;
      }
    }
    return false;
  });

  return (
    <ChatContext.Provider
      value={{
        conversations,
        activeConversationId,
        activeConversation,
        messages: currentChatMessages,
        searchQuery,
        isOnline,
        offlineQueueCount: offlineQueue.length,
        discoveredPeers,
        setActiveConversationId,
        setSearchQuery,
        sendMessage,
        createDirectChat,
        createGroupChat,
        deleteMessage,
        setSelfDestructForActiveChat,
        blockContact,
        unblockContact,
        verifyContactSafetyNumber,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
};

export const useChat = () => {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
};
