import React, { useState } from 'react';
import {
  X,
  ShieldCheck,
  QrCode,
  Copy,
  Check,
  CheckCircle2,
  Lock,
  RefreshCw,
} from 'lucide-react';
import { useChat } from '../../context/ChatContext';
import { useCrypto } from '../../context/CryptoContext';
import { computeSafetyNumber } from '../../crypto/safetyNumbers';
import { formatKeccakAddress } from '../../crypto/keccak';

interface SafetyNumberModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SafetyNumberModal: React.FC<SafetyNumberModalProps> = ({ isOpen, onClose }) => {
  const { activeConversation, verifyContactSafetyNumber } = useChat();
  const { profile, prekeys } = useCrypto();
  const [copied, setCopied] = useState(false);

  if (!isOpen || !activeConversation || !profile || !prekeys) return null;

  const peerIdentityKeyHex = activeConversation.peerIdentityKeyHex || '00'.repeat(32);
  const peerAddress = activeConversation.peerAddress || activeConversation.id;

  const safetyData = computeSafetyNumber(
    prekeys.identityKeyPair.publicKeyHex,
    peerIdentityKeyHex,
    profile.address,
    peerAddress
  );

  const handleCopy = () => {
    navigator.clipboard.writeText(safetyData.fingerprint);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleVerify = () => {
    verifyContactSafetyNumber(activeConversation.id);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in select-none">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 space-y-5 text-slate-100">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-cyber-500/10 text-cyber-400 border border-cyber-500/30">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-sm sm:text-base">
                Ověření Bezpečnostního Čísla
              </h3>
              <p className="text-xs text-slate-400">
                Ověření identity s {activeConversation.name}
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

        {/* Explanation */}
        <div className="text-xs text-slate-400 leading-relaxed bg-slate-950/60 p-3 rounded-xl border border-slate-800">
          <p>
            Porovnejte toto 60místné bezpečnostní číslo s druhým účastníkem přes jiný kanál (např. osobně nebo hlasovým hovorem). Kód je vypočten pomocí 5 200 iterací funkce <strong className="text-cyber-300">KECCAK256</strong> z obou veřejných klíčů. Pokud se čísla shodují, komunikace je stoprocentně chráněna proti útokům typu Man-in-the-Middle.
          </p>
        </div>

        {/* QR Code Mock & Visual Short SAS */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-6 py-2">
          {/* Simulated QR Pattern */}
          <div className="p-3 bg-white rounded-xl shadow-md flex items-center justify-center">
            <div className="w-32 h-32 bg-slate-950 rounded-lg p-1 grid grid-cols-6 gap-1">
              {Array.from({ length: 36 }).map((_, i) => (
                <div
                  key={i}
                  className={`rounded-xs ${
                    (i * 7 + 3) % 2 === 0 ? 'bg-cyber-400' : 'bg-slate-900'
                  }`}
                />
              ))}
            </div>
          </div>

          <div className="text-center sm:text-left space-y-1">
            <span className="text-[11px] uppercase tracking-wider text-slate-500 font-mono">
              Rychlý kontrolní kód (SAS)
            </span>
            <div className="text-2xl font-mono font-bold text-cyber-300 tracking-wider">
              {safetyData.shortVerificationCode}
            </div>
            <p className="text-[11px] text-slate-400">
              Shoduje se u obou stran
            </p>
          </div>
        </div>

        {/* 60-digit number grid (12 blocks of 5) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>60místný kód identity:</span>
            <button
              onClick={handleCopy}
              className="flex items-center space-x-1 text-cyber-400 hover:text-cyber-300 font-mono text-[11px]"
            >
              {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              <span>{copied ? 'Zkopírováno!' : 'Kopírovat kód'}</span>
            </button>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 bg-slate-950 p-3 rounded-xl border border-slate-800 text-center font-mono text-xs sm:text-sm font-semibold text-slate-200">
            {safetyData.formattedBlocks.map((block, idx) => (
              <div
                key={idx}
                className="p-1.5 rounded-lg bg-slate-900/80 border border-slate-800 text-cyber-200"
              >
                {block}
              </div>
            ))}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end space-x-3 pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-medium transition-colors"
          >
            Zavřít
          </button>
          <button
            onClick={handleVerify}
            className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-cyber-500 hover:bg-cyber-400 text-slate-950 text-xs font-semibold shadow-md shadow-cyber-500/20 transition-all"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Označit jako Ověřené</span>
          </button>
        </div>
      </div>
    </div>
  );
};
