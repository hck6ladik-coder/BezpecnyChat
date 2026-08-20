import React, { useState, useRef, useEffect } from 'react';
import {
  Phone,
  Video,
  ShieldCheck,
  ShieldAlert,
  Flame,
  Send,
  Paperclip,
  Mic,
  MicOff,
  MoreVertical,
  Lock,
  Info,
  Clock,
  Trash2,
  Ban,
  UserCheck,
  HeartHandshake,
  Sparkles,
} from 'lucide-react';
import { useChat } from '../../context/ChatContext';
import { useCrypto } from '../../context/CryptoContext';
import { useWebRTC } from '../../context/WebRTCContext';
import { MessageBubble } from './MessageBubble';
import { SelfDestructDuration, ChatMessage } from '../../types/chat';
import { formatKeccakAddress } from '../../crypto/keccak';
import { detectCrisisIntent, CrisisDetectionResult } from '../../services/safetyGuard';
import { CrisisSafetyModal } from '../modals/CrisisSafetyModal';

interface ChatWindowProps {
  onOpenSafetyNumber: () => void;
  onInspectMessageCrypto: (msg: ChatMessage) => void;
}

export const ChatWindow: React.FC<ChatWindowProps> = ({
  onOpenSafetyNumber,
  onInspectMessageCrypto,
}) => {
  const {
    activeConversation,
    messages,
    sendMessage,
    deleteMessage,
    setSelfDestructForActiveChat,
    blockContact,
    unblockContact,
  } = useChat();

  const { startCall } = useWebRTC();
  const [inputText, setInputText] = useState('');
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Safety Guard state
  const [isCrisisModalOpen, setIsCrisisModalOpen] = useState(false);
  const [crisisResult, setCrisisResult] = useState<CrisisDetectionResult | null>(null);
  const [pendingCrisisMessage, setPendingCrisisMessage] = useState<{
    text: string;
    file?: File;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (!activeConversation) {
    return (
      <div className="flex-1 h-full bg-slate-950 flex flex-col items-center justify-center text-slate-500 p-8 text-center select-none">
        <div className="w-16 h-16 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center mb-4 text-cyber-400">
          <Lock className="w-8 h-8" />
        </div>
        <h3 className="text-base font-semibold text-slate-300 mb-1">
          Vyberte zabezpečený chat
        </h3>
        <p className="text-xs text-slate-500 max-w-sm">
          Veškerá komunikace je chráněna koncovým šifrováním (E2EE) s integritou zaručenou funkcí KECCAK256.
        </p>
      </div>
    );
  }

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() && !selectedFile) return;

    const textToSend = inputText.trim();
    const fileToSend = selectedFile || undefined;

    // Bilingual Safety Guard: Lightning-fast check for crisis keywords BEFORE encryption
    if (textToSend) {
      const detection = detectCrisisIntent(textToSend);
      if (detection.isTriggered) {
        setCrisisResult(detection);
        setPendingCrisisMessage({ text: textToSend, file: fileToSend });
        setIsCrisisModalOpen(true);
        return; // Intercept sending until confirmed
      }
    }

    setInputText('');
    setSelectedFile(null);

    await sendMessage(textToSend, fileToSend);
  };

  const handleProceedCrisisSend = async () => {
    if (!pendingCrisisMessage) return;
    const { text, file } = pendingCrisisMessage;
    setInputText('');
    setSelectedFile(null);
    setPendingCrisisMessage(null);
    await sendMessage(text, file);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 500 * 1024 * 1024) {
        alert('Velikost souboru překračuje limit 500 MB.');
        return;
      }
      setSelectedFile(file);
    }
  };

  const toggleAudioRecordSimulation = () => {
    if (isRecordingAudio) {
      setIsRecordingAudio(false);
      sendMessage('🎙️ Hlasová zpráva (Šifrováno AES-256-GCM)', undefined, 'audio');
    } else {
      setIsRecordingAudio(true);
    }
  };

  const selfDestructOptions: { label: string; value: SelfDestructDuration }[] = [
    { label: 'Vypnuto', value: 'off' },
    { label: '5 sekund', value: '5s' },
    { label: '1 minuta', value: '1m' },
    { label: '1 hodina', value: '1h' },
    { label: '1 den', value: '1d' },
    { label: '3 dny', value: '3d' },
    { label: '7 dní', value: '7d' },
    { label: '30 dní', value: '30d' },
  ];

  return (
    <main className="flex-1 h-full bg-slate-950 flex flex-col min-w-0">
      {/* Header */}
      <div className="h-16 px-4 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between select-none">
        {/* Contact info */}
        <div className="flex items-center space-x-3 min-w-0">
          <div className="relative">
            <img
              src={activeConversation.avatar}
              alt={activeConversation.name}
              className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 object-cover"
            />
            {activeConversation.isOnline && (
              <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 border-2 border-slate-900 rounded-full" />
            )}
          </div>

          <div className="min-w-0">
            <div className="flex items-center space-x-2">
              <h3 className="font-semibold text-sm text-slate-100 truncate">
                {activeConversation.name}
              </h3>
              {activeConversation.type === 'direct' && (
                <button
                  onClick={onOpenSafetyNumber}
                  className="flex items-center space-x-1"
                  title="Ověřit bezpečnostní číslo (Safety Number)"
                >
                  {activeConversation.safetyNumberVerified ? (
                    <span className="text-[10px] font-mono flex items-center space-x-1 text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/30">
                      <ShieldCheck className="w-3 h-3" />
                      <span>Ověřeno</span>
                    </span>
                  ) : (
                    <span className="text-[10px] font-mono flex items-center space-x-1 text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/30">
                      <ShieldAlert className="w-3 h-3" />
                      <span>Ověřit SAS</span>
                    </span>
                  )}
                </button>
              )}
            </div>

            <div className="flex items-center space-x-2 text-[11px] text-slate-400 font-mono truncate">
              {activeConversation.type === 'direct' && activeConversation.peerAddress ? (
                <span>{formatKeccakAddress(activeConversation.peerAddress)}</span>
              ) : (
                <span>{activeConversation.groupMembers?.length || 0} účastníků</span>
              )}
              <span>•</span>
              <span className="text-cyber-400">PFS Aktivní</span>
            </div>
          </div>
        </div>

        {/* Right header actions */}
        <div className="flex items-center space-x-1 sm:space-x-2">
          {/* WebRTC Audio Call */}
          <button
            onClick={() =>
              startCall(
                activeConversation.peerAddress || activeConversation.id,
                activeConversation.name,
                activeConversation.avatar,
                'audio'
              )
            }
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-cyber-300 transition-colors"
            title="Šifrovaný hlasový hovor (WebRTC + SAS ověření)"
          >
            <Phone className="w-4 h-4" />
          </button>

          {/* WebRTC Video Call */}
          <button
            onClick={() =>
              startCall(
                activeConversation.peerAddress || activeConversation.id,
                activeConversation.name,
                activeConversation.avatar,
                'video'
              )
            }
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-cyber-300 transition-colors"
            title="Šifrovaný videohovor (WebRTC)"
          >
            <Video className="w-4 h-4" />
          </button>

          {/* Self-destruct setting dropdown */}
          <div className="relative">
            <select
              value={activeConversation.selfDestructSetting}
              onChange={(e) =>
                setSelfDestructForActiveChat(e.target.value as SelfDestructDuration)
              }
              className="appearance-none bg-slate-800 hover:bg-slate-750 border border-slate-700 text-xs text-slate-300 rounded-xl px-2.5 py-1.5 pr-6 cursor-pointer focus:outline-none focus:border-cyber-500/50 transition-colors"
              title="Nastavení samosmazání zpráv"
            >
              {selfDestructOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  ⏱️ {opt.label}
                </option>
              ))}
            </select>
            <Flame className="w-3 h-3 text-amber-400 absolute right-2 top-2.5 pointer-events-none" />
          </div>

          {/* More options menu */}
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-slate-100 transition-colors"
            >
              <MoreVertical className="w-4 h-4" />
            </button>

            {showMenu && (
              <div className="absolute right-0 mt-2 w-48 bg-slate-900 border border-slate-800 rounded-xl shadow-xl py-1 z-30 text-xs">
                {activeConversation.type === 'direct' && (
                  <button
                    onClick={() => {
                      onOpenSafetyNumber();
                      setShowMenu(false);
                    }}
                    className="w-full px-3 py-2 text-left hover:bg-slate-800 text-slate-200 flex items-center space-x-2"
                  >
                    <UserCheck className="w-4 h-4 text-cyber-400" />
                    <span>Ověřit bezpečnostní kód</span>
                  </button>
                )}

                {activeConversation.isBlocked ? (
                  <button
                    onClick={() => {
                      if (activeConversation.peerAddress) unblockContact(activeConversation.peerAddress);
                      setShowMenu(false);
                    }}
                    className="w-full px-3 py-2 text-left hover:bg-slate-800 text-emerald-400 flex items-center space-x-2"
                  >
                    <Ban className="w-4 h-4" />
                    <span>Odblokovat kontakt</span>
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      if (activeConversation.peerAddress) blockContact(activeConversation.peerAddress);
                      setShowMenu(false);
                    }}
                    className="w-full px-3 py-2 text-left hover:bg-slate-800 text-rose-400 flex items-center space-x-2"
                  >
                    <Ban className="w-4 h-4" />
                    <span>Zablokovat kontakt</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Messages Timeline */}
      <div className="flex-1 overflow-y-auto p-4 space-y-1">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 py-12">
            <ShieldCheck className="w-10 h-10 text-cyber-500/40 mb-2" />
            <p className="text-xs font-semibold text-slate-400">
              Konec-konce šifrovaný chat zahájen
            </p>
            <p className="text-[11px] text-slate-600 max-w-xs mt-1">
              Zprávy a hovory jsou zabezpečeny protokolem Signal (Double Ratchet + KECCAK256).
            </p>
          </div>
        ) : (
          messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              onDelete={deleteMessage}
              onInspectCrypto={onInspectMessageCrypto}
            />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Attachment Preview Banner if selected */}
      {selectedFile && (
        <div className="px-4 py-2 bg-slate-900 border-t border-slate-800 flex items-center justify-between text-xs">
          <div className="flex items-center space-x-2 truncate">
            <Paperclip className="w-3.5 h-3.5 text-cyber-400 flex-shrink-0" />
            <span className="text-slate-200 truncate">{selectedFile.name}</span>
            <span className="text-slate-500 font-mono">
              ({(selectedFile.size / (1024 * 1024)).toFixed(2)} MB)
            </span>
          </div>
          <button
            onClick={() => setSelectedFile(null)}
            className="text-slate-400 hover:text-rose-400 transition-colors ml-2"
          >
            Zrušit
          </button>
        </div>
      )}

      {/* Message Input Box */}
      <div className="p-3 bg-slate-900 border-t border-slate-800">
        <form onSubmit={handleSend} className="flex items-center space-x-2">
          {/* File attachment button */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-400 hover:text-cyber-300 transition-colors"
            title="Přiložit zašifrovaný soubor (až 500 MB)"
          >
            <Paperclip className="w-4 h-4" />
          </button>

          {/* Voice Record Button */}
          <button
            type="button"
            onClick={toggleAudioRecordSimulation}
            className={`p-2.5 rounded-xl transition-all ${
              isRecordingAudio
                ? 'bg-rose-500 text-white animate-pulse'
                : 'bg-slate-800 hover:bg-slate-750 text-slate-400 hover:text-cyber-300'
            }`}
            title="Nahrát šifrovanou hlasovou zprávu"
          >
            {isRecordingAudio ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>

          {/* Text Input */}
          <div className="flex-1 relative">
            <input
              type="text"
              placeholder="Napište šifrovanou zprávu..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyber-500/50"
            />
          </div>

          {/* Send Button */}
          <button
            type="submit"
            disabled={!inputText.trim() && !selectedFile}
            className="p-2.5 rounded-xl bg-gradient-to-r from-cyber-500 to-cyber-400 hover:from-cyber-400 hover:to-cyber-300 text-slate-950 font-semibold transition-all shadow-md shadow-cyber-500/20 disabled:opacity-40 disabled:pointer-events-none"
            title="Odeslat s koncovým šifrováním"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>

      {/* Bilingual Crisis Safety Guard Modal */}
      <CrisisSafetyModal
        isOpen={isCrisisModalOpen}
        onClose={() => setIsCrisisModalOpen(false)}
        detectionResult={crisisResult}
        onProceedAnyway={handleProceedCrisisSend}
      />
    </main>
  );
};
