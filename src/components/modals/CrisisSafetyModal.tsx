import React, { useState } from 'react';
import {
  HeartHandshake,
  PhoneCall,
  ExternalLink,
  ShieldAlert,
  X,
  MessageCircle,
  Sparkles,
  ArrowRight,
  Globe,
} from 'lucide-react';
import { CRISIS_HOTLINES, CrisisDetectionResult } from '../../services/safetyGuard';

interface CrisisSafetyModalProps {
  isOpen: boolean;
  onClose: () => void;
  detectionResult: CrisisDetectionResult | null;
  onProceedAnyway: () => void;
}

export const CrisisSafetyModal: React.FC<CrisisSafetyModalProps> = ({
  isOpen,
  onClose,
  detectionResult,
  onProceedAnyway,
}) => {
  const [lang, setLang] = useState<'cs' | 'en'>(
    detectionResult?.detectedLanguage === 'en' ? 'en' : 'cs'
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md select-none animate-in fade-in">
      <div className="w-full max-w-xl bg-slate-900 border-2 border-rose-500/40 rounded-3xl shadow-2xl p-6 sm:p-7 space-y-6 text-slate-100 relative overflow-hidden">
        {/* Glow accent */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-72 h-24 bg-rose-500/10 blur-3xl pointer-events-none" />

        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-rose-600 to-rose-400 text-white flex items-center justify-center shadow-lg shadow-rose-500/30 animate-pulse">
              <HeartHandshake className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-[10px] uppercase font-mono tracking-wider px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30">
                  Bilingual Safety Guard
                </span>
                <span className="text-xs text-slate-400">CZ / EN</span>
              </div>
              <h3 className="text-lg sm:text-xl font-bold text-slate-100">
                {lang === 'cs'
                  ? 'Záleží nám na vás. Nejste v tom sami.'
                  : 'We care about you. You are not alone.'}
              </h3>
            </div>
          </div>

          {/* Language Toggle */}
          <div className="flex items-center bg-slate-950 border border-slate-800 rounded-xl p-0.5 text-xs font-medium">
            <button
              onClick={() => setLang('cs')}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                lang === 'cs' ? 'bg-rose-500 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              CZ
            </button>
            <button
              onClick={() => setLang('en')}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                lang === 'en' ? 'bg-rose-500 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              EN
            </button>
          </div>
        </div>

        {/* Empathetic Message Banner */}
        <div className="p-4 bg-rose-950/40 border border-rose-800/60 rounded-2xl text-xs sm:text-sm text-rose-200/90 leading-relaxed space-y-1">
          {lang === 'cs' ? (
            <p>
              Váš text obsahuje slova naznačující krizovou nebo psychicky náročnou situaci.
              Každý problém má řešení a pomoc je k dispozici <strong>zcela zdarma, anonymně a okamžitě</strong>.
            </p>
          ) : (
            <p>
              Your message contains words indicating a crisis or severe emotional distress.
              You do not have to carry this alone — compassionate help is available <strong>free, confidential, and 24/7</strong>.
            </p>
          )}
        </div>

        {/* Hotlines Grid with Direct Calling (tel: links) */}
        <div className="space-y-2.5 max-h-[260px] overflow-y-auto pr-1">
          <div className="text-xs font-semibold text-slate-300 flex items-center justify-between">
            <span>{lang === 'cs' ? 'Dostupné krizové linky (volání zdarma):' : 'Available Crisis Helplines (Free Call):'}</span>
            <span className="text-[11px] text-emerald-400 flex items-center space-x-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
              <span>24/7 Aktivní</span>
            </span>
          </div>

          {CRISIS_HOTLINES.map((hotline) => (
            <div
              key={hotline.phone}
              className="p-3 bg-slate-950/80 border border-slate-800 hover:border-rose-500/40 rounded-2xl transition-all flex items-center justify-between group"
            >
              <div className="space-y-0.5 pr-2">
                <div className="flex items-center space-x-2">
                  <span className="font-semibold text-xs sm:text-sm text-slate-200">
                    {hotline.name}
                  </span>
                  {hotline.isFree && (
                    <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                      Zdarma
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-400 line-clamp-1">
                  {lang === 'cs' ? hotline.descriptionCz : hotline.descriptionEn}
                </p>
              </div>

              <div className="flex items-center space-x-2 flex-shrink-0">
                {hotline.url && (
                  <a
                    href={hotline.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                    title="Otevřít krizový chat / web"
                  >
                    <MessageCircle className="w-4 h-4" />
                  </a>
                )}
                <a
                  href={`tel:${hotline.phone}`}
                  className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400 text-white text-xs font-bold flex items-center space-x-1.5 shadow-md shadow-rose-500/20 transition-all group-hover:scale-105"
                >
                  <PhoneCall className="w-3.5 h-3.5" />
                  <span>{hotline.phone}</span>
                </a>
              </div>
            </div>
          ))}
        </div>

        {/* Footer Actions */}
        <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-medium transition-colors"
          >
            {lang === 'cs' ? 'Zavřít a upravit text' : 'Close and edit text'}
          </button>

          <button
            onClick={() => {
              onProceedAnyway();
              onClose();
            }}
            className="px-4 py-2 rounded-xl bg-slate-850 hover:bg-slate-800 text-slate-400 hover:text-slate-200 text-xs transition-colors flex items-center space-x-1"
          >
            <span>{lang === 'cs' ? 'Přesto odeslat zprávu' : 'Send message anyway'}</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
};
