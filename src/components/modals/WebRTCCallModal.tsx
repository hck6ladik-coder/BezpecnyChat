import React from 'react';
import {
  PhoneOff,
  Mic,
  MicOff,
  Video,
  VideoOff,
  ShieldCheck,
  Lock,
  Radio,
  Share2,
} from 'lucide-react';
import { useWebRTC } from '../../context/WebRTCContext';

export const WebRTCCallModal: React.FC = () => {
  const {
    activeCall,
    endCall,
    toggleMute,
    toggleVideo,
    toggleScreenShare,
  } = useWebRTC();

  if (!activeCall) return null;

  const formatDuration = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const remainingSecs = sec % 60;
    return `${mins.toString().padStart(2, '0')}:${remainingSecs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md select-none animate-in fade-in">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col items-center p-6 space-y-6 text-slate-100">
        {/* Top security SAS banner */}
        <div className="w-full bg-slate-950/80 border border-slate-800 rounded-2xl p-3.5 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-cyber-500/10 text-cyber-400 border border-cyber-500/30">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-200">
                End-to-End Šifrovaný WebRTC Hovor
              </div>
              <div className="text-[11px] text-slate-400">
                Ověřovací SAS kód (vyslovte nahlas pro kontrolu):
              </div>
            </div>
          </div>

          <div className="px-3.5 py-1.5 rounded-xl bg-cyber-500/20 border border-cyber-500/50 text-cyber-300 font-mono font-bold text-base tracking-widest">
            {activeCall.sasCode}
          </div>
        </div>

        {/* Video / Avatar stage */}
        <div className="w-full h-64 sm:h-80 bg-slate-950 rounded-2xl border border-slate-800 relative overflow-hidden flex flex-col items-center justify-center">
          {activeCall.type === 'video' && !activeCall.isVideoOff ? (
            <div className="w-full h-full bg-gradient-to-tr from-slate-900 to-slate-850 flex items-center justify-center">
              <div className="text-center space-y-2">
                <Video className="w-12 h-12 mx-auto text-cyber-400/60 animate-pulse" />
                <span className="text-xs text-slate-400 font-mono">
                  Šifrovaný video stream (DTLS-SRTP 1080p)
                </span>
              </div>
            </div>
          ) : (
            <div className="text-center space-y-4">
              <div className="relative inline-block">
                <img
                  src={activeCall.peerAvatar}
                  alt={activeCall.peerName}
                  className="w-24 h-24 rounded-3xl bg-slate-800 border-2 border-cyber-500/50 shadow-xl shadow-cyber-500/10 object-cover"
                />
                {activeCall.status === 'connected' && (
                  <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-emerald-500 border-2 border-slate-950 rounded-full flex items-center justify-center">
                    <Radio className="w-2.5 h-2.5 text-slate-950" />
                  </div>
                )}
              </div>

              <div>
                <h4 className="text-lg font-bold text-slate-100">
                  {activeCall.peerName}
                </h4>
                <p className="text-xs text-slate-400 font-mono mt-0.5">
                  {activeCall.status === 'calling'
                    ? 'Vyzvánění...'
                    : `Probíhající hovor • ${formatDuration(activeCall.durationSec)}`}
                </p>
              </div>

              {/* Animated audio visualizer bars */}
              {activeCall.status === 'connected' && (
                <div className="flex items-center justify-center space-x-1 pt-2">
                  {[40, 70, 30, 90, 60, 80, 50, 95, 45, 65].map((height, i) => (
                    <div
                      key={i}
                      style={{ height: `${height * 0.3}px` }}
                      className="w-1 bg-cyber-400/80 rounded-full animate-pulse"
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Bottom controls */}
        <div className="flex items-center space-x-4">
          <button
            onClick={toggleMute}
            className={`p-3.5 rounded-2xl border transition-all ${
              activeCall.isMuted
                ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                : 'bg-slate-800 hover:bg-slate-750 text-slate-300 border-slate-700'
            }`}
            title={activeCall.isMuted ? 'Zapnout mikrofon' : 'Ztlumit mikrofon'}
          >
            {activeCall.isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>

          <button
            onClick={toggleVideo}
            className={`p-3.5 rounded-2xl border transition-all ${
              activeCall.isVideoOff
                ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                : 'bg-slate-800 hover:bg-slate-750 text-slate-300 border-slate-700'
            }`}
            title={activeCall.isVideoOff ? 'Zapnout kameru' : 'Vypnout kameru'}
          >
            {activeCall.isVideoOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
          </button>

          <button
            onClick={toggleScreenShare}
            className={`p-3.5 rounded-2xl border transition-all ${
              activeCall.isScreenSharing
                ? 'bg-cyber-500/20 text-cyber-300 border-cyber-500/40'
                : 'bg-slate-800 hover:bg-slate-750 text-slate-300 border-slate-700'
            }`}
            title="Sdílet obrazovku"
          >
            <Share2 className="w-5 h-5" />
          </button>

          <button
            onClick={endCall}
            className="p-3.5 rounded-2xl bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-600/30 transition-all"
            title="Ukončit hovor"
          >
            <PhoneOff className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};
