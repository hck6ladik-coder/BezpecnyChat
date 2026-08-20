import React, { useState } from 'react';
import {
  X,
  UserPlus,
  Copy,
  Check,
  ShieldCheck,
  Link2,
  Sparkles,
  ArrowRight,
  Hash,
  AtSign,
} from 'lucide-react';
import { useCrypto } from '../../context/CryptoContext';
import { useChat } from '../../context/ChatContext';
import {
  deriveShortChatTag,
  createInviteLink,
  parseInviteInput,
} from '../../crypto/keccak';
import { formatPhoneDisplay } from '../../crypto/phone';

interface NewContactModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NewContactModal: React.FC<NewContactModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { profile } = useCrypto();
  const { createDirectChat, discoveredPeers, addFriend } = useChat();

  const [inputQuery, setInputQuery] = useState('');
  const [nicknameInput, setNicknameInput] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const myShortTag = profile?.address ? deriveShortChatTag(profile.address) : '';
  const myFullDisplayCode = `${profile?.username || 'Uživatel'} ${myShortTag}`;

  const handleCopyCode = () => {
    if (myShortTag) {
      navigator.clipboard.writeText(myShortTag);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  const handleCopyInviteLink = () => {
    if (profile?.address) {
      const link = createInviteLink(profile.address, profile.username);
      navigator.clipboard.writeText(link);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmed = inputQuery.trim();
    if (!trimmed) {
      setError('Zadejte krátký kód (#ABC-123), přezdívku (@Honza), odkaz nebo adresu.');
      return;
    }

    const parsed = parseInviteInput(trimmed);

    // 1. Direct address from link or k256
    let targetAddress = parsed.address;
    let targetName = parsed.username || nicknameInput.trim() || undefined;

    // 2. If phone number was given (e.g. +420 777 123 456 or 777123456)
    if (!targetAddress && parsed.phoneNumber) {
      const match = discoveredPeers.find((p) => {
        return (
          p.phoneNumber === parsed.phoneNumber ||
          (p.phoneNumber && p.phoneNumber.replace(/\D/g, '') === parsed.phoneNumber?.replace(/\D/g, ''))
        );
      });
      if (match) {
        targetAddress = match.address;
        targetName = match.username || formatPhoneDisplay(parsed.phoneNumber);
      } else {
        const cleanDigits = parsed.phoneNumber.replace(/\D/g, '');
        targetAddress = `k256:0xphone_${cleanDigits}`;
        targetName = nicknameInput.trim() || formatPhoneDisplay(parsed.phoneNumber);
      }
    }

    // 3. If short tag was given (e.g. #8D7-2AB or 8D72AB)
    if (!targetAddress && parsed.shortTag) {
      const match = discoveredPeers.find((p) => {
        const tag = p.address.replace('k256:0x', '').slice(0, 6).toLowerCase();
        return tag === parsed.shortTag;
      });
      if (match) {
        targetAddress = match.address;
        targetName = match.username;
      } else {
        // Create direct chat with short tag target and connect over P2P mesh
        const tagUpper = parsed.shortTag.toUpperCase();
        const p1 = tagUpper.slice(0, 3);
        const p2 = tagUpper.slice(3, 6);
        targetAddress = `k256:0x${parsed.shortTag.toLowerCase()}`;
        targetName = nicknameInput.trim() || `Uživatel #${p1}-${p2}`;
      }
    }

    // 4. If username was given (e.g. @Honza or Honza)
    if (!targetAddress && parsed.username) {
      const match = discoveredPeers.find(
        (p) => p.username.toLowerCase() === parsed.username?.toLowerCase()
      );
      if (match) {
        targetAddress = match.address;
        targetName = match.username;
      } else {
        targetAddress = `k256:0x${parsed.username.toLowerCase()}`;
        targetName = parsed.username;
      }
    }

    if (!targetAddress) {
      setError('Nepodařilo se rozpoznat kontakt. Zkontrolujte zadané telefonní číslo, kód nebo odkaz.');
      return;
    }

    if (profile && targetAddress.toLowerCase() === profile.address.toLowerCase()) {
      setError('Nemůžete zahájit chat se svým vlastním účtem.');
      return;
    }

    try {
      await createDirectChat(targetAddress, targetName);
      addFriend({
        address: targetAddress,
        username: targetName,
      });
      setInputQuery('');
      setNicknameInput('');
      setError(null);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Chyba při zahájení chatu.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm select-none animate-in fade-in">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl p-6 sm:p-7 space-y-6 text-slate-100 relative overflow-hidden">
        {/* Glow accent */}
        <div className="absolute top-0 right-1/2 translate-x-1/2 w-64 h-20 bg-cyber-500/10 blur-3xl pointer-events-none" />

        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-2xl bg-gradient-to-tr from-cyber-600 to-cyber-400 text-slate-950 shadow-lg shadow-cyber-500/20">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base sm:text-lg">Zahájit Šifrovaný Chat</h3>
              <p className="text-xs text-slate-400">
                Připojte se přes krátký kód, přezdívku nebo odkaz
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Sharing Cards (Krátký Kód & 1-Klik Odkaz) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {/* Card 1: Váš Krátký Kód */}
          <div className="p-3.5 bg-slate-950/80 border border-slate-800 rounded-2xl space-y-1.5 flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="flex items-center space-x-1">
                <Hash className="w-3.5 h-3.5 text-cyber-400" />
                <span>Váš krátký kód:</span>
              </span>
            </div>
            <div className="text-base font-mono font-bold text-cyber-300 tracking-wider">
              {myShortTag || '#...'}
            </div>
            <button
              onClick={handleCopyCode}
              className="w-full py-1.5 px-2.5 rounded-xl bg-slate-850 hover:bg-slate-800 text-slate-300 hover:text-white text-[11px] font-medium flex items-center justify-center space-x-1.5 border border-slate-700/60 transition-all"
            >
              {copiedCode ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              <span>{copiedCode ? 'Zkopírováno!' : 'Kopírovat kód'}</span>
            </button>
          </div>

          {/* Card 2: 1-Klik Odkaz s Pozvánkou */}
          <div className="p-3.5 bg-slate-950/80 border border-slate-800 rounded-2xl space-y-1.5 flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="flex items-center space-x-1">
                <Link2 className="w-3.5 h-3.5 text-cyber-400" />
                <span>Odkaz na chat (1 klik):</span>
              </span>
            </div>
            <div className="text-[11px] text-slate-400 truncate">
              Otevře přímé spojení bez opisování kódu
            </div>
            <button
              onClick={handleCopyInviteLink}
              className="w-full py-1.5 px-2.5 rounded-xl bg-cyber-500/10 hover:bg-cyber-500/20 text-cyber-300 hover:text-cyber-200 text-[11px] font-semibold flex items-center justify-center space-x-1.5 border border-cyber-500/30 transition-all"
            >
              {copiedLink ? <Check className="w-3 h-3 text-emerald-400" /> : <Link2 className="w-3 h-3" />}
              <span>{copiedLink ? 'Odkaz zkopírován!' : 'Kopírovat odkaz pozvánky'}</span>
            </button>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-red-950/60 border border-red-800/80 rounded-2xl text-xs text-red-300 leading-relaxed">
            {error}
          </div>
        )}

        {/* Simplified Search & Connect Form */}
        <form onSubmit={handleConnect} className="space-y-3.5">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Zadejte krátký kód, přezdívku, odkaz nebo adresu:
            </label>
            <div className="relative">
              <input
                type="text"
                required
                autoFocus
                placeholder="např. #8D7-2AB nebo @Honza nebo vložte odkaz..."
                value={inputQuery}
                onChange={(e) => setInputQuery(e.target.value)}
                className="w-full pl-4 pr-10 py-3 bg-slate-950 border border-slate-800 rounded-2xl text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyber-500/50 shadow-inner"
              />
              <Sparkles className="w-4 h-4 text-cyber-400 absolute right-3.5 top-3.5 pointer-events-none" />
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Tip: Stačí zadat 6místný kód (např. <code className="text-cyber-300">#8D7-2AB</code>) nebo kliknout na odkaz s pozvánkou.
            </p>
          </div>

          <div className="flex items-center justify-end space-x-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-medium transition-colors"
            >
              Zrušit
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyber-500 to-cyber-400 hover:from-cyber-400 hover:to-cyber-300 text-slate-950 font-bold text-xs shadow-lg shadow-cyber-500/20 flex items-center space-x-2 transition-all"
            >
              <span>Vyhledat a Zahájit Chat</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
