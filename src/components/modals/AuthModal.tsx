import React, { useState } from 'react';
import {
  Lock,
  Unlock,
  Key,
  ShieldCheck,
  Zap,
  Cpu,
  AlertTriangle,
  Wallet,
  MessageSquare,
  Sparkles,
} from 'lucide-react';
import { useCrypto } from '../../context/CryptoContext';
import { formatSiweMessage, signSiweMessage } from '../../crypto/auth';
import { generateSigningKeyPair } from '../../crypto/x3dh';
import { deriveKeccakAddress } from '../../crypto/keccak';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
  const {
    isInitialized,
    isUnlocked,
    createIdentity,
    unlockVault,
    profile,
    verify2FA,
  } = useCrypto();

  const [mode, setMode] = useState<'unlock' | 'register'>(
    isInitialized ? 'unlock' : 'register'
  );
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [needs2FA, setNeeds2FA] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      if (mode === 'register') {
        if (!password || password.length < 6) {
          setError('Heslo k chatovacímu účtu musí mít alespoň 6 znaků.');
          setIsLoading(false);
          return;
        }
        await createIdentity(password, username || 'Anonymní Uživatel');
        onClose();
      } else {
        // Unlock mode
        const success = await unlockVault(password);
        if (!success) {
          setError('Nesprávné heslo k účtu.');
          setIsLoading(false);
          return;
        }

        // If 2FA enabled, verify code
        if (profile?.has2FA) {
          setNeeds2FA(true);
          setIsLoading(false);
          return;
        }

        onClose();
      }
    } catch (err: any) {
      setError(err.message || 'Chyba při přihlašování.');
    } finally {
      setIsLoading(false);
    }
  };

  const handle2FASubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const isOtpValid = await verify2FA(totpCode);
      if (!isOtpValid) {
        setError('Neplatný 2FA kód nebo záchranný kód.');
        setIsLoading(false);
        return;
      }
      onClose();
    } catch (err: any) {
      setError(err.message || 'Chyba při ověření 2FA.');
    } finally {
      setIsLoading(false);
    }
  };

  // Demo Web3 / SIWE Sign In
  const handleSiweLogin = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const tempKey = generateSigningKeyPair();
      const mockAddr = deriveKeccakAddress(tempKey.publicKey);
      const siweData = {
        domain: window.location.host,
        address: mockAddr,
        statement: 'Přihlášení do zabezpečeného KECCAK256 E2EE chatu.',
        uri: window.location.origin,
        version: '1',
        chainId: 1,
        nonce: crypto.randomUUID().slice(0, 8),
        issuedAt: new Date().toISOString(),
      };

      const siweMsg = formatSiweMessage(siweData);
      const sig = signSiweMessage(siweMsg, tempKey.privateKey);

      await createIdentity(`siwe_${sig.signatureHex.slice(0, 32)}`, 'Web3 Uživatel');
      onClose();
    } catch (err: any) {
      setError(err.message || 'Web3 přihlášení selhalo.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md select-none animate-in fade-in">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 space-y-5 text-slate-100">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-cyber-600 to-cyber-400 text-slate-950 flex items-center justify-center mx-auto shadow-lg shadow-cyber-500/20">
            {isUnlocked ? <MessageSquare className="w-6 h-6" /> : <Lock className="w-6 h-6" />}
          </div>
          <h3 className="text-lg font-bold text-slate-100">
            {needs2FA
              ? 'Dvoufaktorové Ověření (2FA)'
              : mode === 'register'
              ? 'Vytvořit Chatovací Účet'
              : 'Přihlášení do Šifrovaného Chatu'}
          </h3>
          <p className="text-xs text-slate-400">
            {needs2FA
              ? 'Zadejte 6místný kód z autentifikační aplikace.'
              : mode === 'register'
              ? 'Zadejte vaše jméno a heslo. Vaše zprávy budou bezpečně zašifrovány přímo ve vašem zařízení.'
              : 'Zadejte své heslo pro otevření a odemknutí zpráv chatu.'}
          </p>
        </div>

        {error && (
          <div className="p-3 bg-red-950/60 border border-red-800/80 rounded-xl text-xs text-red-300 flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        {needs2FA ? (
          <form onSubmit={handle2FASubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                2FA Kód nebo Záložní Kód
              </label>
              <input
                type="text"
                required
                autoFocus
                placeholder="000000 nebo XXXX-XXXX"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-center font-mono tracking-widest text-cyber-300 focus:outline-none focus:border-cyber-500/50"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 px-4 rounded-xl bg-cyber-500 hover:bg-cyber-400 text-slate-950 font-semibold text-xs transition-all shadow-md shadow-cyber-500/20 disabled:opacity-50"
            >
              {isLoading ? 'Ověřování...' : 'Potvrdit 2FA a Otevřít Chat'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Vaše Jméno / Přezdívka v Chatu
                </label>
                <input
                  type="text"
                  placeholder="např. Honza, Alice..."
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyber-500/50"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                {mode === 'register' ? 'Heslo k Účtu' : 'Vaše Heslo k Chatu'}
              </label>
              <input
                type="password"
                required
                placeholder="Zadejte heslo..."
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyber-500/50"
              />
              <div className="mt-1.5 flex items-center space-x-1.5 text-[11px] text-cyber-400 font-mono">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>KECCAK-256 šifrování zpráv</span>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 px-4 rounded-xl bg-cyber-500 hover:bg-cyber-400 text-slate-950 font-semibold text-xs transition-all shadow-md shadow-cyber-500/20 disabled:opacity-50"
            >
              {isLoading
                ? 'Příprava šifrování...'
                : mode === 'register'
                ? 'Vytvořit Účet a Zahájit Chat'
                : 'Odemknout a Otevřít Chat'}
            </button>

            {/* SIWE Web3 Login Button */}
            <div className="pt-2 border-t border-slate-800/80">
              <button
                type="button"
                onClick={handleSiweLogin}
                disabled={isLoading}
                className="w-full py-2 px-3 rounded-xl bg-slate-850 hover:bg-slate-800 border border-slate-700 text-xs text-slate-300 hover:text-cyber-300 font-medium flex items-center justify-center space-x-2 transition-all"
              >
                <Sparkles className="w-4 h-4 text-cyber-400" />
                <span>Bleskové Přihlášení Bez Hesla</span>
              </button>
            </div>

            {/* Mode toggle */}
            <div className="text-center pt-2">
              <button
                type="button"
                onClick={() => {
                  setMode(mode === 'register' ? 'unlock' : 'register');
                  setError(null);
                }}
                className="text-xs text-cyber-400 hover:text-cyber-300 underline font-medium"
              >
                {mode === 'register'
                  ? 'Již máte vytvořený účet? Přihlásit se'
                  : 'Nemáte ještě účet? Zaregistrovat se'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
