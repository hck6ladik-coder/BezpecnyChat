import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import {
  getAuth,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  ConfirmationResult,
  User,
  Auth,
} from 'firebase/auth';

export interface FirebaseClientConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId: string;
}

const FIREBASE_CONFIG_STORAGE_KEY = 'keccak_chat_firebase_config';

/**
 * Získá uloženou nebo ENV konfiguraci Firebase
 */
export const getFirebaseConfig = (): FirebaseClientConfig | null => {
  try {
    const saved = localStorage.getItem(FIREBASE_CONFIG_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.apiKey && parsed.projectId) {
        return parsed;
      }
    }
  } catch {}

  // Fallback na Vite ENV proměnné
  const envApiKey = (import.meta as any).env?.VITE_FIREBASE_API_KEY;
  const envProjectId = (import.meta as any).env?.VITE_FIREBASE_PROJECT_ID;
  const envAuthDomain = (import.meta as any).env?.VITE_FIREBASE_AUTH_DOMAIN || `${envProjectId}.firebaseapp.com`;
  const envAppId = (import.meta as any).env?.VITE_FIREBASE_APP_ID;

  if (envApiKey && envProjectId) {
    return {
      apiKey: envApiKey,
      authDomain: envAuthDomain,
      projectId: envProjectId,
      appId: envAppId || '1:1234567890:web:abcdef',
    };
  }

  return null;
};

/**
 * Uloží Firebase konfiguraci do localStorage pro rychlé nastavení přímo v UI
 */
export const saveFirebaseConfig = (config: FirebaseClientConfig) => {
  localStorage.setItem(FIREBASE_CONFIG_STORAGE_KEY, JSON.stringify(config));
};

/**
 * Odstraní Firebase konfiguraci
 */
export const clearFirebaseConfig = () => {
  localStorage.removeItem(FIREBASE_CONFIG_STORAGE_KEY);
};

export const isFirebaseConfigured = (): boolean => {
  return getFirebaseConfig() !== null;
};

let cachedApp: FirebaseApp | null = null;
let cachedAuth: Auth | null = null;

export const getFirebaseAuth = (): Auth => {
  const config = getFirebaseConfig();
  if (!config) {
    throw new Error('Firebase konfigurace nebyla nalezena. Zadejte API klíč a Project ID v nastavení.');
  }

  if (getApps().length === 0) {
    cachedApp = initializeApp(config);
  } else {
    cachedApp = getApp();
  }

  if (!cachedAuth) {
    cachedAuth = getAuth(cachedApp);
    // Nastavit jazyk pro SMS na češtinu
    cachedAuth.languageCode = 'cs';
  }

  return cachedAuth;
};

/**
 * Vytvoří a vyrenderuje reCAPTCHA verifier pro ochranu proti spamu
 */
export const createRecaptchaVerifier = (
  containerIdOrElement: string | HTMLElement,
  onSolved?: () => void,
  onExpired?: () => void
): RecaptchaVerifier => {
  const authInstance = getFirebaseAuth();
  
  const verifier = new RecaptchaVerifier(authInstance, containerIdOrElement, {
    size: 'invisible',
    callback: () => {
      if (onSolved) onSolved();
    },
    'expired-callback': () => {
      if (onExpired) onExpired();
    },
  });

  return verifier;
};

/**
 * Odešle reálnou SMS zprávu s OTP kódem přes Firebase
 */
export const sendFirebasePhoneOtp = async (
  phoneNumber: string,
  verifier: RecaptchaVerifier
): Promise<ConfirmationResult> => {
  const authInstance = getFirebaseAuth();
  return await signInWithPhoneNumber(authInstance, phoneNumber, verifier);
};

/**
 * Ověří zadaný 6místný OTP kód
 */
export const verifyFirebasePhoneOtp = async (
  confirmation: ConfirmationResult,
  code: string
): Promise<{ user: User; idToken: string }> => {
  const userCredential = await confirmation.confirm(code);
  const user = userCredential.user;
  const idToken = await user.getIdToken();
  return { user, idToken };
};
