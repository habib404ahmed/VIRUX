// ============================================================
// VIRUX Web Dashboard — Authentication Types & Contracts
// ============================================================

import type { User } from 'firebase/auth'

export interface ViruxUserProfile {
  uid: string
  displayName: string
  email: string
  photoUrl: string | null
  provider: string
  createdAt: any
  updatedAt: any
  accountStatus: 'active' | 'suspended' | 'pending'
}

export interface AuthContextType {
  user: User | null
  profile: ViruxUserProfile | null
  loading: boolean
  error: string | null
  isConfigured: boolean
  loginWithEmail: (email: string, password: string, rememberMe?: boolean) => Promise<void>
  registerWithEmail: (email: string, password: string, displayName: string) => Promise<void>
  loginWithGoogle: () => Promise<void>
  resetPassword: (email: string) => Promise<void>
  logout: () => Promise<void>
  clearError: () => void
}

