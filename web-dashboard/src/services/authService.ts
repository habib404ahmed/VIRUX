// ============================================================
// VIRUX Web Dashboard — Authentication Service
// Modular Firebase SDK implementation (Auth + Firestore)
// ============================================================

import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  signOut,
  updateProfile,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  type User,
} from 'firebase/auth'
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore'
import { requireAuth, requireDb } from '../firebase/firebaseConfig'
import type { ViruxUserProfile } from '../types/auth'

const googleProvider = new GoogleAuthProvider()
googleProvider.setCustomParameters({ prompt: 'select_account' })

/**
 * Maps Firebase Auth error codes to user-friendly error messages.
 */
export function mapFirebaseAuthError(error: any): string {
  if (!error) return 'An unexpected error occurred.'

  const code: string = error.code || ''
  const message: string = error.message || ''

  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/user-not-found':
    case 'auth/wrong-password':
      return 'Invalid email or password. Please verify your credentials.'
    case 'auth/email-already-in-use':
      return 'This email address is already registered. Please sign in instead.'
    case 'auth/weak-password':
      return 'Password should be at least 6 characters.'
    case 'auth/invalid-email':
      return 'Please enter a valid email address.'
    case 'auth/popup-blocked':
      return 'Google sign-in popup was blocked by your browser. Please allow popups for this site.'
    case 'auth/popup-closed-by-user':
      return 'Sign-in cancelled before completion.'
    case 'auth/network-request-failed':
      return 'Network connection failed. Please check your internet connection.'
    case 'auth/too-many-requests':
      return 'Too many failed login attempts. Access is temporarily suspended. Please try again later.'
    case 'auth/user-disabled':
      return 'This account has been disabled. Please contact VIRUX security support.'
    default:
      if (message.includes('Firebase is unavailable') || message.includes('API key')) {
        return message
      }
      return 'Authentication failed. Please verify your details and try again.'
  }
}

/**
 * Creates or synchronizes the user profile in Firestore (/users/{uid}).
 */
export async function syncUserProfile(
  user: User,
  additionalData: { displayName?: string; provider?: string } = {}
): Promise<ViruxUserProfile> {
  const db = requireDb()
  const userRef = doc(db, 'users', user.uid)

  const docSnap = await getDoc(userRef)
  const now = serverTimestamp()

  if (!docSnap.exists()) {
    const primaryProvider =
      additionalData.provider ||
      (user.providerData && user.providerData[0]?.providerId) ||
      'password'

    const profileData: ViruxUserProfile = {
      uid: user.uid,
      displayName: additionalData.displayName || user.displayName || 'VIRUX User',
      email: user.email || '',
      photoUrl: user.photoURL || null,
      provider: primaryProvider,
      createdAt: now,
      updatedAt: now,
      accountStatus: 'active',
    }

    await setDoc(userRef, profileData)
    return profileData
  } else {
    // Existing user: touch updatedAt
    await updateDoc(userRef, {
      updatedAt: now,
      ...(additionalData.displayName && { displayName: additionalData.displayName }),
    })
    return docSnap.data() as ViruxUserProfile
  }
}

/**
 * Retrieves an existing user profile from Firestore.
 */
export async function fetchUserProfile(uid: string): Promise<ViruxUserProfile | null> {
  const db = requireDb()
  const userRef = doc(db, 'users', uid)
  const docSnap = await getDoc(userRef)

  if (docSnap.exists()) {
    return docSnap.data() as ViruxUserProfile
  }
  return null
}

/**
 * Signs in with Email and Password.
 */
export async function loginWithEmail(
  email: string,
  pass: string,
  rememberMe: boolean = true
): Promise<User> {
  const auth = requireAuth()
  await setPersistence(
    auth,
    rememberMe ? browserLocalPersistence : browserSessionPersistence
  )

  const credential = await signInWithEmailAndPassword(auth, email.trim(), pass)
  await syncUserProfile(credential.user)
  return credential.user
}

/**
 * Registers a new user with Email, Password, and Display Name.
 */
export async function registerWithEmail(
  email: string,
  pass: string,
  displayName: string
): Promise<User> {
  const auth = requireAuth()
  const credential = await createUserWithEmailAndPassword(auth, email.trim(), pass)

  if (displayName.trim()) {
    await updateProfile(credential.user, {
      displayName: displayName.trim(),
    })
  }

  await syncUserProfile(credential.user, {
    displayName: displayName.trim(),
    provider: 'password',
  })

  return credential.user
}

/**
 * Initiates Google OAuth popup sign-in.
 */
export async function loginWithGoogle(): Promise<User> {
  const auth = requireAuth()
  const credential = await signInWithPopup(auth, googleProvider)

  await syncUserProfile(credential.user, {
    displayName: credential.user.displayName || 'Google User',
    provider: 'google.com',
  })

  return credential.user
}

/**
 * Sends a password reset email via Firebase Auth.
 */
export async function sendResetEmail(email: string): Promise<void> {
  const auth = requireAuth()
  await sendPasswordResetEmail(auth, email.trim())
}

/**
 * Signs out the current Firebase user.
 */
export async function logoutUser(): Promise<void> {
  const auth = requireAuth()
  await signOut(auth)
}

