import React, { useState, useEffect } from 'react';
import { CryptoProvider, useCrypto } from './context/CryptoContext';
import { ChatProvider, useChat } from './context/ChatContext';
import { Navbar } from './components/layout/Navbar';
import { ChatList } from './components/chat/ChatList';
import { ChatWindow } from './components/chat/ChatWindow';
import { AuthModal } from './components/modals/AuthModal';
import { SafetyNumberModal } from './components/modals/SafetyNumberModal';
import { GroupCreateModal } from './components/modals/GroupCreateModal';
import { UserProfileModal } from './components/modals/UserProfileModal';
import { NewContactModal } from './components/modals/NewContactModal';
import { CryptoInspector } from './components/security/CryptoInspector';
import { ChatMessage } from './types/chat';

const MainAppContent: React.FC = () => {
  const { isUnlocked } = useCrypto();
  const { createDirectChat, activeConversationId, setActiveConversationId } = useChat();

  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [isAuthOpen, setIsAuthOpen] = useState<boolean>(!isUnlocked);
  const [isProfileOpen, setIsProfileOpen] = useState<boolean>(false);
  const [isSafetyOpen, setIsSafetyOpen] = useState<boolean>(false);
  const [isGroupCreateOpen, setIsGroupCreateOpen] = useState<boolean>(false);
  const [isNewContactOpen, setIsNewContactOpen] = useState<boolean>(false);
  const [isInspectorOpen, setIsInspectorOpen] = useState<boolean>(false);
  const [inspectedMessage, setInspectedMessage] = useState<ChatMessage | null>(null);

  // Automatically open auth modal when locked or logged out
  useEffect(() => {
    if (!isUnlocked) {
      setIsAuthOpen(true);
    }
  }, [isUnlocked]);

  // Auto-connect when opened via an invite link (#invite?addr=...&name=...)
  useEffect(() => {
    if (isUnlocked && window.location.hash.includes('invite')) {
      try {
        const hash = window.location.hash;
        const query = hash.split('?')[1];
        if (query) {
          const params = new URLSearchParams(query);
          const addr = params.get('addr');
          const name = params.get('name');
          if (addr) {
            createDirectChat(addr, name || undefined);
            window.history.replaceState(null, '', window.location.pathname);
          }
        }
      } catch (err) {
        console.error('Failed to parse invite link:', err);
      }
    }
  }, [isUnlocked]);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    if (next === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  const handleInspectMessageCrypto = (msg: ChatMessage) => {
    setInspectedMessage(msg);
    setIsInspectorOpen(true);
  };

  return (
    <div className={`h-screen w-screen flex flex-col bg-slate-950 text-slate-100 overflow-hidden font-sans ${theme}`}>
      {/* Top Navigation */}
      <Navbar
        onOpenAuth={() => setIsAuthOpen(true)}
        onOpenProfile={() => setIsProfileOpen(true)}
        onOpenInspector={() => setIsInspectorOpen(true)}
        isInspectorOpen={isInspectorOpen}
        theme={theme}
        toggleTheme={toggleTheme}
      />

      {/* Main Chat Interface */}
      <main className="flex-1 flex overflow-hidden" aria-label="Hlavní chat">
        <h1 className="sr-only">Bezpečný Chat - šifrované zprávy</h1>
        <ChatList
          onNewChat={() => setIsNewContactOpen(true)}
          onNewGroup={() => setIsGroupCreateOpen(true)}
          isMobileChatOpen={Boolean(activeConversationId)}
        />
        <ChatWindow
          onOpenSafetyNumber={() => setIsSafetyOpen(true)}
          onInspectMessageCrypto={handleInspectMessageCrypto}
          onMobileBack={() => setActiveConversationId(null)}
          isMobileChatOpen={Boolean(activeConversationId)}
        />
      </main>

      {/* Modals & Overlays */}
      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
      />

      <NewContactModal
        isOpen={isNewContactOpen}
        onClose={() => setIsNewContactOpen(false)}
      />

      <SafetyNumberModal
        isOpen={isSafetyOpen}
        onClose={() => setIsSafetyOpen(false)}
      />

      <GroupCreateModal
        isOpen={isGroupCreateOpen}
        onClose={() => setIsGroupCreateOpen(false)}
      />

      <UserProfileModal
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
      />

      <CryptoInspector
        isOpen={isInspectorOpen}
        onClose={() => {
          setIsInspectorOpen(false);
          setInspectedMessage(null);
        }}
        inspectedMessage={inspectedMessage}
      />
    </div>
  );
};

export default function App() {
  return (
    <CryptoProvider>
      <ChatProvider>
        <MainAppContent />
      </ChatProvider>
    </CryptoProvider>
  );
}
