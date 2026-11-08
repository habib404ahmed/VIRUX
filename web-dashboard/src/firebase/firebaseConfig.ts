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
    `Please copy 'web-dashboard/.env.example' to 'web-dashboard/.env.local' and supply your Firebase virux-504a5 project credentials.`
  )
}

// ─── Firebase app config ─────────────────────────────────────

const firebaseConfig = {
  apiKey:            (import.meta.env.VITE_FIREBASE_API_KEY as string) || '',
  authDomain:        (import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string) || 'virux-504a5.firebaseapp.com',
  projectId:         (import.meta.env.VITE_FIREBASE_PROJECT_ID as string) || 'virux-504a5',
  storageBucket:     (import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string) || 'virux-504a5.firebasestorage.app',
  messagingSenderId: (import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string) || '',
  appId:             (import.meta.env.VITE_FIREBASE_APP_ID as string) || '',
}

// ─── Singleton initialization ────────────────────────────────
// In Phase 2 UI/UX preview, if VITE_FIREBASE_API_KEY is not configured yet,
// log a clear warning and export null instances rather than crashing the UI bundle.

function getOrInitializeApp(): FirebaseApp | null {
  if (getApps().length > 0) {
    return getApps()[0]!
  }

  if (!firebaseConfig.apiKey) {
    console.warn(
      `[VIRUX Firebase Notice] 'VITE_FIREBASE_API_KEY' is not configured.\n` +
      `Running in UI/UX Preview Mode. Real backend services will connect once .env.local is supplied in Phase 3.`
    )
    return null
  }

  return initializeApp(firebaseConfig)
}

let app: FirebaseApp | null = null
let authInstance: Auth | null = null
let dbInstance: Firestore | null = null

try {
  app = getOrInitializeApp()
  if (app) {
    authInstance = getAuth(app)
    dbInstance = getFirestore(app)
  }
} catch (err) {
  console.warn('[VIRUX Firebase Initialization Warning]', err)
}

export const auth: Auth | null = authInstance
export const db: Firestore | null = dbInstance

export const isFirebaseConfigured: boolean = Boolean(
  firebaseConfig.apiKey && firebaseConfig.apiKey !== 'your_api_key_here'
)

export function requireAuth(): Auth {
  if (!authInstance) {
    throw new Error(
      `[VIRUX Firebase Error] Firebase Authentication is unavailable.\n` +
      `Ensure 'web-dashboard/.env.local' is created with valid 'VITE_FIREBASE_API_KEY' credentials for virux-504a5.`
    )
  }
  return authInstance
}

export function requireDb(): Firestore {
  if (!dbInstance) {
    throw new Error(
      `[VIRUX Firebase Error] Cloud Firestore is unavailable.\n` +
      `Ensure 'web-dashboard/.env.local' is created with valid credentials for virux-504a5.`
    )
  }
  return dbInstance
}

export default app
