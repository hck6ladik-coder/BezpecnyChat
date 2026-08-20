import React, { useState } from 'react';
import {
  X,
  Eye,
  Hash,
  Shield,
  ShieldCheck,
  Terminal,
  Activity,
  Layers,
  Key,
  Lock,
  Zap,
  Copy,
  Check,
} from 'lucide-react';
import { useCrypto } from '../../context/CryptoContext';
import { useChat } from '../../context/ChatContext';
import {
  keccak256Hex,
  computeKeccakTag,
  generateBlindMailboxToken,
  formatKeccakAddress,
} from '../../crypto/keccak';
import { ChatMessage } from '../../types/chat';

interface CryptoInspectorProps {
  isOpen: boolean;
  onClose: () => void;
  inspectedMessage?: ChatMessage | null;
}

export const CryptoInspector: React.FC<CryptoInspectorProps> = ({
  isOpen,
  onClose,
  inspectedMessage,
}) => {
  const { profile, prekeys, publicBundle, auditLogs } = useCrypto();
  const { activeConversation } = useChat();

  const [activeTab, setActiveTab] = useState<'playground' | 'ratchet' | 'zero_meta' | 'audit'>('playground');
  const [testInput, setTestInput] = useState('SuperTajnáZpráva2026!');
  const [copied, setCopied] = useState<string | null>(null);

  if (!isOpen) return null;

  // Real-time calculations for playground
  const testKeccakHash = keccak256Hex(testInput);
  const testIntegrityTag = computeKeccakTag(testInput, 1700000000000);
  const testBlindToken = generateBlindMailboxToken(
    profile?.address || 'k256:0x0000000000000000000000000000000000000000',
    'epoch_2026_salt'
  );

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md select-none animate-in fade-in">
      <div className="w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl flex flex-col h-[85vh] text-slate-100 overflow-hidden">
        {/* Header */}
        <div className="p-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-cyber-500/10 text-cyber-400 border border-cyber-500/30">
              <Eye className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-sm sm:text-base flex items-center space-x-2">
                <span>Kryptografický Inspektor & Auditní Panel</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyber-500/10 text-cyber-300 border border-cyber-500/30">
                  KECCAK-256 Engine
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Živá analýza kryptografických primitiv, Double Ratchet stavu a Zero-Metadata paketů
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

        {/* Tab Selector */}
        <div className="flex border-b border-slate-800 bg-slate-950/60 px-4 pt-2 space-x-2 text-xs font-medium">
          <button
            onClick={() => setActiveTab('playground')}
            className={`px-3.5 py-2 rounded-t-xl transition-all flex items-center space-x-1.5 ${
              activeTab === 'playground'
                ? 'bg-slate-900 text-cyber-300 border-t border-x border-slate-800 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Hash className="w-3.5 h-3.5" />
            <span>KECCAK256 Playground</span>
          </button>

          <button
            onClick={() => setActiveTab('ratchet')}
            className={`px-3.5 py-2 rounded-t-xl transition-all flex items-center space-x-1.5 ${
              activeTab === 'ratchet'
                ? 'bg-slate-900 text-cyber-300 border-t border-x border-slate-800 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Double Ratchet Stav</span>
          </button>

          <button
            onClick={() => setActiveTab('zero_meta')}
            className={`px-3.5 py-2 rounded-t-xl transition-all flex items-center space-x-1.5 ${
              activeTab === 'zero_meta'
                ? 'bg-slate-900 text-cyber-300 border-t border-x border-slate-800 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Lock className="w-3.5 h-3.5" />
            <span>Zero-Metadata Slepý Balíček</span>
          </button>

          <button
            onClick={() => setActiveTab('audit')}
            className={`px-3.5 py-2 rounded-t-xl transition-all flex items-center space-x-1.5 ${
              activeTab === 'audit'
                ? 'bg-slate-900 text-cyber-300 border-t border-x border-slate-800 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>Bezpečnostní Audit ({auditLogs.length})</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* TAB 1: KECCAK256 PLAYGROUND */}
          {activeTab === 'playground' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Vstupní text pro testování KECCAK-256 hashe:
                </label>
                <input
                  type="text"
                  value={testInput}
                  onChange={(e) => setTestInput(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-slate-100 focus:outline-none focus:border-cyber-500/50"
                  placeholder="Zadejte libovolný text..."
                />
              </div>

              {/* KECCAK256 Digest Result */}
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1.5 font-mono text-xs">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-cyber-300 font-sans font-medium flex items-center space-x-1.5">
                    <Hash className="w-3.5 h-3.5 text-cyber-400" />
                    <span>KECCAK-256 Hash Digest (32 bajtů / 256 bitů):</span>
                  </span>
                  <button
                    onClick={() => handleCopy(testKeccakHash, 'hash')}
                    className="text-slate-400 hover:text-cyber-300 flex items-center space-x-1 text-[11px]"
                  >
                    {copied === 'hash' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copied === 'hash' ? 'Zkopírováno' : 'Kopírovat'}</span>
                  </button>
                </div>
                <div className="p-2.5 bg-slate-900 rounded-lg text-cyber-200 break-all text-[11px]">
                  0x{testKeccakHash}
                </div>
              </div>

              {/* Integrity Tag */}
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1.5 font-mono text-xs">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-slate-300 font-sans font-medium flex items-center space-x-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-cyber-400" />
                    <span>Integritní ověřovací tag zprávy:</span>
                  </span>
                  <button
                    onClick={() => handleCopy(testIntegrityTag, 'tag')}
                    className="text-slate-400 hover:text-cyber-300 flex items-center space-x-1 text-[11px]"
                  >
                    {copied === 'tag' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copied === 'tag' ? 'Zkopírováno' : 'Kopírovat'}</span>
                  </button>
                </div>
                <div className="p-2.5 bg-slate-900 rounded-lg text-slate-300 break-all text-[11px]">
                  0x{testIntegrityTag}
                </div>
              </div>

              {/* Blind Mailbox Token */}
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1.5 font-mono text-xs">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-slate-300 font-sans font-medium flex items-center space-x-1.5">
                    <Lock className="w-3.5 h-3.5 text-cyber-400" />
                    <span>Slepý token cílové schránky pro Zero-Metadata:</span>
                  </span>
                  <button
                    onClick={() => handleCopy(testBlindToken, 'blind')}
                    className="text-slate-400 hover:text-cyber-300 flex items-center space-x-1 text-[11px]"
                  >
                    {copied === 'blind' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copied === 'blind' ? 'Zkopírováno' : 'Kopírovat'}</span>
                  </button>
                </div>
                <div className="p-2.5 bg-slate-900 rounded-lg text-purple-300 break-all text-[11px]">
                  0x{testBlindToken}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: DOUBLE RATCHET STATE */}
          {activeTab === 'ratchet' && (
            <div className="space-y-4">
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-2 text-xs">
                <h4 className="font-semibold text-cyber-300 flex items-center space-x-1.5">
                  <Layers className="w-4 h-4" />
                  <span>Stav Aktivní Relace: {activeConversation?.name || 'Globální'}</span>
                </h4>
                <p className="text-slate-400 text-[11px]">
                  Při každé odeslané a přijaté zprávě se vnitřní klíče KDF řetězce nevratně posouvají vpřed. Staré klíče jsou okamžitě skartovány (Perfect Forward Secrecy).
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
                  <span className="text-slate-500 text-[10px] uppercase">Kryptografické Primitivum</span>
                  <p className="text-cyber-300 font-bold">KECCAK256 + X25519 + AES-256-GCM</p>
                </div>

                <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
                  <span className="text-slate-500 text-[10px] uppercase">Post-Quantum Ochrana</span>
                  <p className="text-cyber-300 font-bold">Hybrid ML-KEM-768 Ready</p>
                </div>

                <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
                  <span className="text-slate-500 text-[10px] uppercase">Vlastní Identity Klíč (IK)</span>
                  <p className="text-slate-300 break-all text-[11px]">
                    {publicBundle?.identityKeyHex.slice(0, 24)}...
                  </p>
                </div>

                <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
                  <span className="text-slate-500 text-[10px] uppercase">Podepsaná Prekey (SPK)</span>
                  <p className="text-slate-300 break-all text-[11px]">
                    {publicBundle?.signedPrekeyHex.slice(0, 24)}...
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: ZERO-METADATA PACKET */}
          {activeTab === 'zero_meta' && (
            <div className="space-y-3 font-mono text-xs">
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1 text-slate-300 font-sans">
                <h4 className="font-semibold text-cyber-300 flex items-center space-x-1.5">
                  <Lock className="w-4 h-4" />
                  <span>Struktura Šifrovaného Paketu pro Server Relay</span>
                </h4>
                <p className="text-slate-400 text-[11px]">
                  Server vidí pouze jednosměrný blind mailbox token a neprůhledný šifrovaný bajtový balíček. Žádná IP adresa, metadata odesílatele ani obsah zprávy nejsou serveru přístupné.
                </p>
              </div>

              <pre className="p-4 bg-slate-950 border border-slate-800 rounded-xl text-cyber-300 overflow-x-auto text-[11px] leading-relaxed">
{JSON.stringify(
  {
    protocol: "KECCAK256_E2EE_v1",
    mailboxToken: `0x${testBlindToken}`,
    packetHeader: {
      ephemeralDhPub: `0x${publicBundle?.signedPrekeyHex || 'e4a2...'}`,
      ratchetChainIndex: 14,
      previousChainLen: 3,
    },
    encryptedPayload: {
      ciphertext: "7b82f0c5a9382b7194827d04e719b02a91...",
      iv: "e9f0281ba4819401",
      tag: "8a9317bf482b01a7...",
      keccakIntegrity: `0x${testIntegrityTag}`,
    },
    serverMetadataStored: null,
    serverLogsRetained: false,
  },
  null,
  2
)}
              </pre>
            </div>
          )}

          {/* TAB 4: AUDIT TRAIL */}
          {activeTab === 'audit' && (
            <div className="space-y-2">
              {auditLogs.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs">
                  Zatím žádné auditní záznamy.
                </div>
              ) : (
                auditLogs.map((log) => (
                  <div
                    key={log.id}
                    className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            log.severity === 'security'
                              ? 'bg-cyber-400'
                              : log.severity === 'success'
                              ? 'bg-emerald-400'
                              : log.severity === 'warning'
                              ? 'bg-amber-400'
                              : 'bg-slate-400'
                          }`}
                        />
                        <span className="font-semibold text-slate-200">{log.title}</span>
                      </div>
                      <span className="text-[10px] font-mono text-slate-500">
                        {new Date(log.timestamp).toLocaleTimeString('cs-CZ')}
                      </span>
                    </div>
                    <p className="text-slate-400 text-[11px] pl-4">{log.description}</p>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
