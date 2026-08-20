import React, { useState } from 'react';
import {
  X,
  User,
  Key,
  Shield,
  ShieldCheck,
  RefreshCw,
  Copy,
  Check,
  Globe,
  QrCode,
  Lock,
  Flame,
} from 'lucide-react';
import { useCrypto } from '../../context/CryptoContext';
import { formatKeccakAddress } from '../../crypto/keccak';
import { generateTotpSetup } from '../../crypto/auth';

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({ isOpen, onClose }) => {
  const {
    profile,
    publicBundle,
    rotateKeys,
    enable2FA,
    disable2FA,
    toggleTorRouting,
  } = useCrypto();

  const [copiedAddr, setCopiedAddr] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [isRotating, setIsRotating] = useState(false);
  const [showTotpSetup, setShowTotpSetup] = useState(false);
  const [totpSetupData, setTotpSetupData] = useState<ReturnType<typeof generateTotpSetup> | null>(null);

  if (!isOpen || !profile || !publicBundle) return null;

  const handleCopyAddress = () => {
    navigator.clipboard.writeText(profile.address);
    setCopiedAddr(true);
    setTimeout(() => setCopiedAddr(false), 2000);
  };

  const handleCopyKey = () => {
    navigator.clipboard.writeText(publicBundle.identityKeyHex);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const handleRotate = async () => {
    setIsRotating(true);
    await rotateKeys();
    setTimeout(() => setIsRotating(false), 800);
  };

  const handleStart2FA = () => {
    const data = generateTotpSetup(profile.username || 'Uživatel');
    setTotpSetupData(data);
    setShowTotpSetup(true);
  };

  const handleConfirm2FA = async () => {
    if (!totpSetupData) return;
    await enable2FA(totpSetupData.secretBytesHex, totpSetupData.backupCodeHashes);
    setShowTotpSetup(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm select-none animate-in fade-in">
      <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 space-y-5 text-slate-100 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center space-x-3">
            <img
              src={profile.avatar}
              alt={profile.username}
              className="w-12 h-12 rounded-2xl bg-slate-800 border-2 border-cyber-500/40 object-cover"
            />
            <div>
              <h3 className="font-bold text-lg text-slate-100 flex items-center space-x-2">
                <span>{profile.username || 'Uživatel'}</span>
                <span className="text-xs font-mono font-semibold text-cyber-300 bg-cyber-500/10 px-2 py-0.5 rounded-full border border-cyber-500/30">
                  {formatKeccakAddress(profile.address)}
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Šifrovaný profil v P2P síti
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

        {/* Short Code & 1-Click Invite Link Box */}
        <div className="p-4 bg-gradient-to-br from-slate-950 to-slate-900 border border-cyber-500/30 rounded-2xl space-y-3 shadow-lg shadow-cyber-500/5">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-400 font-medium">Váš jednoduchý kód pro spojení:</span>
              <div className="text-xl font-mono font-bold text-cyber-300 tracking-wider">
                {formatKeccakAddress(profile.address)}
              </div>
            </div>
            <button
              onClick={() => {
                navigator.clipboard.writeText(formatKeccakAddress(profile.address));
                setCopiedAddr(true);
                setTimeout(() => setCopiedAddr(false), 2000);
              }}
              className="px-3 py-1.5 bg-cyber-500/20 hover:bg-cyber-500/30 text-cyber-300 text-xs font-semibold rounded-xl border border-cyber-500/40 flex items-center space-x-1.5 transition-all"
            >
              {copiedAddr ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedAddr ? 'Zkopírováno' : 'Kopírovat kód'}</span>
            </button>
          </div>
        </div>

        {/* Public Cryptographic Bundle */}
        <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-medium flex items-center space-x-1.5 text-slate-300">
              <Key className="w-3.5 h-3.5 text-cyber-400" />
              <span>Veřejný Identity Klíč (Curve25519)</span>
            </span>
            <button
              onClick={handleCopyKey}
              className="flex items-center space-x-1 text-cyber-400 hover:text-cyber-300 font-mono text-[11px]"
            >
              {copiedKey ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              <span>{copiedKey ? 'Zkopírováno' : 'Kopírovat'}</span>
            </button>
          </div>
          <p className="text-[11px] font-mono text-slate-400 break-all bg-slate-900 p-2 rounded-lg border border-slate-800/80">
            {publicBundle.identityKeyHex}
          </p>
        </div>

        {/* Security & Key Rotation Action */}
        <div className="flex items-center justify-between p-3 bg-slate-950/80 border border-slate-800 rounded-xl">
          <div>
            <div className="text-xs font-medium text-slate-200">
              Rotace Kryptografických Prekeys
            </div>
            <div className="text-[11px] text-slate-400">
              Vygeneruje novou podepsanou prekey a 30 jednorázových OPK klíčů.
            </div>
          </div>
          <button
            onClick={handleRotate}
            disabled={isRotating}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-750 text-cyber-300 border border-slate-700 rounded-xl text-xs font-medium transition-all"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRotating ? 'animate-spin' : ''}`} />
            <span>Rotovat Klíče</span>
          </button>
        </div>

        {/* Network Anonymization (Tor) */}
        <div className="flex items-center justify-between p-3 bg-slate-950/80 border border-slate-800 rounded-xl">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/30">
              <Globe className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-medium text-slate-200">
                Tor & I2P Síťová Anonymizace (.onion)
              </div>
              <div className="text-[11px] text-slate-400">
                Skrývá vaši IP adresu a směruje provoz přes Tor SOCKS5 proxy.
              </div>
            </div>
          </div>
          <button
            onClick={toggleTorRouting}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
              profile.torRoutingEnabled
                ? 'bg-purple-500/20 text-purple-300 border-purple-500/50'
                : 'bg-slate-800 text-slate-400 border-slate-700'
            }`}
          >
            {profile.torRoutingEnabled ? 'Aktivní' : 'Vypnuto'}
          </button>
        </div>

        {/* 2FA TOTP Settings */}
        <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <div className="p-2 rounded-xl bg-cyber-500/10 text-cyber-400 border border-cyber-500/30">
                <Shield className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-medium text-slate-200">
                  Dvoufaktorové Ověřování (2FA TOTP)
                </div>
                <div className="text-[11px] text-slate-400">
                  {profile.has2FA ? 'Aktivováno (Google Authenticator)' : 'Zabezpečte trezor TOTP kódem'}
                </div>
              </div>
            </div>

            {profile.has2FA ? (
              <button
                onClick={disable2FA}
                className="px-3 py-1.5 bg-red-950/40 text-red-400 border border-red-900/40 rounded-xl text-xs font-medium"
              >
                Vypnout 2FA
              </button>
            ) : (
              <button
                onClick={handleStart2FA}
                className="px-3 py-1.5 bg-cyber-500 text-slate-950 rounded-xl text-xs font-semibold hover:bg-cyber-400"
              >
                Nastavit 2FA
              </button>
            )}
          </div>

          {/* 2FA Setup Drawer */}
          {showTotpSetup && totpSetupData && (
            <div className="pt-3 border-t border-slate-800 space-y-3">
              <p className="text-xs text-slate-300">
                1. Naskenujte tento QR kód ve vaší autentizační aplikaci (Google Authenticator / Aegis):
              </p>

              <div className="flex items-center space-x-4 bg-slate-900 p-3 rounded-xl border border-slate-800">
                <div className="w-20 h-20 bg-white rounded-lg p-1 grid grid-cols-4 gap-1">
                  {Array.from({ length: 16 }).map((_, i) => (
                    <div
                      key={i}
                      className={`rounded-xs ${i % 2 === 0 ? 'bg-slate-950' : 'bg-cyber-500'}`}
                    />
                  ))}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-[10px] text-slate-500 uppercase font-mono">
                    Tajný klíč (Base32)
                  </span>
                  <div className="font-mono text-xs font-bold text-cyber-300 select-all">
                    {totpSetupData.secretBase32}
                  </div>
                </div>
              </div>

              <div>
                <span className="text-xs font-medium text-slate-300">
                  2. Záložní záchranné kódy (KECCAK-256 šifrováno):
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 mt-1.5 font-mono text-[11px] text-slate-300 bg-slate-900 p-2.5 rounded-xl border border-slate-800">
                  {totpSetupData.backupCodes.map((code, idx) => (
                    <div key={idx} className="p-1 rounded bg-slate-950 text-center text-amber-300">
                      {code}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-1">
                <button
                  onClick={() => setShowTotpSetup(false)}
                  className="px-3 py-1.5 bg-slate-800 text-slate-300 text-xs rounded-xl"
                >
                  Zrušit
                </button>
                <button
                  onClick={handleConfirm2FA}
                  className="px-3 py-1.5 bg-cyber-500 text-slate-950 text-xs font-semibold rounded-xl hover:bg-cyber-400"
                >
                  Aktivovat 2FA Ochrannu
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Close Button */}
        <div className="flex justify-end pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-medium"
          >
            Zavřít Profil
          </button>
        </div>
      </div>
    </div>
  );
};
