/**
 * Hugging Face DistilBERT Sentiment Analysis Service
 * 
 * Communicates with Hugging Face Inference API for DistilBERT sentiment classification
 * with offline local fallback.
 */

export interface SentimentResult {
  label: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  score: number;
  emoji: string;
  czechLabel: string;
  source: 'huggingface_distilbert' | 'local_heuristic';
}

const HF_MODEL = 'distilbert/distilbert-base-uncased-finetuned-sst-2-english';
const HF_API_URL = `https://api-inference.huggingface.co/models/${HF_MODEL}`;

// In-memory cache for fast repeated queries
const sentimentCache = new Map<string, SentimentResult>();

// Czech & English positive and negative word lists for instant offline fallback
const POSITIVE_WORDS = [
  'skvělé', 'super', 'výborně', 'dobře', 'paráda', 'děkuji', 'miluji', 'rád', 'radost', 'krása',
  'perfektní', 'bezva', 'úžasné', 'gratuluji', 'láska', 'štěstí', 'great', 'awesome', 'good',
  'love', 'happy', 'excellent', 'wonderful', 'perfect', 'thanks', 'glad', 'enjoy', 'best'
];

const NEGATIVE_WORDS = [
  'špatné', 'hrozné', 'děs', 'smutek', 'zlo', 'nenávidím', 'bolest', 'problém', 'chyba', 'zklamání',
  'neštěstí', 'hnus', 'zlomený', 'bad', 'terrible', 'awful', 'sad', 'hate', 'pain', 'problem',
  'error', 'disappointed', 'ugly', 'broken', 'angry', 'worst'
];

/**
 * Fast Local Heuristic Sentiment Fallback
 */
export function analyzeLocalSentiment(text: string): SentimentResult {
  const lower = text.toLowerCase();
  let posCount = 0;
  let negCount = 0;

  for (const word of POSITIVE_WORDS) {
    if (lower.includes(word)) posCount++;
  }

  for (const word of NEGATIVE_WORDS) {
    if (lower.includes(word)) negCount++;
  }

  if (posCount > negCount) {
    const score = Math.min(0.6 + posCount * 0.1, 0.98);
    return {
      label: 'POSITIVE',
      score,
      emoji: '😊',
      czechLabel: 'Pozitivní',
      source: 'local_heuristic',
    };
  } else if (negCount > posCount) {
    const score = Math.min(0.6 + negCount * 0.1, 0.98);
    return {
      label: 'NEGATIVE',
      score,
      emoji: '😟',
      czechLabel: 'Negativní',
      source: 'local_heuristic',
    };
  }

  return {
    label: 'NEUTRAL',
    score: 0.5,
    emoji: '😐',
    czechLabel: 'Neutrální',
    source: 'local_heuristic',
  };
}

/**
 * Analyze Sentiment using Hugging Face DistilBERT API
 */
export async function analyzeSentimentDistilBert(
  text: string,
  apiKey?: string
): Promise<SentimentResult> {
  const trimmed = text.trim();
  if (!trimmed) {
    return {
      label: 'NEUTRAL',
      score: 1.0,
      emoji: '😐',
      czechLabel: 'Neutrální',
      source: 'local_heuristic',
    };
  }

  if (sentimentCache.has(trimmed)) {
    return sentimentCache.get(trimmed)!;
  }

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500); // 3.5s timeout

    const response = await fetch(HF_API_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({ inputs: trimmed }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      // DistilBERT output format: [[{ label: 'POSITIVE', score: 0.99 }, { label: 'NEGATIVE', score: 0.01 }]]
      if (Array.isArray(data) && data[0] && Array.isArray(data[0])) {
        const sorted = data[0].sort((a: any, b: any) => b.score - a.score);
        const top = sorted[0];
        const isPos = top.label === 'POSITIVE';

        const result: SentimentResult = {
          label: isPos ? 'POSITIVE' : 'NEGATIVE',
          score: top.score,
          emoji: isPos ? (top.score > 0.85 ? '✨😊' : '🙂') : (top.score > 0.85 ? '💔😟' : '🙁'),
          czechLabel: isPos ? 'Pozitivní' : 'Negativní',
          source: 'huggingface_distilbert',
        };

        sentimentCache.set(trimmed, result);
        return result;
      }
    }
  } catch {
    // Network / timeout / CORS fallback to local heuristic
  }

  const localResult = analyzeLocalSentiment(trimmed);
  sentimentCache.set(trimmed, localResult);
  return localResult;
}
