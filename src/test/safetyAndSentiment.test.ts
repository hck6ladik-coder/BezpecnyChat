import { describe, it, expect } from 'vitest';
import { analyzeLocalSentiment, analyzeSentimentDistilBert } from '../services/sentimentService';

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
