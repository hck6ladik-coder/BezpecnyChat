import React from 'react';
import {
  Search,
  UserPlus,
  Users,
  ShieldCheck,
  ShieldAlert,
  Flame,
  Clock,
  Lock,
  Plus,
} from 'lucide-react';
import { useChat } from '../../context/ChatContext';
import { formatKeccakAddress } from '../../crypto/keccak';
import { ChatConversation } from '../../types/chat';

interface ChatListProps {
  onNewChat: () => void;
  onNewGroup: () => void;
}

export const ChatList: React.FC<ChatListProps> = ({ onNewChat, onNewGroup }) => {
  const {
    conversations,
    activeConversationId,
    setActiveConversationId,
    searchQuery,
    setSearchQuery,
  } = useChat();

  const filteredConversations = conversations.filter((c) => {
    const q = searchQuery.toLowerCase();
    const matchName = c.name.toLowerCase().includes(q);
    const matchAddress = c.peerAddress?.toLowerCase().includes(q) || false;
    return matchName || matchAddress;
  });

  const formatTime = (timestamp?: number) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <aside className="w-full md:w-80 lg:w-96 h-full bg-slate-900/90 border-r border-slate-800 flex flex-col select-none">
      {/* Top Header & Actions */}
      <div className="p-3 border-b border-slate-800 space-y-2.5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-200 tracking-wide uppercase flex items-center space-x-1.5">
            <Lock className="w-4 h-4 text-cyber-400" />
            <span>Šifrované Chaty</span>
          </h2>
          <div className="flex items-center space-x-1">
            <button
              onClick={onNewChat}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-cyber-500/20 text-slate-300 hover:text-cyber-300 border border-slate-700 transition-colors"
              title="Zahájit přímý E2EE chat"
            >
              <UserPlus className="w-4 h-4" />
            </button>
            <button
              onClick={onNewGroup}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-cyber-500/20 text-slate-300 hover:text-cyber-300 border border-slate-700 transition-colors"
              title="Vytvořit E2EE skupinu (Sender Key)"
            >
              <Users className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Search input */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
          <input
            type="text"
            placeholder="Hledat kontakt nebo k256:0x adresu..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-950/70 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyber-500/50 focus:ring-1 focus:ring-cyber-500/30 transition-all font-mono"
          />
        </div>
      </div>

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-800/40">
        {filteredConversations.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-xs">
            <ShieldAlert className="w-8 h-8 mx-auto mb-2 text-slate-600" />
            <p>Nenalezeny žádné zabezpečené relace.</p>
            <button
              onClick={onNewChat}
              className="mt-3 inline-flex items-center space-x-1 text-cyber-400 hover:text-cyber-300 underline font-medium"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Přidat kontakt</span>
            </button>
          </div>
        ) : (
          filteredConversations.map((conv) => {
            const isActive = conv.id === activeConversationId;
            return (
              <div
                key={conv.id}
                onClick={() => setActiveConversationId(conv.id)}
                className={`p-3 flex items-start space-x-3 cursor-pointer transition-all ${
                  isActive
                    ? 'bg-slate-800/90 border-l-4 border-cyber-400'
                    : 'hover:bg-slate-800/40 border-l-4 border-transparent'
                }`}
              >
                {/* Avatar with status indicator */}
                <div className="relative flex-shrink-0">
                  <img
                    src={conv.avatar}
                    alt={conv.name}
                    className="w-11 h-11 rounded-xl bg-slate-800 border border-slate-700 object-cover"
                  />
                  {conv.isOnline && (
                    <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 border-2 border-slate-900 rounded-full" />
                  )}
                  {conv.type === 'group' && (
                    <div className="absolute -top-1 -right-1 p-0.5 bg-slate-900 rounded-md border border-slate-700 text-cyber-400">
                      <Users className="w-2.5 h-2.5" />
                    </div>
                  )}
                </div>

                {/* Info & Last message */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <div className="flex items-center space-x-1.5 truncate">
                      <span className="font-medium text-xs text-slate-200 truncate">
                        {conv.name}
                      </span>
                      {conv.safetyNumberVerified ? (
                        <span title="Bezpečnostní číslo ověřeno" className="flex-shrink-0">
                          <ShieldCheck className="w-3.5 h-3.5 text-cyber-400" />
                        </span>
                      ) : (
                        <span title="Neověřené bezpečnostní číslo" className="flex-shrink-0">
                          <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-500 font-mono flex-shrink-0">
                      {formatTime(conv.lastMessage?.timestamp)}
                    </span>
                  </div>

                  {/* Keccak address preview */}
                  {conv.peerAddress && (
                    <div className="text-[10px] font-mono text-slate-500 truncate mb-1">
                      {formatKeccakAddress(conv.peerAddress)}
                    </div>
                  )}

                  {/* Last message snippet & status badge */}
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <p className="truncate text-slate-400 text-[11px] max-w-[180px]">
                      {conv.lastMessage?.content || 'Žádné zprávy'}
                    </p>

                    <div className="flex items-center space-x-1.5 flex-shrink-0">
                      {conv.selfDestructSetting !== 'off' && (
                        <span
                          className="flex items-center space-x-0.5 text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20"
                          title={`Samosmazání: ${conv.selfDestructSetting}`}
                        >
                          <Flame className="w-2.5 h-2.5" />
                          <span>{conv.selfDestructSetting}</span>
                        </span>
                      )}

                      {conv.unreadCount > 0 && (
                        <span className="w-4 h-4 rounded-full bg-cyber-500 text-slate-950 font-bold text-[10px] flex items-center justify-center">
                          {conv.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
};
