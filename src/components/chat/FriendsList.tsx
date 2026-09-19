import React, { useState } from 'react';
import {
  Users,
  UserPlus,
  MessageSquare,
  Trash2,
  Search,
  CheckCircle2,
  Copy,
  ShieldCheck,
} from 'lucide-react';
import { useChat } from '../../context/ChatContext';
import { useCrypto } from '../../context/CryptoContext';

interface FriendsListProps {
  onAddFriend: () => void;
  onOpenChat: (address: string, name?: string) => void;
}

export const FriendsList: React.FC<FriendsListProps> = ({ onAddFriend, onOpenChat }) => {
  const { friends, removeFriend } = useChat();
  const { profile } = useCrypto();
  const [search, setSearch] = useState('');
  const [copiedTag, setCopiedTag] = useState<string | null>(null);

  const filteredFriends = friends.filter((f) => {
    const q = search.toLowerCase().trim();
    return (
      f.username.toLowerCase().includes(q) ||
      f.address.toLowerCase().includes(q) ||
      f.shortTag.toLowerCase().includes(q)
    );
  });

  const handleCopyTag = (tag: string) => {
    navigator.clipboard.writeText(tag);
    setCopiedTag(tag);
    setTimeout(() => setCopiedTag(null), 2000);
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden select-none bg-slate-900/60">
      {/* Header & Controls */}
      <div className="p-3 border-b border-slate-800 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Users className="w-4 h-4 text-cyber-400" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              Přátelé ({friends.length})
            </h3>
          </div>
          <button
            onClick={onAddFriend}
            className="px-2.5 py-1 bg-cyber-500/10 hover:bg-cyber-500/20 text-cyber-300 border border-cyber-500/30 rounded-lg text-xs font-medium flex items-center space-x-1.5 transition-all shadow-sm"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Přidat přítele</span>
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-500" />
          <input
            type="text"
            placeholder="Hledat v přátelích podle jména nebo kódu..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-slate-950/70 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyber-500/50 transition-all font-mono"
          />
        </div>
      </div>

      {/* Friends list scroll */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-800/40">
        {filteredFriends.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-xs space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-800/80 border border-slate-700 flex items-center justify-center mx-auto text-slate-400">
              <Users className="w-6 h-6" />
            </div>
            <p className="text-slate-400 font-medium">
              {search ? 'Žádný přítel neodpovídá hledání.' : 'Zatím nemáte v seznamu žádné přátele.'}
            </p>
            <p className="text-[11px] text-slate-500 max-w-xs mx-auto">
              Přidejte si přátele zadáním jejich krátkého kódu (např. #8D7-2AB) nebo jim pošlete váš kód.
            </p>
            <button
              onClick={onAddFriend}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-cyber-500 hover:bg-cyber-400 text-slate-950 rounded-xl font-semibold text-xs transition-all shadow-md shadow-cyber-500/20"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Přidat prvního přítele</span>
            </button>
          </div>
        ) : (
          filteredFriends.map((friend) => (
            <div
              key={friend.address}
              className="p-3 hover:bg-slate-800/50 transition-all flex items-center justify-between group"
            >
              <div
                onClick={() => onOpenChat(friend.address, friend.username)}
                className="flex items-center space-x-3 flex-1 min-w-0 cursor-pointer"
              >
                {/* Avatar with live status */}
                <div className="relative flex-shrink-0">
                  <img
                    src={friend.avatar}
                    alt={friend.username}
                    className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 object-cover"
                  />
                  <div
                    className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-slate-900 ${
                      friend.isOnline ? 'bg-emerald-500 shadow-sm shadow-emerald-500/50' : 'bg-slate-600'
                    }`}
                    title={friend.isOnline ? 'Online v síti' : 'Offline'}
                  />
                </div>

                {/* Friend Info */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center space-x-1.5">
                    <span className="font-semibold text-xs text-slate-200 truncate group-hover:text-cyber-300 transition-colors">
                      {friend.username}
                    </span>
                    <ShieldCheck className="w-3 h-3 text-cyber-400 flex-shrink-0" />
                  </div>
                  <div className="flex items-center space-x-2 text-[10px] text-slate-400 font-mono mt-0.5">
                    <span className="bg-slate-800/80 px-1.5 py-0.5 rounded text-cyber-300 font-bold border border-slate-700/60">
                      {friend.shortTag}
                    </span>
                    <span className={friend.isOnline ? 'text-emerald-400' : 'text-slate-500'}>
                      {friend.isOnline ? '• Online' : '• Offline'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center space-x-1 opacity-80 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => onOpenChat(friend.address, friend.username)}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-cyber-500/20 text-slate-300 hover:text-cyber-300 border border-slate-700/70 transition-all"
                  title="Napsat zprávu"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleCopyTag(friend.shortTag)}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 border border-slate-700/70 transition-all"
                  title="Kopírovat kód přítele"
                >
                  {copiedTag === friend.shortTag ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
                <button
                  onClick={() => removeFriend(friend.address)}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-red-500/20 text-slate-400 hover:text-red-400 border border-slate-700/70 transition-all"
                  title="Odebrat z přátel"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
