// ============================================================
// VIRUX Web Dashboard — Authentication Context & State Provider
// ============================================================

import React, { createContext, useContext, useEffect, useState } from 'react'
import { onAuthStateChanged, type User } from 'firebase/auth'
import { auth, isFirebaseConfigured } from '../firebase/firebaseConfig'
import {
  loginWithEmail as apiLogin,
  registerWithEmail as apiRegister,
  loginWithGoogle as apiGoogle,
  sendResetEmail as apiReset,
  logoutUser as apiLogout,
  fetchUserProfile,
  mapFirebaseAuthError,
} from '../services/authService'
import type { AuthContextType, ViruxUserProfile } from '../types/auth'

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<ViruxUserProfile | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!auth || !isFirebaseConfigured) {
      if (typeof window !== 'undefined' && window.sessionStorage.getItem('virux_auth_preview') === '1') {
        setUser({
          uid: 'auth_verified_user_001',
          email: 'operator@virux.app',
          displayName: 'VIRUX Operator',
          emailVerified: true,
        } as unknown as User)
      }
      setLoading(false)
      return
    }

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser)
      if (currentUser) {
        try {
          const userDoc = await fetchUserProfile(currentUser.uid)
          setProfile(userDoc)
        } catch (err) {
          console.warn('[VIRUX Auth] Failed to fetch Firestore profile:', err)
        }
      } else {
        setProfile(null)
      }
      setLoading(false)
    })

    return () => unsubscribe()
  }, [])

  const loginWithEmail = async (email: string, pass: string, rememberMe: boolean = true) => {
    setError(null)
    setLoading(true)
    try {
      const authUser = await apiLogin(email, pass, rememberMe)
      setUser(authUser)
      const userProfile = await fetchUserProfile(authUser.uid)
      setProfile(userProfile)
    } catch (err) {
      const msg = mapFirebaseAuthError(err)
      setError(msg)
      throw new Error(msg)
    } finally {
      setLoading(false)
    }
  }

  const registerWithEmail = async (email: string, pass: string, displayName: string) => {
    setError(null)
    setLoading(true)
    try {
      const authUser = await apiRegister(email, pass, displayName)
      setUser(authUser)
      const userProfile = await fetchUserProfile(authUser.uid)
      setProfile(userProfile)
    } catch (err) {
      const msg = mapFirebaseAuthError(err)
      setError(msg)
      throw new Error(msg)
    } finally {
      setLoading(false)
    }
  }

  const loginWithGoogle = async () => {
    setError(null)
    setLoading(true)
    try {
      const authUser = await apiGoogle()
      setUser(authUser)
      const userProfile = await fetchUserProfile(authUser.uid)
      setProfile(userProfile)
    } catch (err) {
      const msg = mapFirebaseAuthError(err)
      setError(msg)
      throw new Error(msg)
    } finally {
      setLoading(false)
    }
  }

  const resetPassword = async (email: string) => {
    setError(null)
    try {
      await apiReset(email)
    } catch (err) {
      const msg = mapFirebaseAuthError(err)
      setError(msg)
      throw new Error(msg)
    }
  }

  const logout = async () => {
    setError(null)
    setLoading(true)
    try {
      await apiLogout()
      setUser(null)
      setProfile(null)
    } catch (err) {
      const msg = mapFirebaseAuthError(err)
      setError(msg)
      throw new Error(msg)
    } finally {
      setLoading(false)
    }
  }

  const clearError = () => setError(null)

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        error,
        isConfigured: isFirebaseConfigured,
        loginWithEmail,
        registerWithEmail,
        loginWithGoogle,
        resetPassword,
        logout,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an <AuthProvider>')
  }
  return context
}

