/**
 * Bilingual Safety Guard Service (Czech & English)
 * 
 * Lightning-fast local crisis detection executed BEFORE message encryption.
 * Detects suicide, self-harm, and severe psychological distress intents.
 */

export interface CrisisContact {
  name: string;
  phone: string;
  descriptionCz: string;
  descriptionEn: string;
  isFree: boolean;
  available: string;
  type: 'general' | 'youth' | 'emergency' | 'chat';
  url?: string;
}

export interface CrisisDetectionResult {
  isTriggered: boolean;
  detectedLanguage: 'cs' | 'en' | 'both';
  matchedKeywords: string[];
  severity: 'high' | 'medium';
}

// Emergency Hotlines (Czech Republic & International)
export const CRISIS_HOTLINES: CrisisContact[] = [
  {
    name: 'Linka bezpečí (pro děti a mladistvé)',
    phone: '116111',
    descriptionCz: 'Bezplatná, anonymní pomoc pro děti, studenty a mladé lidi do 26 let. 24/7.',
    descriptionEn: 'Free, anonymous support for youth up to 26 years old. Available 24/7.',
    isFree: true,
    available: '24/7 Nonstop',
    type: 'youth',
    url: 'https://www.linkabezpeci.cz',
  },
  {
    name: 'Linka první psychické pomoci (pro dospělé)',
    phone: '116123',
    descriptionCz: 'Krizová pomoc pro dospělé v těžkých životních situacích a psychické tísni.',
    descriptionEn: 'Crisis psychological helpline for adults in severe distress.',
    isFree: true,
    available: '24/7 Nonstop',
    type: 'general',
    url: 'https://linkapsychickepomoci.cz',
  },
  {
    name: 'Centrum krizové intervence (CKI Bohnice)',
    phone: '284016666',
    descriptionCz: 'Přímá psychiatrická a psychologická krizová linka pro celou ČR.',
    descriptionEn: 'Direct psychiatric and psychological crisis intervention helpline.',
    isFree: false,
    available: '24/7 Nonstop',
    type: 'general',
    url: 'https://www.bohnice.cz/krizova-pomoc',
  },
  {
    name: '988 Suicide & Crisis Lifeline (US & International)',
    phone: '988',
    descriptionCz: 'Mezinárodní bezplatná linka první psychické pomoci a prevence sebevražd.',
    descriptionEn: 'Free, confidential support for people in suicidal crisis or mental health distress.',
    isFree: true,
    available: '24/7 Nonstop',
    type: 'general',
    url: 'https://988lifeline.org',
  },
  {
    name: 'Tísňová linka / Emergency (SOS)',
    phone: '112',
    descriptionCz: 'Jednotné evropské číslo tísňového volání v případě bezprostředního ohrožení života.',
    descriptionEn: 'European emergency phone number for immediate life-threatening situations.',
    isFree: true,
    available: '24/7 Nonstop',
    type: 'emergency',
  },
];

// Regex patterns for Czech crisis keywords
const CZECH_CRISIS_PATTERNS = [
  /\b(chci\s+se\s+zab[ií]t)\b/i,
  /\b(chci\s+um[rř][ií]t)\b/i,
  /\b(sebevraž[d|e|u|y]|sebevra[zž]edn[eéýá])\b/i,
  /\b(ukon[cč]it\s+(sv[uů]j\s+)?[zž]ivot)\b/i,
  /\b(vz[ií]t\s+si\s+[zž]ivot)\b/i,
  /\b(nechci\s+u[zž]\s+[zž][ií]t)\b/i,
  /\b(u[zž]\s+tady\s+nechci\s+b[yý]t)\b/i,
  /\b(sebepo[sš]kozov[aá]n[ií]|[rř]ezat\s+se|ubl[ií]zit\s+si)\b/i,
  /\b(chci\s+sko[cč]it|ob[eě]sit\s+se|p[rř]ed[aá]vkovat\s+se)\b/i,
  /\b(nem[aá]m\s+pro\s+co\s+[zž][ií]t)\b/i,
];

// Regex patterns for English crisis keywords
const ENGLISH_CRISIS_PATTERNS = [
  /\b(want\s+to\s+die|wanna\s+die)\b/i,
  /\b(kill\s+myself|killing\s+myself)\b/i,
  /\b(suicid(e|al|ing))\b/i,
  /\b(end\s+my\s+life|ending\s+my\s+life)\b/i,
  /\b(don'?t\s+want\s+to\s+live\s+(anymore)?)\b/i,
  /\b(self[-\s]?harm|cutting\s+myself|hurt\s+myself)\b/i,
  /\b(take\s+my\s+(own\s+)?life)\b/i,
  /\b(better\s+off\s+dead)\b/i,
  /\b(hang\s+myself|overdose\s+myself|jump\s+off)\b/i,
];

/**
 * Scan text for crisis indicators (Czech & English)
 */
export function detectCrisisIntent(text: string): CrisisDetectionResult {
  if (!text || typeof text !== 'string') {
    return { isTriggered: false, detectedLanguage: 'cs', matchedKeywords: [], severity: 'medium' };
  }

  const cleanText = text.trim();
  const matchedCz: string[] = [];
  const matchedEn: string[] = [];

  for (const pattern of CZECH_CRISIS_PATTERNS) {
    const match = cleanText.match(pattern);
    if (match) {
      matchedCz.push(match[0]);
    }
  }

  for (const pattern of ENGLISH_CRISIS_PATTERNS) {
    const match = cleanText.match(pattern);
    if (match) {
      matchedEn.push(match[0]);
    }
  }

  const isTriggered = matchedCz.length > 0 || matchedEn.length > 0;
  let detectedLanguage: 'cs' | 'en' | 'both' = 'cs';
  if (matchedCz.length > 0 && matchedEn.length > 0) {
    detectedLanguage = 'both';
  } else if (matchedEn.length > 0) {
    detectedLanguage = 'en';
  }

  const allMatched = [...matchedCz, ...matchedEn];

  return {
    isTriggered,
    detectedLanguage,
    matchedKeywords: allMatched,
    severity: allMatched.length > 1 ? 'high' : 'medium',
  };
}
