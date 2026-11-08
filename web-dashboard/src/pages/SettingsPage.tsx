import React, { useState } from 'react'
import {
  Check,
  Moon,
  Sun,
  Laptop,
  LogOut,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react'
import { PageContainer } from '../components/PageContainer'
import { DashboardCard } from '../components/DashboardCard'
import { ActionButton } from '../components/ActionButton'
import { useAuth } from '../hooks/useAuth'

export const SettingsPage: React.FC = () => {
  const { user, profile, logout } = useAuth()
  const [selectedTheme, setSelectedTheme] = useState<'dark' | 'light' | 'system'>('dark')
  const [accentColor, setAccentColor] = useState<string>('#6366F1')
  const [autoSync, setAutoSync] = useState(true)
  const [notifSound, setNotifSound] = useState(false)

  const accentOptions = [
    { label: 'Indigo', color: '#6366F1' },
    { label: 'Cyan', color: '#06B6D4' },
    { label: 'Emerald', color: '#22C55E' },
    { label: 'Violet', color: '#8B5CF6' },
  ]

  const displayName = profile?.displayName || user?.displayName || user?.email?.split('@')[0] || 'VIRUX User'
  const initials = displayName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .substring(0, 2)
    .toUpperCase()

  const isEmailVerified = Boolean(user?.emailVerified)

  const handleLogout = async () => {
    try {
      await logout()
    } catch (err) {
      console.error('Logout error:', err)
    }
  }

  return (
    <PageContainer>
      {/* ─── Page Title Header ───────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-100">Settings & Ecosystem</h1>
        <p className="text-xs sm:text-sm text-slate-400 mt-1">
          Configure VIRUX dashboard appearance, user security profile, and client preferences.
        </p>
      </div>

      <div className="space-y-6 max-w-4xl">
        {/* ─── 1. User Profile Layout ────────────────────────── */}
        <DashboardCard title="User Profile & Identity" subtitle="Active Firebase Authentication session">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              {user?.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={displayName}
                  className="w-16 h-16 rounded-2xl border-2 border-indigo-500/40 object-cover shadow-xl"
                />
              ) : (
                <div
                  className="w-16 h-16 rounded-2xl flex items-center justify-center font-bold text-lg text-white shadow-xl"
                  style={{
                    background: 'linear-gradient(135deg, #6366F1 0%, #06B6D4 100%)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                  }}
                >
                  {initials || 'VX'}
                </div>
              )}
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold text-slate-100">{displayName}</h3>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 uppercase tracking-wider">
                    Spark Plan (Free)
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">{user?.email || 'No email attached'}</p>
                <div className="flex flex-wrap items-center gap-3 mt-1.5 text-[11px] font-mono">
                  <span className="text-slate-500">
                    UID: {user?.uid ? `${user.uid.substring(0, 16)}...` : 'N/A'}
                  </span>
                  <span className="text-slate-700">·</span>
                  <span className="text-slate-400">
                    Provider: {profile?.provider || user?.providerData[0]?.providerId || 'password'}
                  </span>
                  <span className="text-slate-700">·</span>
                  {isEmailVerified ? (
                    <span className="inline-flex items-center gap-1 text-emerald-400">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Verified
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-amber-400">
                      <AlertCircle className="w-3.5 h-3.5" /> Unverified
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <ActionButton
                label="Sign Out"
                icon={LogOut}
                variant="danger"
                size="sm"
                onClick={handleLogout}
              />
            </div>
          </div>
        </DashboardCard>

        {/* ─── 2. Appearance & Theme Settings ─────────────────── */}
        <DashboardCard title="Appearance & Visual Style" subtitle="Customize dashboard theme and branding tokens">
          <div className="space-y-5">
            {/* Theme Selector */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-2.5">
                Interface Theme
              </label>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { id: 'dark', label: 'Cinematic Dark', icon: Moon, desc: 'Deep Space Navy (#090D18)' },
                  { id: 'light', label: 'Light Mode', icon: Sun, desc: 'High Contrast (Disabled in v0.1)' },
                  { id: 'system', label: 'System Sync', icon: Laptop, desc: 'Automatic OS Appearance' },
                ].map((th) => {
                  const Icon = th.icon
                  const isSelected = selectedTheme === th.id
                  return (
                    <button
                      key={th.id}
                      type="button"
                      onClick={() => th.id !== 'light' && setSelectedTheme(th.id as 'dark' | 'light' | 'system')}
                      className={`p-3.5 rounded-xl border text-left transition-all ${
                        isSelected
                          ? 'border-indigo-500 bg-indigo-500/10 shadow-lg shadow-indigo-500/10'
                          : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
                      } ${th.id === 'light' ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <Icon className="w-4 h-4 text-slate-300" />
                        {isSelected && <Check className="w-3.5 h-3.5 text-indigo-400" />}
                      </div>
                      <span className="block font-semibold text-xs text-slate-200">{th.label}</span>
                      <span className="block text-[10px] text-slate-500 mt-0.5">{th.desc}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Accent Color Picker */}
            <div className="pt-2 border-t border-slate-800/80">
              <label className="block text-xs font-semibold text-slate-300 mb-2.5">
                Accent Glow Token
              </label>
              <div className="flex items-center gap-3">
                {accentOptions.map((opt) => (
                  <button
                    key={opt.color}
                    type="button"
                    onClick={() => setAccentColor(opt.color)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all cursor-pointer"
                    style={{
                      borderColor: accentColor === opt.color ? opt.color : 'rgba(255, 255, 255, 0.08)',
                      backgroundColor: accentColor === opt.color ? `${opt.color}15` : 'transparent',
                    }}
                  >
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: opt.color }} />
                    <span className="text-xs font-medium text-slate-300">{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </DashboardCard>

        {/* ─── 3. Ecosystem & Client Preferences ──────────────── */}
        <DashboardCard title="Client Connection Preferences" subtitle="Local mesh discovery and heartbeat settings">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-slate-200 block">
                  Auto-Connect P2P Mesh
                </span>
                <span className="text-[11px] text-slate-400">
                  Automatically discover and bind to paired Android devices on the same Wi-Fi.
                </span>
              </div>
              <button
                type="button"
                onClick={() => setAutoSync(!autoSync)}
                className={`w-11 h-6 rounded-full transition-colors relative p-0.5 ${
                  autoSync ? 'bg-indigo-600' : 'bg-slate-800'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white transition-transform ${
                    autoSync ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
              <div>
                <span className="text-xs font-semibold text-slate-200 block">
                  Notification Audible Chimes
                </span>
                <span className="text-[11px] text-slate-400">
                  Play audio alerts when high-priority notifications mirror to PC.
                </span>
              </div>
              <button
                type="button"
                onClick={() => setNotifSound(!notifSound)}
                className={`w-11 h-6 rounded-full transition-colors relative p-0.5 ${
                  notifSound ? 'bg-indigo-600' : 'bg-slate-800'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white transition-transform ${
                    notifSound ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>
        </DashboardCard>

        {/* ─── 4. Application & Build Info ────────────────────── */}
        <DashboardCard title="Application Information" subtitle="VIRUX software architecture specifications">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex justify-between">
              <span className="text-slate-400">Application Version</span>
              <span className="font-mono text-slate-200">0.1.0-alpha (Phase 3 Auth)</span>
            </div>
            <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex justify-between">
              <span className="text-slate-400">Firebase Backend ID</span>
              <span className="font-mono text-cyan-400">virux-504a5 (Spark)</span>
            </div>
            <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex justify-between">
              <span className="text-slate-400">Android Target Package</span>
              <span className="font-mono text-slate-200">com.virux.app</span>
            </div>
            <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex justify-between">
              <span className="text-slate-400">Firestore Owner Rules</span>
              <span className="font-mono text-emerald-400">Enforced /users/{'{uid}'}</span>
            </div>
          </div>
        </DashboardCard>
      </div>
    </PageContainer>
  )
}
export default SettingsPage
