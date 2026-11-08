// ============================================================
// VIRUX Shared Types — User Profile & Settings
// ============================================================

export interface UserSettings {
  notificationsEnabled: boolean
  theme: 'dark'
  language: string
}

export interface ViruxUserProfile {
  uid: string
  email: string
  displayName: string
  photoURL: string | null
  createdAt: string // ISO date-time string
  updatedAt: string // ISO date-time string
  plan: 'free' | 'pro'
  settings: UserSettings
}
