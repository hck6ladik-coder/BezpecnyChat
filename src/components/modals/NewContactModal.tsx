import React, { useState } from 'react';
import {
  X,
  UserPlus,
  Copy,
  Check,
  ShieldCheck,
  KeyRound,
  ArrowRight,
} from 'lucide-react';
import { useCrypto } from '../../context/CryptoContext';
import { useChat } from '../../context/ChatContext';

interface NewContactModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NewContactModal: React.FC<NewContactModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { profile } = useCrypto();
  const { createDirectChat } = useChat();

  const [addressInput, setAddressInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [copiedMyAddr, setCopiedMyAddr] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCopyMyAddress = () => {
    if (profile?.address) {
      navigator.clipboard.writeText(profile.address);
      setCopiedMyAddr(true);
      setTimeout(() => setCopiedMyAddr(false), 2000);
    }
  };

  const handleAddCustom = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = addressInput.trim();
    if (!trimmed) {
      setError('Zadejte k256:0x adresu kontaktu.');
      return;
    }

    if (profile && trimmed.toLowerCase() === profile.address.toLowerCase()) {
      setError('Nemůžete zahájit chat se svou vlastní adresou.');
      return;
    }

    try {
      await createDirectChat(trimmed, nameInput.trim() || undefined);
      setAddressInput('');
      setNameInput('');
      setError(null);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Chyba při navazování spojení.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm select-none animate-in fade-in">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 space-y-5 text-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-cyber-500/10 text-cyber-400 border border-cyber-500/30">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-sm sm:text-base">
                Přidat Kontakt a Zahájit Chat
              </h3>
              <p className="text-xs text-slate-400">
                Přímé koncové šifrování na základě k256 adresy
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* My Address Quick Copy Banner */}
        <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400 flex items-center space-x-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-cyber-400" />
              <span>Vaše adresa (pošlete ji protistraně):</span>
            </span>
            <button
              onClick={handleCopyMyAddress}
              className="text-cyber-400 hover:text-cyber-300 font-mono text-[11px] flex items-center space-x-1"
            >
              {copiedMyAddr ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              <span>{copiedMyAddr ? 'Zkopírováno!' : 'Kopírovat moji adresu'}</span>
            </button>
          </div>
          <div className="text-[11px] font-mono text-cyber-300 truncate bg-slate-900 p-2 rounded-lg border border-slate-800/80">
            {profile?.address}
          </div>
        </div>

        {error && (
          <div className="p-2.5 bg-red-950/60 border border-red-800 rounded-xl text-xs text-red-300">
            {error}
          </div>
        )}

        {/* Manual Address Input Form */}
        <form onSubmit={handleAddCustom} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Vložte k256:0x adresu kontaktu:
            </label>
            <input
              type="text"
              required
              autoFocus
              placeholder="k256:0x..."
              value={addressInput}
              onChange={(e) => setAddressInput(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyber-500/50"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Pojmenování / přezdívka kontaktu (volitelné):
            </label>
            <input
              type="text"
              placeholder="např. Kolega, Alice..."
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyber-500/50"
            />
          </div>

          <div className="flex items-center justify-end space-x-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-medium"
            >
              Zrušit
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-cyber-500 hover:bg-cyber-400 text-slate-950 font-semibold text-xs shadow-md shadow-cyber-500/20 flex items-center space-x-1.5"
            >
              <span>Přidat a Zahájit Chat</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
