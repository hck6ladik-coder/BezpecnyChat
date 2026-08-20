import React, { createContext, useContext, useState, useEffect, ReactNode, useRef } from 'react';
import { WebRTCCallSession } from '../types/chat';
import { keccak256, bytesToHex, utf8ToBytes } from '../crypto/keccak';
import { useCrypto } from './CryptoContext';

interface WebRTCContextType {
  activeCall: WebRTCCallSession | null;
  startCall: (peerAddress: string, peerName: string, peerAvatar: string, type: 'audio' | 'video') => void;
  acceptCall: () => void;
  rejectCall: () => void;
  endCall: () => void;
  toggleMute: () => void;
  toggleVideo: () => void;
  toggleScreenShare: () => void;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
}

const WebRTCContext = createContext<WebRTCContextType | null>(null);

export const WebRTCProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { profile, addAuditLog } = useCrypto();
  const [activeCall, setActiveCall] = useState<WebRTCCallSession | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const durationTimerRef = useRef<number | null>(null);

  // Compute Short Authentication String (SAS) using KECCAK256 of participants' addresses and callId
  const generateSasCode = (callId: string, caller: string, callee: string): string => {
    const participants = [caller.toLowerCase(), callee.toLowerCase()].sort();
    const hash = keccak256(utf8ToBytes(`${callId}:${participants[0]}:${participants[1]}`));
    const num1 = ((hash[0] << 8) | hash[1]) % 1000;
    const num2 = ((hash[2] << 8) | hash[3]) % 1000;
    return `${num1.toString().padStart(3, '0')}-${num2.toString().padStart(3, '0')}`;
  };

  const startCall = (
    peerAddress: string,
    peerName: string,
    peerAvatar: string,
    type: 'audio' | 'video'
  ) => {
    if (!profile) return;
    const callId = `call_${Date.now()}`;
    const sas = generateSasCode(callId, profile.address, peerAddress);

    const call: WebRTCCallSession = {
      callId,
      peerAddress,
      peerName,
      peerAvatar,
      type,
      status: 'calling',
      sasCode: sas,
      isMuted: false,
      isVideoOff: type === 'audio',
      isScreenSharing: false,
      durationSec: 0,
    };

    setActiveCall(call);

    addAuditLog({
      type: 'handshake',
      title: `Zahájen E2EE WebRTC ${type === 'video' ? 'video' : 'audio'} hovor`,
      description: `Navazování spojení s ${peerName}. SAS ověřovací kód: ${sas}`,
      details: { callId, peerAddress, sasCode: sas },
      severity: 'security',
    });

    // Simulate peer pickup after 2.5 seconds for demo experience
    setTimeout(() => {
      setActiveCall((prev) => (prev ? { ...prev, status: 'connected' } : null));
    }, 2500);
  };

  const acceptCall = () => {
    if (!activeCall) return;
    setActiveCall((prev) => (prev ? { ...prev, status: 'connected' } : null));
  };

  const rejectCall = () => {
    endCall();
  };

  const endCall = () => {
    if (activeCall) {
      addAuditLog({
        type: 'handshake',
        title: 'E2EE WebRTC hovor ukončen',
        description: `Doba trvání: ${activeCall.durationSec} s. Šifrovací kanál byl uzavřen.`,
        details: { callId: activeCall.callId, duration: activeCall.durationSec },
        severity: 'info',
      });
    }

    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }

    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
      setLocalStream(null);
    }
    setRemoteStream(null);
    setActiveCall(null);
  };

  // Duration timer when connected
  useEffect(() => {
    if (activeCall?.status === 'connected') {
      durationTimerRef.current = window.setInterval(() => {
        setActiveCall((prev) => (prev ? { ...prev, durationSec: prev.durationSec + 1 } : null));
      }, 1000);
    } else {
      if (durationTimerRef.current) {
        clearInterval(durationTimerRef.current);
        durationTimerRef.current = null;
      }
    }

    return () => {
      if (durationTimerRef.current) {
        clearInterval(durationTimerRef.current);
      }
    };
  }, [activeCall?.status]);

  const toggleMute = () => {
    setActiveCall((prev) => (prev ? { ...prev, isMuted: !prev.isMuted } : null));
  };

  const toggleVideo = () => {
    setActiveCall((prev) => (prev ? { ...prev, isVideoOff: !prev.isVideoOff } : null));
  };

  const toggleScreenShare = () => {
    setActiveCall((prev) => (prev ? { ...prev, isScreenSharing: !prev.isScreenSharing } : null));
  };

  return (
    <WebRTCContext.Provider
      value={{
        activeCall,
        startCall,
        acceptCall,
        rejectCall,
        endCall,
        toggleMute,
        toggleVideo,
        toggleScreenShare,
        localStream,
        remoteStream,
      }}
    >
      {children}
    </WebRTCContext.Provider>
  );
};

export const useWebRTC = () => {
  const context = useContext(WebRTCContext);
  if (!context) {
    throw new Error('useWebRTC must be used within a WebRTCProvider');
  }
  return context;
};
