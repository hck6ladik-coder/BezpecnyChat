import { describe, it, expect } from 'vitest';
import { detectCrisisIntent, CRISIS_HOTLINES } from '../services/safetyGuard';
import { analyzeLocalSentiment, analyzeSentimentDistilBert } from '../services/sentimentService';

describe('Bilingual Safety Guard (CZ / EN)', () => {
  it('detects Czech crisis and suicide trigger phrases', () => {
    const res1 = detectCrisisIntent('Ahoj, chci se zabít, už nemůžu.');
    expect(res1.isTriggered).toBe(true);
    expect(res1.detectedLanguage).toBe('cs');
    expect(res1.matchedKeywords.length).toBeGreaterThan(0);

    const res2 = detectCrisisIntent('Mám myšlenky na ukončit svůj život.');
    expect(res2.isTriggered).toBe(true);
  });

  it('detects English crisis and suicide trigger phrases', () => {
    const res1 = detectCrisisIntent('I want to kill myself today');
    expect(res1.isTriggered).toBe(true);
    expect(res1.detectedLanguage).toBe('en');

    const res2 = detectCrisisIntent('I feel like I want to die');
    expect(res2.isTriggered).toBe(true);
  });

  it('does not trigger on normal safe conversation', () => {
    const res = detectCrisisIntent('Ahoj, jak se dneska máš? Sejdeme se na oběd?');
    expect(res.isTriggered).toBe(false);
    expect(res.matchedKeywords).toHaveLength(0);
  });

  it('provides all necessary direct emergency hotlines', () => {
    expect(CRISIS_HOTLINES.length).toBeGreaterThanOrEqual(4);
    const linkaBezpeci = CRISIS_HOTLINES.find((h) => h.phone === '116111');
    expect(linkaBezpeci).toBeDefined();
    expect(linkaBezpeci?.isFree).toBe(true);

    const emergency112 = CRISIS_HOTLINES.find((h) => h.phone === '112');
    expect(emergency112).toBeDefined();
  });
});

describe('Sentiment Analysis & DistilBERT Service', () => {
  it('correctly classifies positive sentiment locally', () => {
    const res = analyzeLocalSentiment('Dnes je to naprosto skvělé a úžasné, děkuji moc!');
    expect(res.label).toBe('POSITIVE');
    expect(res.czechLabel).toBe('Pozitivní');
    expect(res.score).toBeGreaterThan(0.6);
  });

  it('correctly classifies negative sentiment locally', () => {
    const res = analyzeLocalSentiment('To je hrozné a hrozně špatné, obrovský problém.');
    expect(res.label).toBe('NEGATIVE');
    expect(res.czechLabel).toBe('Negativní');
    expect(res.score).toBeGreaterThan(0.6);
  });

  it('falls back gracefully to neutral on neutral text', () => {
    const res = analyzeLocalSentiment('Zítra v devět hodin ráno.');
    expect(res.label).toBe('NEUTRAL');
  });
});
