import React, { useState, useEffect } from 'react';
import {
  Lock,
  Unlock,
  Key,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Sparkles,
  User,
  UserPlus,
  CheckCircle2,
  XCircle,
  Loader2,
  LogIn,
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
    savedUsername,
    checkNicknameAvailable,
  } = useCrypto();

  // Login form state
  const [loginPassword, setLoginPassword] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Registration form state
  const [regUsername, setRegUsername] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [regError, setRegError] = useState<string | null>(null);
  const [nickStatus, setNickStatus] = useState<{
    checking: boolean;
    available?: boolean;
    message?: string;
  }>({ checking: false });

  // 2FA state
  const [totpCode, setTotpCode] = useState('');
  const [needs2FA, setNeeds2FA] = useState(false);
  const [is2FALoading, setIs2FALoading] = useState(false);
  const [twoFAError, setTwoFAError] = useState<string | null>(null);

  // Debounced real-time nickname uniqueness check
  useEffect(() => {
    const trimmed = regUsername.trim();
    if (!trimmed) {
      setNickStatus({ checking: false });
      return;
    }

    if (trimmed.length < 2) {
      setNickStatus({
        checking: false,
        available: false,
        message: 'Přezdívka musí mít alespoň 2 znaky.',
      });
      return;
    }

    setNickStatus({ checking: true });
    const timer = setTimeout(async () => {
      try {
        const res = await checkNicknameAvailable(trimmed);
        if (res.available) {
          setNickStatus({
            checking: false,
            available: true,
            message: 'Přezdívka je volná!',
          });
        } else {
          setNickStatus({
            checking: false,
            available: false,
            message: res.reason || 'Tato přezdívka je již obsazená.',
          });
        }
      } catch (err: any) {
        setNickStatus({
          checking: false,
          available: false,
          message: err.message || 'Chyba při ověřování přezdívky.',
        });
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [regUsername]);

  if (!isOpen) return null;

  // Handle Login / Unlock
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setIsLoggingIn(true);

    try {
      if (!loginPassword) {
        setLoginError('Zadejte prosím heslo.');
        setIsLoggingIn(false);
        return;
      }

      const success = await unlockVault(loginPassword);
      if (!success) {
        setLoginError('Nesprávné heslo nebo účet nebyl nalezen.');
        setIsLoggingIn(false);
        return;
      }

      if (profile?.has2FA) {
        setNeeds2FA(true);
        setIsLoggingIn(false);
        return;
      }

      onClose();
    } catch (err: any) {
      setLoginError(err.message || 'Chyba při přihlašování.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Handle Registration
  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegError(null);
    setIsRegistering(true);

    try {
      const trimmedNick = regUsername.trim();
      if (!trimmedNick) {
        setRegError('Zadejte prosím požadovanou přezdívku.');
        setIsRegistering(false);
        return;
      }

      if (!regPassword || regPassword.length < 6) {
        setRegError('Heslo k účtu musí mít alespoň 6 znaků.');
        setIsRegistering(false);
        return;
      }

      const check = await checkNicknameAvailable(trimmedNick);
      if (!check.available) {
        setRegError(check.reason || `Přezdívka "${trimmedNick}" je již obsazená!`);
        setIsRegistering(false);
        return;
      }

      await createIdentity(regPassword, trimmedNick);
      onClose();
    } catch (err: any) {
      setRegError(err.message || 'Chyba při registraci.');
    } finally {
      setIsRegistering(false);
    }
  };

  // Handle 2FA
  const handle2FASubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTwoFAError(null);
    setIs2FALoading(true);

    try {
      const isOtpValid = await verify2FA(totpCode);
      if (!isOtpValid) {
        setTwoFAError('Neplatný 2FA kód nebo záchranný kód.');
        setIs2FALoading(false);
        return;
      }
      onClose();
    } catch (err: any) {
      setTwoFAError(err.message || 'Chyba při ověření 2FA.');
    } finally {
      setIs2FALoading(false);
    }
  };

  // Web3 Demo Login
  const handleSiweLogin = async () => {
    setLoginError(null);
    setIsLoggingIn(true);
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
      setLoginError(err.message || 'Web3 přihlášení selhalo.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md select-none animate-in fade-in">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl p-6 sm:p-7 space-y-6 text-slate-100 max-h-[95vh] overflow-y-auto">
        {/* App Branding Header */}
        <div className="text-center space-y-1.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-cyber-600 to-cyber-400 text-slate-950 flex items-center justify-center mx-auto shadow-lg shadow-cyber-500/25">
            <Lock className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold tracking-tight text-slate-100">
            Bezpečný Chat
          </h2>
          <p className="text-xs text-slate-400">
            Šifrovaná P2P komunikace s KECCAK-256 a Double Ratchet protokolem
          </p>
        </div>

        {needs2FA ? (
          /* 2FA Verification Form */
          <form onSubmit={handle2FASubmit} className="space-y-4">
            <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-2xl space-y-3">
              <h3 className="text-sm font-semibold text-slate-200 text-center">
                Dvoufaktorové Ověření (2FA)
              </h3>
              <p className="text-xs text-slate-400 text-center">
                Zadejte 6místný kód z autentifikační aplikace.
              </p>
              {twoFAError && (
                <div className="p-2.5 bg-red-950/60 border border-red-800/80 rounded-xl text-xs text-red-300 flex items-center space-x-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 text-red-400" />
                  <span>{twoFAError}</span>
                </div>
              )}
              <input
                type="text"
                required
                autoFocus
                placeholder="000000"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-sm text-center font-mono tracking-widest text-cyber-300 focus:outline-none focus:border-cyber-500/50"
              />
              <button
                type="submit"
                disabled={is2FALoading}
                className="w-full py-2.5 px-4 rounded-xl bg-cyber-500 hover:bg-cyber-400 text-slate-950 font-semibold text-xs transition-all shadow-md shadow-cyber-500/20 disabled:opacity-50"
              >
                {is2FALoading ? 'Ověřování...' : 'Potvrdit 2FA a Vstoupit'}
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-6">
            {/* ======================================================== */}
            {/* 1. PRIMÁRNÍ SEKCE: PŘIHLÁŠENÍ DO EXISTUJÍCÍHO ÚČTU       */}
            {/* ======================================================== */}
            <div className="p-4 sm:p-5 bg-slate-950/70 border border-slate-800/90 rounded-2xl space-y-3 shadow-inner">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="p-1.5 rounded-lg bg-cyber-500/10 text-cyber-400 border border-cyber-500/20">
                    <LogIn className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                      Přihlášení do účtu
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      {savedUsername
                        ? `Uložený profil: @${savedUsername}`
                        : 'Odemkněte svůj zašifrovaný trezor'}
                    </p>
                  </div>
                </div>
                {isInitialized && (
                  <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-medium">
                    Trezor připraven
                  </span>
                )}
              </div>

              {loginError && (
                <div className="p-2.5 bg-red-950/60 border border-red-800/80 rounded-xl text-xs text-red-300 flex items-center space-x-2">
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 text-red-400" />
                  <span>{loginError}</span>
                </div>
              )}

              <form onSubmit={handleLoginSubmit} className="space-y-3 pt-1">
                <div>
                  <input
                    type="password"
                    placeholder="Zadejte heslo k vašemu účtu..."
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700/80 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyber-500/60 focus:ring-1 focus:ring-cyber-500/30 transition-all"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isLoggingIn}
                  className="w-full py-2.5 px-4 rounded-xl bg-cyber-500 hover:bg-cyber-400 text-slate-950 font-bold text-xs flex items-center justify-center space-x-2 transition-all shadow-md shadow-cyber-500/20 disabled:opacity-50"
                >
                  {isLoggingIn ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Ověřování a odemykání...</span>
                    </>
                  ) : (
                    <>
                      <Unlock className="w-3.5 h-3.5" />
                      <span>Přihlásit se a Otevřít Chat</span>
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* DIVIDER */}
            <div className="relative flex items-center justify-center">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-800"></div>
              </div>
              <div className="relative px-3 bg-slate-900 text-[11px] font-medium text-slate-500 uppercase tracking-wider">
                Nebo vytvořit nový účet
              </div>
            </div>

            {/* ======================================================== */}
            {/* 2. REGISTRACE NOVÉHO ÚČTU (S KONTROLOU DUPLICITNÍCH NICKŮ) */}
            {/* ======================================================== */}
            <div className="p-4 sm:p-5 bg-slate-950/40 border border-slate-800/80 rounded-2xl space-y-3">
              <div className="flex items-center space-x-2">
                <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <UserPlus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                    Registrace nového účtu
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Zvolte unikátní přezdívku a heslo (nesmí existovat 2 stejné)
                  </p>
                </div>
              </div>

              {regError && (
                <div className="p-2.5 bg-red-950/60 border border-red-800/80 rounded-xl text-xs text-red-300 flex items-center space-x-2">
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 text-red-400" />
                  <span>{regError}</span>
                </div>
              )}

              <form onSubmit={handleRegisterSubmit} className="space-y-3 pt-1">
                {/* Nickname input with real-time uniqueness status */}
                <div>
                  <label className="block text-[11px] font-medium text-slate-300 mb-1">
                    Požadovaná Přezdívka (Nickname)
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="např. Honza, David, Alice..."
                      value={regUsername}
                      onChange={(e) => setRegUsername(e.target.value)}
                      className="w-full pl-3.5 pr-8 py-2.5 bg-slate-900 border border-slate-700/80 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/30 transition-all"
                    />
                    <div className="absolute right-3 top-2.5">
                      {nickStatus.checking ? (
                        <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                      ) : nickStatus.available === true ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      ) : nickStatus.available === false ? (
                        <XCircle className="w-4 h-4 text-red-400" />
                      ) : null}
                    </div>
                  </div>

                  {/* Nickname availability text */}
                  {nickStatus.message && (
                    <p
                      className={`text-[10px] mt-1 font-medium flex items-center space-x-1 ${
                        nickStatus.available ? 'text-emerald-400' : 'text-red-400'
                      }`}
                    >
                      <span>{nickStatus.message}</span>
                    </p>
                  )}
                </div>

                {/* Password input */}
                <div>
                  <label className="block text-[11px] font-medium text-slate-300 mb-1">
                    Heslo pro nový účet (min. 6 znaků)
                  </label>
                  <input
                    type="password"
                    placeholder="Zadejte silné heslo..."
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700/80 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/30 transition-all"
                  />
                  <div className="mt-1 flex items-center space-x-1.5 text-[10px] text-cyber-400 font-mono">
                    <ShieldCheck className="w-3 h-3" />
                    <span>Automatické vytvoření KECCAK-256 E2EE klíčů</span>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isRegistering || nickStatus.available === false}
                  className="w-full py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center space-x-2 transition-all shadow-md shadow-emerald-500/20 disabled:opacity-50"
                >
                  {isRegistering ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Vytváření E2EE účtu...</span>
                    </>
                  ) : (
                    <>
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>Zaregistrovat Nový Účet</span>
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* Fast SIWE / Web3 Option */}
            <div className="pt-1">
              <button
                type="button"
                onClick={handleSiweLogin}
                disabled={isLoggingIn || isRegistering}
                className="w-full py-2 px-3 rounded-xl bg-slate-850 hover:bg-slate-800 border border-slate-700 text-xs text-slate-400 hover:text-cyber-300 font-medium flex items-center justify-center space-x-2 transition-all"
              >
                <Sparkles className="w-3.5 h-3.5 text-cyber-400" />
                <span>Bleskový anonymní účet (Jednorázový přístup)</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

