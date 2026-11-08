// ============================================================
// VIRUX Web Dashboard — Firebase Configuration
// Using the modular Firebase JavaScript SDK (v9+)
//
// All sensitive values come from environment variables.
// Never hardcode API keys or project credentials here.
// See .env.example for required variables.
// ============================================================

import { initializeApp, getApps, type FirebaseApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'
import { getFirestore, type Firestore } from 'firebase/firestore'
import { getAnalytics, isSupported, type Analytics } from 'firebase/analytics'

// ─── Environment variable validation ────────────────────────

const requiredEnvVars = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
] as const

const missingEnvVars = requiredEnvVars.filter(
  (key) => !import.meta.env[key] || import.meta.env[key] === 'your_api_key_here'
)

if (missingEnvVars.length > 0) {
  console.warn(
    `[VIRUX Firebase Configuration Notice]\n` +
    `The following required environment variable(s) are missing or set to placeholder defaults:\n` +
    missingEnvVars.map((v) => `  - ${v}`).join('\n') + '\n\n' +
    `Please configure your Firebase virux-504a5 project credentials in .env.local or Vercel Environment Variables.`
  )
}

// ─── Firebase app config ─────────────────────────────────────

const firebaseConfig = {
  apiKey:            (import.meta.env.VITE_FIREBASE_API_KEY as string) || '',
  authDomain:        (import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string) || 'virux-504a5.firebaseapp.com',
  projectId:         (import.meta.env.VITE_FIREBASE_PROJECT_ID as string) || 'virux-504a5',
  storageBucket:     (import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string) || 'virux-504a5.firebasestorage.app',
  messagingSenderId: (import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string) || '1000533612172',
  appId:             (import.meta.env.VITE_FIREBASE_APP_ID as string) || '1:1000533612172:web:b8ee32cce8a32abc92cda9',
  measurementId:     (import.meta.env.VITE_FIREBASE_MEASUREMENT_ID as string) || 'G-DF3FS76GZV',
}

// ─── Singleton initialization ────────────────────────────────
// Initializes Firebase only once, reusing existing instance if present.
// If API key is not yet supplied, avoids crashing so UI/UX remains inspectable.

function getOrInitializeApp(): FirebaseApp | null {
  const existingApps = getApps()
  if (existingApps.length > 0) {
    return existingApps[0]!
  }

  if (!firebaseConfig.apiKey) {
    console.warn(
      `[VIRUX Firebase Notice] 'VITE_FIREBASE_API_KEY' is not configured.\n` +
      `Running in UI/UX Preview Mode. Real backend services connect when VITE_FIREBASE_API_KEY is supplied.`
    )
    return null
  }

  return initializeApp(firebaseConfig)
}

let app: FirebaseApp | null = null
let authInstance: Auth | null = null
let dbInstance: Firestore | null = null
let analyticsInstance: Analytics | null = null

try {
  app = getOrInitializeApp()
  if (app) {
    authInstance = getAuth(app)
    dbInstance = getFirestore(app)

    // Safely initialize Firebase Analytics only in supported browser environments
    if (typeof window !== 'undefined' && firebaseConfig.measurementId) {
      isSupported().then((supported) => {
        if (supported && app) {
          analyticsInstance = getAnalytics(app)
        }
      }).catch((err) => {
        console.warn('[VIRUX Firebase Analytics Notice]', err)
      })
    }
  }
} catch (err) {
  console.warn('[VIRUX Firebase Initialization Warning]', err)
}

export const auth: Auth | null = authInstance
export const db: Firestore | null = dbInstance
export const analytics: Analytics | null = analyticsInstance

export const isFirebaseConfigured: boolean = Boolean(
  firebaseConfig.apiKey &&
  firebaseConfig.apiKey !== 'your_api_key_here' &&
  firebaseConfig.apiKey.length > 10
)

export function requireAuth(): Auth {
  if (!authInstance) {
    throw new Error(
      `[VIRUX Firebase Error] Firebase Authentication is unavailable.\n` +
      `Ensure 'VITE_FIREBASE_API_KEY' is configured with valid credentials for virux-504a5.`
    )
  }
  return authInstance
}

export function requireDb(): Firestore {
  if (!dbInstance) {
    throw new Error(
      `[VIRUX Firebase Error] Cloud Firestore is unavailable.\n` +
      `Ensure 'VITE_FIREBASE_API_KEY' is configured with valid credentials for virux-504a5.`
    )
  }
  return dbInstance
}

export default app
