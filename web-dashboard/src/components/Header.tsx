import React, { useState, useRef, useEffect } from 'react'
import {
  Menu,
  Bell,
  Smartphone,
  Plus,
  Search,
  LogOut,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react'
import { ActionButton } from './ActionButton'
import { useAuth } from '../hooks/useAuth'
import { useDevices } from '../hooks/useDevices'

interface HeaderProps {
  onToggleSidebar: () => void
  activeDeviceCount?: number
  onPairClick?: () => void
}

export const Header: React.FC<HeaderProps> = ({
  onToggleSidebar,
  activeDeviceCount,
  onPairClick,
}) => {
  const { user, profile, logout } = useAuth()
  const { onlineCount, openPairingModal } = useDevices()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const effectiveActiveCount = activeDeviceCount !== undefined ? activeDeviceCount : onlineCount
  const handlePair = onPairClick || openPairingModal

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

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
    <header
      className="h-16 flex items-center justify-between px-4 sm:px-6 sticky top-0 z-30 virux-glass"
      style={{
        borderBottom: '1px solid var(--color-border)',
      }}
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onToggleSidebar}
          className="lg:hidden p-2 rounded-xl text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Global Search pill */}
        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs text-slate-400 w-56 md:w-72">
          <Search className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          <input
            type="text"
            placeholder="Search devices, files, activity..."
            className="bg-transparent border-none outline-none w-full text-slate-200 placeholder:text-slate-500 text-xs"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Device mesh badge */}
        <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs">
          <Smartphone className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-slate-400">Mesh:</span>
          <span className="text-slate-200 font-semibold">{effectiveActiveCount} Online</span>
        </div>

        {/* Quick Pair CTA */}
        <ActionButton
          label="Pair Device"
          icon={Plus}
          size="sm"
          variant="accent"
          onClick={handlePair}
        />

        {/* Notification bell */}
        <button
          type="button"
          className="relative p-2 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
          title="Notifications"
        >
          <Bell className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-indigo-500" />
        </button>

        {/* Profile Avatar & Interactive Dropdown */}
        <div className="relative pl-2 border-l border-slate-800" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-2.5 p-1 rounded-xl hover:bg-slate-800/60 transition cursor-pointer"
          >
            {user?.photoURL ? (
              <img
                src={user.photoURL}
                alt={displayName}
                className="w-8 h-8 rounded-full border border-indigo-500/40 object-cover"
              />
            ) : (
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs text-white shadow-inner"
                style={{
                  background: 'linear-gradient(135deg, #6366F1 0%, #06B6D4 100%)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                }}
              >
                {initials || 'VX'}
              </div>
            )}
            <div className="hidden xl:block text-left text-xs">
              <span className="block font-medium text-slate-200 leading-tight truncate max-w-[120px]">
                {displayName}
              </span>
              <span className="text-[10px] text-cyan-400 font-mono">
                {isEmailVerified ? 'Verified' : 'Spark Tier'}
              </span>
            </div>
          </button>

          {/* User Dropdown Menu */}
          {dropdownOpen && (
            <div
              className="absolute right-0 mt-2 w-64 rounded-2xl bg-[#111827] border border-slate-800 shadow-2xl p-2 z-50 text-xs space-y-1 animate-fade-in"
              style={{ backgroundColor: '#111827' }}
            >
              <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800/80 mb-2">
                <span className="block font-semibold text-slate-100 truncate">{displayName}</span>
                <span className="block text-[11px] text-slate-400 truncate mt-0.5">{user?.email || 'Authenticated User'}</span>
                <div className="mt-2 flex items-center gap-1.5 text-[10px]">
                  {isEmailVerified ? (
                    <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
                      <CheckCircle2 className="w-3 h-3" /> Email Verified
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-amber-400 font-medium">
                      <AlertCircle className="w-3 h-3" /> Email Unverified
                    </span>
                  )}
                </div>
              </div>

              <div className="px-3 py-1.5 text-[10px] font-mono text-slate-500 uppercase tracking-wider">
                UID: {user?.uid.substring(0, 12)}...
              </div>

              <div className="border-t border-slate-800/80 pt-1">
                <button
                  type="button"
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 transition text-xs font-medium cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
