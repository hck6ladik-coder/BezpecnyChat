import React, { useState, useEffect } from 'react';
import {
  Lock,
  Unlock,
  Key,
  ShieldCheck,
  AlertTriangle,
  Sparkles,
  UserPlus,
  CheckCircle2,
  XCircle,
  Loader2,
  LogIn,
  Phone,
  Smartphone,
  MessageSquare,
  KeyRound,
  Check,
} from 'lucide-react';
import { useCrypto } from '../../context/CryptoContext';
import { formatSiweMessage, signSiweMessage } from '../../crypto/auth';
import { generateSigningKeyPair } from '../../crypto/x3dh';
import { deriveKeccakAddress } from '../../crypto/keccak';
import {
  normalizePhoneNumber,
  formatPhoneDisplay,
  isPhoneNumber,
  generateSmsCode,
} from '../../crypto/phone';

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
    unlockWithSmsOtp,
    changePassword,
    resetAccount,
    resetAllLocalData,
    profile,
    verify2FA,
    savedUsername,
    savedAccounts,
    checkNicknameAvailable,
  } = useCrypto();

  // Active tab: 'login' | 'register'
  const [activeTab, setActiveTab] = useState<'login' | 'register'>('login');

  // Country prefix (default +420)
  const [countryPrefix, setCountryPrefix] = useState('+420');

  // Login form state
  const [loginPhoneInput, setLoginPhoneInput] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [rememberLogin, setRememberLogin] = useState(() => {
    return localStorage.getItem('keccak_remember_login') !== 'false';
  });
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // SMS OTP state
  const [simulatedSmsCode, setSimulatedSmsCode] = useState<string | null>(null);
  const [enteredSmsCode, setEnteredSmsCode] = useState('');
  const [isSmsMode, setIsSmsMode] = useState(false);
  const [isSmsSending, setIsSmsSending] = useState(false);
  const [smsSuccessMsg, setSmsSuccessMsg] = useState<string | null>(null);

  // Change password modal state
  const [isResetPasswordModalOpen, setIsResetPasswordModalOpen] = useState(false);
  const [newResetPassword, setNewResetPassword] = useState('');
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [resetPasswordError, setResetPasswordError] = useState<string | null>(null);

  // Registration form state (+420 prefilled)
  const [regCountryPrefix, setRegCountryPrefix] = useState('+420');
  const [regPhoneInput, setRegPhoneInput] = useState('');
  const [regDisplayName, setRegDisplayName] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regRemember, setRegRemember] = useState(true);
  const [isRegistering, setIsRegistering] = useState(false);
  const [regError, setRegError] = useState<string | null>(null);
  const [phoneStatus, setPhoneStatus] = useState<{
    checking: boolean;
    available?: boolean;
    message?: string;
  }>({ checking: false });

  // 2FA state
  const [totpCode, setTotpCode] = useState('');
  const [needs2FA, setNeeds2FA] = useState(false);
  const [is2FALoading, setIs2FALoading] = useState(false);
  const [twoFAError, setTwoFAError] = useState<string | null>(null);

  // Helper to format 9 digits nicely: 777 123 456
  const formatRawDigits = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 9);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)} ${digits.slice(3)}`;
    return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 9)}`;
  };

  // Sync saved account into login on mount
  useEffect(() => {
    if (savedAccounts && savedAccounts.length > 0 && !loginPhoneInput) {
      const lastAcc = savedAccounts[0];
      if (lastAcc.phoneNumber) {
        const cleanDigits = lastAcc.phoneNumber.replace(/^\+420/, '').replace(/\D/g, '');
        setLoginPhoneInput(formatRawDigits(cleanDigits));
      } else if (lastAcc.username) {
        setLoginPhoneInput(lastAcc.username);
      }
    }
  }, [savedAccounts]);

  // Real-time phone check on registration
  useEffect(() => {
    const rawClean = regPhoneInput.replace(/\D/g, '');
    if (!rawClean) {
      setPhoneStatus({ checking: false });
      return;
    }

    if (rawClean.length < 9) {
      setPhoneStatus({
        checking: false,
        available: false,
        message: `Zadejte 9 číslic telefonního čísla (zbývá ${9 - rawClean.length}).`,
      });
      return;
    }

    const fullPhone = `${regCountryPrefix}${rawClean}`;
    setPhoneStatus({ checking: true });

    const timer = setTimeout(async () => {
      try {
        const res = await checkNicknameAvailable(fullPhone);
        if (res.available) {
          setPhoneStatus({
            checking: false,
            available: true,
            message: `Telefonní číslo ${formatPhoneDisplay(fullPhone)} je volné!`,
          });
        } else {
          setPhoneStatus({
            checking: false,
            available: false,
            message: res.reason || 'Toto číslo je již obsazené.',
          });
        }
      } catch (err: any) {
        setPhoneStatus({
          checking: false,
          available: false,
          message: err.message || 'Chyba při ověřování čísla.',
        });
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [regPhoneInput, regCountryPrefix]);

  if (!isOpen) return null;

  // Build full login identifier
  const getFullLoginPhone = () => {
    const raw = loginPhoneInput.trim();
    if (!raw) return '';
    if (raw.startsWith('+') || raw.startsWith('@')) return raw;
    const digits = raw.replace(/\D/g, '');
    if (digits.length >= 7) {
      return `${countryPrefix}${digits}`;
    }
    return raw;
  };

  // Build full reg phone
  const getFullRegPhone = () => {
    const raw = regPhoneInput.replace(/\D/g, '');
    if (!raw) return '';
    return `${regCountryPrefix}${raw}`;
  };

  // Handle Login with Password
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);

    const fullIdentifier = getFullLoginPhone();
    if (!fullIdentifier) {
      setLoginError('Zadejte prosím vaše telefonní číslo (např. 777 123 456).');
      return;
    }

    if (!loginPassword) {
      setLoginError('Zadejte prosím heslo k účtu nebo zvolte SMS přihlášení.');
      return;
    }

    setIsLoggingIn(true);

    try {
      const success = await unlockVault(loginPassword, fullIdentifier, rememberLogin);
      if (!success) {
        setLoginError(
          `Nesprávné heslo pro ${formatPhoneDisplay(fullIdentifier)}. Můžete kliknout na SMS přihlášení nebo nastavit nové heslo níže.`
        );
        setIsLoggingIn(false);
        return;
      }

      if (profile?.has2FA) {
        setNeeds2FA(true);
        setIsLoggingIn(false);
        return;
      }

      setLoginPassword('');
      setLoginError(null);
      onClose();
    } catch (err: any) {
      setLoginError(err.message || 'Chyba při přihlašování.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Handle Trigger SMS Quick Login
  const handleRequestSmsLogin = async () => {
    setLoginError(null);
    const fullIdentifier = getFullLoginPhone();
    if (!fullIdentifier) {
      setLoginError('Zadejte prosím vaše telefonní číslo (např. 777 123 456) pro odeslání SMS kódu.');
      return;
    }

    setIsSmsSending(true);
    const code = generateSmsCode();
    setSimulatedSmsCode(code);
    setIsSmsMode(true);
    setEnteredSmsCode(code); // Pre-fill for instantaneous convenience
    setSmsSuccessMsg(`Ověřovací SMS kód byla odeslána na ${formatPhoneDisplay(fullIdentifier)}`);
    setIsSmsSending(false);
  };

  // Handle Confirm SMS OTP Login
  const handleConfirmSmsLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLoginError(null);

    const fullIdentifier = getFullLoginPhone();
    if (!enteredSmsCode || enteredSmsCode.trim() !== simulatedSmsCode) {
      setLoginError('Zadaný SMS kód není správný. Zkontrolujte prosím kód.');
      return;
    }

    setIsLoggingIn(true);
    try {
      const success = await unlockWithSmsOtp(fullIdentifier, rememberLogin);
      if (success) {
        setSimulatedSmsCode(null);
        setIsSmsMode(false);
        onClose();
      } else {
        setLoginError('Nepodařilo se přihlásit pomocí SMS kódu.');
      }
    } catch (err: any) {
      setLoginError(err.message || 'Chyba při SMS přihlášení.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Handle Registration
  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegError(null);

    const fullPhone = getFullRegPhone();
    const cleanDigits = regPhoneInput.replace(/\D/g, '');

    if (!cleanDigits || cleanDigits.length < 9) {
      setRegError('Zadejte prosím platné 9místné telefonní číslo (např. 777 123 456).');
      return;
    }

    if (!regPassword || regPassword.length < 6) {
      setRegError('Heslo k účtu musí mít alespoň 6 znaků.');
      return;
    }

    const dispName = regDisplayName.trim() || formatPhoneDisplay(fullPhone);

    setIsRegistering(true);

    try {
      const check = await checkNicknameAvailable(fullPhone);
      if (!check.available) {
        setRegError(check.reason || `Telefonní číslo ${formatPhoneDisplay(fullPhone)} je již obsazené!`);
        setIsRegistering(false);
        return;
      }

      await createIdentity(regPassword, dispName, regRemember, fullPhone);
      setRegPassword('');
      setRegPhoneInput('');
      setRegDisplayName('');
      setRegError(null);
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

      await createIdentity(`siwe_${sig.signatureHex.slice(0, 32)}`, 'Web3 Uživatel', true);
      onClose();
    } catch (err: any) {
      setLoginError(err.message || 'Web3 přihlášení selhalo.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md select-none animate-in fade-in">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl p-6 sm:p-7 space-y-5 text-slate-100 max-h-[95vh] overflow-y-auto">
        {/* App Branding Header */}
        <div className="text-center space-y-1.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-cyber-600 to-cyber-400 text-slate-950 flex items-center justify-center mx-auto shadow-lg shadow-cyber-500/25">
            <Smartphone className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold tracking-tight text-slate-100">
            Bezpečný Chat
          </h2>
          <p className="text-xs text-slate-400">
            Telefonní přihlášení s KECCAK-256 E2EE šifrováním
          </p>
        </div>

        {/* Tab switcher: Přihlášení vs Registrace */}
        <div className="flex rounded-xl bg-slate-950 p-1 border border-slate-800">
          <button
            type="button"
            onClick={() => {
              setActiveTab('login');
              setLoginError(null);
            }}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center space-x-1.5 ${
              activeTab === 'login'
                ? 'bg-cyber-500 text-slate-950 shadow-md shadow-cyber-500/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>Přihlášení</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('register');
              setRegError(null);
            }}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center space-x-1.5 ${
              activeTab === 'register'
                ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Registrace nového čísla</span>
          </button>
        </div>

        {/* Simulated Incoming SMS Banner */}
        {simulatedSmsCode && (
          <div className="p-3.5 bg-gradient-to-r from-cyber-950 to-slate-900 border border-cyber-500/50 rounded-2xl shadow-lg space-y-2 animate-in slide-in-from-top-2 duration-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-cyber-400">
                <MessageSquare className="w-4 h-4" />
                <span className="text-xs font-bold uppercase tracking-wider">
                  Příchozí SMS zpráva
                </span>
              </div>
              <span className="text-[10px] bg-cyber-500/20 text-cyber-300 px-2 py-0.5 rounded-full font-mono">
                Právě teď
              </span>
            </div>
            <p className="text-xs text-slate-200">
              Váš ověřovací SMS kód pro KECCAK Chat je:{' '}
              <span className="font-mono font-bold text-cyber-300 text-sm tracking-wider">
                {simulatedSmsCode}
              </span>
            </p>
            <div className="flex items-center space-x-2 pt-1">
              <button
                type="button"
                onClick={() => handleConfirmSmsLogin()}
                className="py-1.5 px-3 bg-cyber-500 hover:bg-cyber-400 text-slate-950 font-bold text-xs rounded-xl transition-all shadow-sm flex items-center space-x-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Bleskově potvrdit a přihlásit</span>
              </button>
              <button
                type="button"
                onClick={() => setSimulatedSmsCode(null)}
                className="py-1.5 px-2.5 text-[11px] text-slate-400 hover:text-slate-200"
              >
                Zavřít
              </button>
            </div>
          </div>
        )}

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
        ) : activeTab === 'login' ? (
          /* ======================================================== */
          /* 1. TAB: PŘIHLÁŠENÍ (TELEFONNÍ ČÍSLO S PŘEDVYPLNĚNÝM +420) */
          /* ======================================================== */
          <div className="space-y-4">
            <div className="p-4 sm:p-5 bg-slate-950/70 border border-slate-800/90 rounded-2xl space-y-3.5 shadow-inner">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="p-1.5 rounded-lg bg-cyber-500/10 text-cyber-400 border border-cyber-500/20">
                    <Phone className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                      Přihlášení telefonním číslem
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Předvolba +420 je předvyplněna
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
                <div className="p-3 bg-red-950/70 border border-red-800/80 rounded-xl text-xs text-red-300 space-y-2">
                  <div className="flex items-center space-x-2">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0 text-red-400" />
                    <span>{loginError}</span>
                  </div>
                  <div className="pt-1 border-t border-red-900/50 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => {
                        setIsResetPasswordModalOpen(true);
                        setResetPasswordError(null);
                        setNewResetPassword('');
                      }}
                      className="text-[11px] text-cyber-400 hover:text-cyber-300 font-semibold underline transition-colors"
                    >
                      🔑 Nastavit nové heslo
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        const target = getFullLoginPhone();
                        if (window.confirm(`Opravdu chcete vyresetovat data pro ${target}?`)) {
                          await resetAccount(target);
                          setLoginPhoneInput('');
                          setLoginPassword('');
                          setLoginError(null);
                        }
                      }}
                      className="text-[10px] text-red-400 hover:text-red-300 underline"
                    >
                      Resetovat účet
                    </button>
                  </div>
                </div>
              )}

              {/* POPUP: Change / Reset Password */}
              {isResetPasswordModalOpen && (
                <div className="p-3.5 bg-slate-900 border border-cyber-500/40 rounded-xl space-y-3 shadow-lg animate-in fade-in zoom-in-95 duration-150">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Key className="w-4 h-4 text-cyber-400" />
                      <span className="text-xs font-bold text-slate-100">
                        Nastavení nového hesla pro {getFullLoginPhone() || 'účet'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsResetPasswordModalOpen(false)}
                      className="text-slate-400 hover:text-slate-200 text-xs p-1"
                    >
                      ✕
                    </button>
                  </div>

                  {resetPasswordError && (
                    <div className="p-2 bg-red-950/60 border border-red-800 rounded-lg text-[11px] text-red-300">
                      {resetPasswordError}
                    </div>
                  )}

                  <div className="space-y-2">
                    <input
                      type="password"
                      placeholder="Zadejte nové heslo (min. 6 znaků)..."
                      value={newResetPassword}
                      onChange={(e) => setNewResetPassword(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyber-500"
                    />
                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        disabled={isResettingPassword || !newResetPassword || newResetPassword.length < 6}
                        onClick={async () => {
                          const target = getFullLoginPhone();
                          if (!target) {
                            setResetPasswordError('Zadejte prosím telefonní číslo nebo přezdívku.');
                            return;
                          }
                          setIsResettingPassword(true);
                          setResetPasswordError(null);
                          try {
                            await changePassword(target, newResetPassword);
                            setNewResetPassword('');
                            setIsResetPasswordModalOpen(false);
                            setLoginError(null);
                            onClose();
                          } catch (err: any) {
                            setResetPasswordError(err.message || 'Chyba při změně hesla.');
                          } finally {
                            setIsResettingPassword(false);
                          }
                        }}
                        className="flex-1 py-2 px-3 bg-cyber-500 hover:bg-cyber-400 text-slate-950 font-bold text-xs rounded-lg transition-all disabled:opacity-50 flex items-center justify-center space-x-1.5"
                      >
                        {isResettingPassword ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Ukládám heslo...</span>
                          </>
                        ) : (
                          <span>Uložit nové heslo a přihlásit se</span>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsResetPasswordModalOpen(false)}
                        className="py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg transition-all"
                      >
                        Zrušit
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <form onSubmit={handleLoginSubmit} className="space-y-3 pt-1">
                {/* Phone Number Input with +420 Prefilled */}
                <div>
                  <label className="block text-[11px] font-medium text-slate-300 mb-1">
                    Telefonní číslo (přihlašovací jméno)
                  </label>
                  <div className="flex items-center space-x-2">
                    {/* Country prefix badge */}
                    <div className="flex items-center space-x-1 px-3 py-2.5 bg-slate-900 border border-slate-700/80 rounded-xl text-xs font-semibold text-cyber-300 select-none shadow-sm flex-shrink-0">
                      <span>🇨🇿</span>
                      <span>{countryPrefix}</span>
                    </div>

                    {/* 9-digit input */}
                    <div className="relative flex-1">
                      <input
                        type="text"
                        placeholder="777 123 456"
                        value={loginPhoneInput}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val.startsWith('+') || val.startsWith('@')) {
                            setLoginPhoneInput(val);
                          } else {
                            setLoginPhoneInput(formatRawDigits(val));
                          }
                          setLoginError(null);
                        }}
                        className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700/80 rounded-xl text-xs text-slate-100 placeholder-slate-500 font-mono tracking-wider focus:outline-none focus:border-cyber-500/60 focus:ring-1 focus:ring-cyber-500/30 transition-all"
                      />
                    </div>
                  </div>

                  {/* Quick select from saved accounts */}
                  {savedAccounts && savedAccounts.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap mt-2">
                      <span className="text-[10px] text-slate-500">Účty v paměti:</span>
                      {savedAccounts.map((acc) => {
                        const label = acc.displayPhone || acc.phoneNumber || `@${acc.username}`;
                        return (
                          <button
                            key={acc.address + acc.username}
                            type="button"
                            onClick={() => {
                              if (acc.phoneNumber) {
                                const digits = acc.phoneNumber.replace(/^\+420/, '').replace(/\D/g, '');
                                setLoginPhoneInput(formatRawDigits(digits));
                              } else {
                                setLoginPhoneInput(acc.username);
                              }
                              setLoginPassword('');
                              setLoginError(null);
                            }}
                            className="text-[10px] px-2 py-0.5 rounded-md border bg-slate-850 text-slate-400 border-slate-700 hover:text-cyber-300 hover:border-cyber-500/40 transition-all flex items-center space-x-1"
                          >
                            <span>📱</span>
                            <span>{label}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Password Input */}
                <div>
                  <label className="block text-[11px] font-medium text-slate-300 mb-1">
                    Heslo k účtu
                  </label>
                  <input
                    type="password"
                    placeholder="Zadejte vaše heslo..."
                    value={loginPassword}
                    onChange={(e) => {
                      setLoginPassword(e.target.value);
                      setLoginError(null);
                    }}
                    className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700/80 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyber-500/60 focus:ring-1 focus:ring-cyber-500/30 transition-all"
                  />
                </div>

                {/* Remember Me Checkbox & Reset Link */}
                <div className="flex items-center justify-between pt-0.5">
                  <label className="flex items-center space-x-2 text-xs text-slate-300 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={rememberLogin}
                      onChange={(e) => setRememberLogin(e.target.checked)}
                      className="w-4 h-4 rounded bg-slate-900 border-slate-700 text-cyber-500 focus:ring-cyber-500/30 accent-cyber-500 cursor-pointer"
                    />
                    <span className="text-[11px] text-slate-300">
                      Uložit přihlášení (Pamatovat si mě)
                    </span>
                  </label>

                  <button
                    type="button"
                    onClick={() => {
                      setIsResetPasswordModalOpen(true);
                      setResetPasswordError(null);
                      setNewResetPassword('');
                    }}
                    className="text-[11px] text-cyber-400 hover:text-cyber-300 underline transition-colors"
                  >
                    Zapomněli jste heslo?
                  </button>
                </div>

                {/* Action Buttons: Password Login + SMS Fast Login */}
                <div className="space-y-2 pt-1">
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
                        <span>Přihlásit se heslem</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleRequestSmsLogin}
                    disabled={isSmsSending || isLoggingIn}
                    className="w-full py-2 px-3 rounded-xl bg-slate-850 hover:bg-slate-800 border border-cyber-500/30 hover:border-cyber-500/60 text-xs text-cyber-300 hover:text-cyber-200 font-semibold flex items-center justify-center space-x-2 transition-all"
                  >
                    <Smartphone className="w-3.5 h-3.5 text-cyber-400" />
                    <span>📱 Přihlásit se pomocí SMS kódu (Bez hesla)</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : (
          /* ======================================================== */
          /* 2. TAB: REGISTRACE (+420 PŘEDVYPLNĚNO + KONTROLA DUPLICIT)*/
          /* ======================================================== */
          <div className="p-4 sm:p-5 bg-slate-950/70 border border-slate-800/90 rounded-2xl space-y-3.5 shadow-inner">
            <div className="flex items-center space-x-2">
              <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <UserPlus className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                  Registrace telefonního čísla
                </h3>
                <p className="text-[11px] text-slate-400">
                  Zadejte své telefonní číslo (+420) a heslo
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
              {/* Phone number input with +420 prefilled */}
              <div>
                <label className="block text-[11px] font-medium text-slate-300 mb-1">
                  Telefonní číslo (předvyplněno +420)
                </label>
                <div className="flex items-center space-x-2">
                  {/* Country Prefix Box */}
                  <div className="flex items-center space-x-1 px-3 py-2.5 bg-slate-900 border border-slate-700/80 rounded-xl text-xs font-semibold text-emerald-400 select-none shadow-sm flex-shrink-0">
                    <span>🇨🇿</span>
                    <span>{regCountryPrefix}</span>
                  </div>

                  {/* Phone input */}
                  <div className="relative flex-1">
                    <input
                      type="text"
                      placeholder="777 123 456"
                      value={regPhoneInput}
                      onChange={(e) => setRegPhoneInput(formatRawDigits(e.target.value))}
                      className="w-full pl-3.5 pr-8 py-2.5 bg-slate-900 border border-slate-700/80 rounded-xl text-xs text-slate-100 placeholder-slate-500 font-mono tracking-wider focus:outline-none focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/30 transition-all"
                    />
                    <div className="absolute right-3 top-2.5">
                      {phoneStatus.checking ? (
                        <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                      ) : phoneStatus.available === true ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      ) : phoneStatus.available === false ? (
                        <XCircle className="w-4 h-4 text-red-400" />
                      ) : null}
                    </div>
                  </div>
                </div>

                {/* Status text */}
                {phoneStatus.message && (
                  <p
                    className={`text-[10px] mt-1 font-medium flex items-center space-x-1 ${
                      phoneStatus.available ? 'text-emerald-400' : 'text-red-400'
                    }`}
                  >
                    <span>{phoneStatus.message}</span>
                  </p>
                )}
              </div>

              {/* Optional Display Name */}
              <div>
                <label className="block text-[11px] font-medium text-slate-300 mb-1">
                  Vaše Jméno / Přezdívka v chatu (volitelné)
                </label>
                <input
                  type="text"
                  placeholder="např. Láďa, Honza, David..."
                  value={regDisplayName}
                  onChange={(e) => setRegDisplayName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700/80 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/30 transition-all"
                />
              </div>

              {/* Password input */}
              <div>
                <label className="block text-[11px] font-medium text-slate-300 mb-1">
                  Heslo pro nový účet (min. 6 znaků)
                </label>
                <input
                  type="password"
                  placeholder="Zadejte bezpečné heslo..."
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700/80 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/30 transition-all"
                />
                <div className="mt-1 flex items-center space-x-1.5 text-[10px] text-cyber-400 font-mono">
                  <ShieldCheck className="w-3 h-3" />
                  <span>Automatické vytvoření KECCAK-256 E2EE klíčů pro toto číslo</span>
                </div>
              </div>

              {/* Remember Me for Registration */}
              <div className="flex items-center justify-between pt-0.5">
                <label className="flex items-center space-x-2 text-xs text-slate-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={regRemember}
                    onChange={(e) => setRegRemember(e.target.checked)}
                    className="w-4 h-4 rounded bg-slate-900 border-slate-700 text-emerald-500 focus:ring-emerald-500/30 accent-emerald-500 cursor-pointer"
                  />
                  <span className="text-[11px] text-slate-300">
                    Uložit přihlášení (Pamatovat si mě)
                  </span>
                </label>
              </div>

              <button
                type="submit"
                disabled={isRegistering || phoneStatus.available === false}
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
        )}

        {/* Fast Web3 / Anonym Option */}
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

        {/* Clear All Local Data Link */}
        <div className="pt-1 flex justify-center">
          <button
            type="button"
            onClick={async () => {
              if (
                window.confirm(
                  'Opravdu chcete vymazat veškerá lokální data aplikace na tomto zařízení a začít od začátku?'
                )
              ) {
                await resetAllLocalData();
                setLoginPhoneInput('');
                setLoginPassword('');
                setRegPhoneInput('');
                setRegPassword('');
                setLoginError(null);
                setRegError(null);
              }
            }}
            className="text-[10px] text-slate-500 hover:text-red-400 underline transition-colors"
          >
            Vymazat paměť zařízení (Začít úplně znovu)
          </button>
        </div>
      </div>
    </div>
  );
};

