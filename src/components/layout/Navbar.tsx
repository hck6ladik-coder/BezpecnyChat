import React from 'react';
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  Lock,
  Unlock,
  Eye,
  Key,
  Globe,
  Sun,
  Moon,
  User,
  Radio,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useCrypto } from '../../context/CryptoContext';
import { useChat } from '../../context/ChatContext';
import { formatKeccakAddress } from '../../crypto/keccak';

interface NavbarProps {
  onOpenAuth: () => void;
  onOpenProfile: () => void;
  onOpenInspector: () => void;
  isInspectorOpen: boolean;
  theme: 'dark' | 'light';
  toggleTheme: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  onOpenAuth,
  onOpenProfile,
  onOpenInspector,
  isInspectorOpen,
  theme,
  toggleTheme,
}) => {
  const { profile, isUnlocked, lockVault, publicBundle } = useCrypto();
  const { isOnline, offlineQueueCount } = useChat();

  return (
    <header className="h-16 bg-slate-900 border-b border-slate-800 px-4 flex items-center justify-between z-30 select-none">
      {/* Brand & Security Status */}
      <div className="flex items-center space-x-3">
        <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-tr from-cyber-600 to-cyber-400 text-slate-950 font-bold shadow-lg shadow-cyber-500/20">
          <Shield className="w-6 h-6 text-slate-950" />
          <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-emerald-500 border-2 border-slate-900 rounded-full" />
        </div>
        <div>
          <div className="flex items-center space-x-2">
            <span className="font-bold text-base tracking-wide bg-gradient-to-r from-slate-100 via-cyber-200 to-cyber-400 bg-clip-text text-transparent">
              KECCAK256 E2EE Chat
            </span>
            <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-cyber-500/10 text-cyber-400 border border-cyber-500/30">
              Signal Protocol + PFS
            </span>
          </div>
          <div className="flex items-center space-x-3 text-xs text-slate-400">
            <span className="flex items-center space-x-1 font-mono text-[11px] text-cyber-300">
              <span className="w-1.5 h-1.5 rounded-full bg-cyber-400 animate-pulse"></span>
              <span>Zero-Metadata Relay</span>
            </span>
            <span className="text-slate-600">•</span>
            {profile?.torRoutingEnabled ? (
              <span className="flex items-center space-x-1 text-purple-400 text-[11px]">
                <Globe className="w-3 h-3" />
                <span>Tor .onion Aktivní</span>
              </span>
            ) : (
              <span className="flex items-center space-x-1 text-slate-400 text-[11px]">
                <Radio className="w-3 h-3" />
                <span>TLS 1.3</span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Center status indicators */}
      <div className="hidden md:flex items-center space-x-3 bg-slate-950/60 border border-slate-800/80 px-3 py-1.5 rounded-lg text-xs font-mono">
        {isOnline ? (
          <div className="flex items-center space-x-1.5 text-emerald-400">
            <Wifi className="w-3.5 h-3.5" />
            <span>Online</span>
          </div>
        ) : (
          <div className="flex items-center space-x-1.5 text-amber-400">
            <WifiOff className="w-3.5 h-3.5" />
            <span>Offline ({offlineQueueCount} ve frontě)</span>
          </div>
        )}
        <span className="text-slate-700">|</span>
        <div className="flex items-center space-x-1 text-slate-300">
          <Key className="w-3.5 h-3.5 text-cyber-400" />
          <span>KDF: PBKDF2 (20k)</span>
        </div>
      </div>

      {/* Right control buttons */}
      <div className="flex items-center space-x-2">
        {/* Crypto Inspector Button */}
        <button
          onClick={onOpenInspector}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
            isInspectorOpen
              ? 'bg-cyber-500/20 text-cyber-300 border-cyber-500/50 shadow-sm shadow-cyber-500/20'
              : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-slate-800 hover:text-cyber-300'
          }`}
          title="Otevřít Kryptografický Inspektor & Audit"
        >
          <Eye className="w-4 h-4 text-cyber-400" />
          <span className="hidden sm:inline">Krypto Inspektor</span>
        </button>

        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          className="p-2 rounded-lg bg-slate-800/80 text-slate-300 hover:text-cyber-300 border border-slate-700 hover:bg-slate-800 transition-colors"
          title={theme === 'dark' ? 'Světlý režim' : 'Tmavý režim'}
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        {/* User Profile / Auth Button */}
        {profile && isUnlocked ? (
          <div className="flex items-center space-x-2">
            <button
              onClick={onOpenProfile}
              className="flex items-center space-x-2 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 border border-slate-700 text-xs transition-all"
            >
              <img
                src={profile.avatar}
                alt={profile.username}
                className="w-6 h-6 rounded-full bg-slate-700 border border-cyber-500/40"
              />
              <span className="font-semibold text-slate-200 hidden sm:inline max-w-[140px] truncate">
                {profile.displayPhone ? `📱 ${profile.displayPhone}` : (profile.username || 'Uživatel')}
              </span>
              <span className="text-[10px] font-mono text-cyber-300 bg-cyber-500/10 px-1.5 py-0.5 rounded-md border border-cyber-500/30">
                {formatKeccakAddress(profile.address)}
              </span>
            </button>

            <button
              onClick={lockVault}
              className="p-2 rounded-lg bg-red-950/40 text-red-400 border border-red-900/40 hover:bg-red-900/40 transition-colors"
              title="Zamknout trezor (Vymazat klíče z RAM)"
            >
              <Lock className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button
            onClick={onOpenAuth}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-cyber-500 hover:bg-cyber-400 text-slate-950 font-semibold text-xs transition-all shadow-md shadow-cyber-500/20"
          >
            <Unlock className="w-4 h-4" />
            <span>Odemknout Trezor</span>
          </button>
        )}
      </div>
    </header>
  );
};
