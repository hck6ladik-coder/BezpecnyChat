import React, { useState } from 'react';
import {
  X,
  Users,
  Plus,
  Trash2,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { useChat } from '../../context/ChatContext';
import { useCrypto } from '../../context/CryptoContext';
import { formatKeccakAddress } from '../../crypto/keccak';

interface GroupCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const GroupCreateModal: React.FC<GroupCreateModalProps> = ({ isOpen, onClose }) => {
  const { createGroupChat } = useChat();
  const { profile } = useCrypto();

  const [groupName, setGroupName] = useState('');
  const [memberInput, setMemberInput] = useState('');
  const [members, setMembers] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleAddMember = () => {
    const trimmed = memberInput.trim();
    if (!trimmed) return;
    if (!trimmed.startsWith('k256:0x') && trimmed.length < 10) {
      setError('Zadejte platnou k256:0x adresu kontaktu.');
      return;
    }
    if (members.includes(trimmed)) {
      setError('Tento člen je již v seznamu.');
      return;
    }
    setMembers([...members, trimmed]);
    setMemberInput('');
    setError(null);
  };

  const handleRemoveMember = (addr: string) => {
    setMembers(members.filter((m) => m !== addr));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName.trim()) {
      setError('Zadejte název skupiny.');
      return;
    }
    try {
      await createGroupChat(groupName.trim(), members);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Chyba při zakládání skupiny.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm select-none animate-in fade-in">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 space-y-5 text-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-cyber-500/10 text-cyber-400 border border-cyber-500/30">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-sm sm:text-base">
                Nová E2EE Skupina (Sender Key)
              </h3>
              <p className="text-xs text-slate-400">
                Šifrováno pro až 2 000 členů s garancí PFS
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

        {/* Sender Key Protocol Info Badge */}
        <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl text-xs text-slate-400 space-y-1">
          <div className="flex items-center space-x-1.5 text-cyber-300 font-medium">
            <Zap className="w-3.5 h-3.5" />
            <span>Protokol Sender Key s KECCAK256</span>
          </div>
          <p className="text-[11px] text-slate-500">
            Každý účastník distribuuje svůj šifrovaný Sender Chain Key přes dvoustranné Double Ratchet kanály. Zprávy se šifrují v O(1) čase.
          </p>
        </div>

        {error && (
          <div className="p-2.5 bg-red-950/60 border border-red-800 rounded-xl text-xs text-red-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Název Skupiny
            </label>
            <input
              type="text"
              required
              placeholder="např. Bezpečnostní Projekt 2026"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyber-500/50"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Přidat Člena (k256:0x adresa)
            </label>
            <div className="flex space-x-2">
              <input
                type="text"
                placeholder="k256:0x..."
                value={memberInput}
                onChange={(e) => setMemberInput(e.target.value)}
                className="flex-1 px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyber-500/50 font-mono"
              />
              <button
                type="button"
                onClick={handleAddMember}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-750 text-cyber-400 border border-slate-700 rounded-xl text-xs font-medium flex items-center space-x-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Přidat</span>
              </button>
            </div>
          </div>

          {/* Members list */}
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-slate-400">
              Členové ({members.length + 1}):
            </span>
            <div className="max-h-32 overflow-y-auto space-y-1 bg-slate-950 p-2.5 rounded-xl border border-slate-800">
              {profile && (
                <div className="flex items-center justify-between p-1.5 rounded bg-slate-900 text-xs font-mono text-cyber-300">
                  <span>{formatKeccakAddress(profile.address)} (Vy - Zakladatel)</span>
                </div>
              )}
              {members.map((addr) => (
                <div
                  key={addr}
                  className="flex items-center justify-between p-1.5 rounded bg-slate-900 text-xs font-mono text-slate-300"
                >
                  <span>{formatKeccakAddress(addr)}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveMember(addr)}
                    className="text-red-400 hover:text-red-300 p-1"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Buttons */}
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
              className="px-4 py-2 rounded-xl bg-cyber-500 hover:bg-cyber-400 text-slate-950 font-semibold text-xs shadow-md shadow-cyber-500/20"
            >
              Vytvořit Skupinu
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
