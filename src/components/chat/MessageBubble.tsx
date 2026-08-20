import React, { useState } from 'react';
import {
  Check,
  CheckCheck,
  Clock,
  Flame,
  FileText,
  Download,
  Trash2,
  Copy,
  Hash,
  ShieldCheck,
  Play,
  Pause,
  AlertCircle,
  Sparkles,
  HeartHandshake,
} from 'lucide-react';
import { ChatMessage } from '../../types/chat';
import { formatKeccakAddress } from '../../crypto/keccak';

interface MessageBubbleProps {
  message: ChatMessage;
  onDelete: (id: string) => void;
  onInspectCrypto?: (message: ChatMessage) => void;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  onDelete,
  onInspectCrypto,
}) => {
  const [showMenu, setShowMenu] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);

  const formatTime = (ts: number) => {
    return new Date(ts).toLocaleTimeString('cs-CZ', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Calculate remaining time for self-destruct if active
  const remainingSec = message.expiresAt
    ? Math.max(0, Math.floor((message.expiresAt - Date.now()) / 1000))
    : null;

  return (
    <div
      className={`group relative flex flex-col my-1.5 ${
        message.isSelf ? 'items-end' : 'items-start'
      }`}
      onMouseEnter={() => setShowMenu(true)}
      onMouseLeave={() => setShowMenu(false)}
    >
      {/* Sender Name in group */}
      {message.groupId && !message.isSelf && message.senderName && (
        <span className="text-[10px] font-mono text-cyber-400 mb-0.5 ml-2">
          {message.senderName} ({formatKeccakAddress(message.senderAddress)})
        </span>
      )}

      {/* Bubble Container */}
      <div
        className={`relative max-w-[85%] sm:max-w-[70%] md:max-w-[60%] rounded-2xl px-3.5 py-2.5 shadow-md transition-all ${
          message.isSelf
            ? 'bg-gradient-to-br from-cyber-700 to-cyber-900 text-slate-100 rounded-tr-xs border border-cyber-600/40'
            : 'bg-slate-800/95 text-slate-100 rounded-tl-xs border border-slate-700/80'
        }`}
      >
        {/* Header badges: Self Destruct & Crisis Guard Indicator */}
        <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
          {remainingSec !== null && (
            <div className="flex items-center space-x-1 text-[9px] font-mono text-amber-300 bg-amber-950/60 px-2 py-0.5 rounded-full border border-amber-500/30 w-fit">
              <Flame className="w-2.5 h-2.5 text-amber-400 animate-pulse" />
              <span>
                Skartace za: {remainingSec > 60 ? `${Math.floor(remainingSec / 60)}m` : `${remainingSec}s`}
              </span>
            </div>
          )}

          {message.isCrisisFlagged && (
            <div className="flex items-center space-x-1 text-[9px] font-mono text-rose-300 bg-rose-950/60 px-2 py-0.5 rounded-full border border-rose-500/40 w-fit">
              <HeartHandshake className="w-2.5 h-2.5 text-rose-400" />
              <span>Safety Guard Kontrolováno</span>
            </div>
          )}
        </div>

        {/* Message Content depending on Type */}
        {message.type === 'image' && message.fileMetadata?.previewUrl && (
          <div className="mb-2 rounded-lg overflow-hidden border border-slate-700/60 max-w-sm">
            <img
              src={message.fileMetadata.previewUrl}
              alt="Šifrovaný obrázek"
              className="w-full h-auto max-h-60 object-cover"
            />
          </div>
        )}

        {message.type === 'audio' && (
          <div className="flex items-center space-x-2 py-1 mb-1">
            <button
              onClick={() => setIsPlayingAudio(!isPlayingAudio)}
              className="p-2 rounded-full bg-cyber-500 text-slate-950 hover:bg-cyber-400 transition-colors"
            >
              {isPlayingAudio ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
            </button>
            <div className="flex-1">
              <div className="h-1.5 w-32 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className={`h-full bg-cyber-400 ${
                    isPlayingAudio ? 'w-3/4 animate-pulse' : 'w-1/4'
                  }`}
                />
              </div>
              <span className="text-[10px] font-mono text-slate-400">Šifrovaná hlasová zpráva</span>
            </div>
          </div>
        )}

        {message.type === 'file' && message.fileMetadata && (
          <div className="flex items-center space-x-3 p-2 rounded-lg bg-slate-900/60 border border-slate-700/60 mb-2">
            <div className="p-2 rounded-lg bg-cyber-500/20 text-cyber-300">
              <FileText className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-slate-200 truncate">
                {message.fileMetadata.fileName}
              </p>
              <p className="text-[10px] text-slate-400 font-mono">
                {(message.fileMetadata.fileSize / 1024).toFixed(1)} KB • AES-256-GCM
              </p>
            </div>
            {message.fileMetadata.dataUrl && (
              <a
                href={message.fileMetadata.dataUrl}
                download={message.fileMetadata.fileName}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-cyber-500 hover:text-slate-950 text-slate-300 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
        )}

        {/* Text Content */}
        <p className="text-xs sm:text-sm whitespace-pre-wrap break-words leading-relaxed">
          {message.content}
        </p>

        {/* Footer: KECCAK256 Hash Tag, Sentiment Indicator (DistilBERT), Timestamp & Status */}
        <div className="mt-2 pt-1 border-t border-slate-700/40 flex items-center justify-between space-x-2 text-[10px] font-mono text-slate-400">
          <div className="flex items-center space-x-2">
            {/* Keccak integrity verified pill */}
            <div
              className="flex items-center space-x-1 text-[9px] text-cyber-300/80 hover:text-cyber-300 cursor-help"
              title={`KECCAK256 Tag integrity: 0x${message.keccakIntegrityTag}`}
            >
              <ShieldCheck className="w-2.5 h-2.5 text-cyber-400" />
              <span>K256:0x{message.keccakIntegrityTag.slice(0, 6)}...</span>
            </div>

            {/* Hugging Face DistilBERT Sentiment Tag */}
            {message.sentiment && (
              <div
                className={`flex items-center space-x-1 text-[9px] px-1.5 py-0.2 rounded-full border cursor-help ${
                  message.sentiment.label === 'POSITIVE'
                    ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/30'
                    : message.sentiment.label === 'NEGATIVE'
                    ? 'bg-amber-950/60 text-amber-300 border-amber-500/30'
                    : 'bg-slate-850 text-slate-400 border-slate-700'
                }`}
                title={`Hugging Face DistilBERT Model sentiment: ${message.sentiment.czechLabel} (${Math.round(
                  message.sentiment.score * 100
                )}% spolehlivost)`}
              >
                <span>{message.sentiment.emoji}</span>
                <span>{Math.round(message.sentiment.score * 100)}%</span>
              </div>
            )}
          </div>

          <div className="flex items-center space-x-1.5">
            <span>{formatTime(message.timestamp)}</span>
            {message.isSelf && (
              <span>
                {message.status === 'pending' && <Clock className="w-3 h-3 text-amber-400" />}
                {message.status === 'sent' && <Check className="w-3 h-3 text-slate-400" />}
                {message.status === 'delivered' && <CheckCheck className="w-3 h-3 text-slate-400" />}
                {message.status === 'read' && <CheckCheck className="w-3 h-3 text-cyber-400" />}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Hover Floating Actions Menu */}
      {showMenu && (
        <div
          className={`absolute top-0 -mt-3 flex items-center space-x-1 bg-slate-900 border border-slate-700 rounded-lg p-1 shadow-xl z-20 ${
            message.isSelf ? 'right-2' : 'left-2'
          }`}
        >
          <button
            onClick={handleCopy}
            className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
            title="Kopírovat text"
          >
            <Copy className="w-3 h-3" />
          </button>
          <button
            onClick={() => onInspectCrypto && onInspectCrypto(message)}
            className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-cyber-400 transition-colors"
            title="Inspekce KECCAK256 hashe"
          >
            <Hash className="w-3 h-3" />
          </button>
          <button
            onClick={() => onDelete(message.id)}
            className="p-1 rounded hover:bg-red-950/60 text-slate-400 hover:text-red-400 transition-colors"
            title="Smazat zprávu (lokálně i z trezoru)"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
};
