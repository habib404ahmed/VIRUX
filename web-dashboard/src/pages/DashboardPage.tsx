// ============================================================
// VIRUX Web Dashboard — Main Overview Dashboard
// Phase 4: Live Mesh Device Status & Quick Commands
// ============================================================

import React from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Smartphone,
  Send,
  Cast,
  ClipboardList,
  Volume2,
  HardDrive,
  Activity,
  Radio,
  Clock,
  ArrowUpRight,
  ShieldAlert,
  Loader2,
  Plus,
} from 'lucide-react'
import { PageContainer } from '../components/PageContainer'
import { SectionHeader } from '../components/SectionHeader'
import { DashboardCard } from '../components/DashboardCard'
import { DeviceCard } from '../components/DeviceCard'
import { ActionButton } from '../components/ActionButton'
import { EmptyState } from '../components/EmptyState'
import { useDevices } from '../hooks/useDevices'
import type { ActivityItem } from '../types/dashboard'

const recentActivities: ActivityItem[] = [
  {
    id: 'act-1',
    type: 'connection',
    title: 'Hardware Cryptographic Identity Ready',
    subtitle: 'NIST P-256 ECDSA challenge-response pairing enabled',
    timestamp: 'Phase 4',
    status: 'success',
  },
  {
    id: 'act-2',
    type: 'connection',
    title: 'Firestore Signaling Active',
    subtitle: 'Channel ready for WebRTC candidate exchange in Phase 5',
    timestamp: 'Spark Free',
    status: 'info',
  },
  {
    id: 'act-3',
    type: 'notification',
    title: 'Security Boundary Enforced',
    subtitle: 'Owner-only UID path isolation and single-use session rules',
    timestamp: 'Active',
    status: 'warning',
  },
]

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate()
  const { devices, onlineCount, loading, openPairingModal, renameDevice, unpairDevice } = useDevices()

  return (
    <PageContainer>
      {/* ─── Welcome Hero Section ────────────────────────────── */}
      <div
        className="relative overflow-hidden rounded-2xl p-6 sm:p-8 border border-slate-800 shadow-2xl"
        style={{
          background: 'linear-gradient(135deg, rgba(23, 32, 51, 0.95) 0%, rgba(17, 24, 39, 0.95) 100%)',
        }}
      >
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 mb-4">
            <span className={`w-2 h-2 rounded-full ${onlineCount > 0 ? 'bg-cyan-400 animate-pulse' : 'bg-slate-500'}`} />
            VIRUX Device Mesh · {onlineCount} {onlineCount === 1 ? 'Device' : 'Devices'} Online
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-100">
            Welcome to <span className="virux-gradient-brand">VIRUX</span>
          </h1>
          <p className="mt-2 text-sm text-slate-400 leading-relaxed">
            Your cross-platform Android control center. Real-time device synchronization, peer-to-peer file transfer, and remote management.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <ActionButton
              label="Pair New Device"
              icon={Smartphone}
              variant="accent"
              size="sm"
              onClick={openPairingModal}
            />
            <ActionButton
              label="View All Devices"
              icon={Activity}
              variant="secondary"
              size="sm"
              onClick={() => navigate('/devices')}
            />
          </div>
        </div>

        {/* Ambient subtle glow background */}
        <div
          className="absolute -right-16 -top-16 w-80 h-80 rounded-full opacity-20 pointer-events-none blur-3xl"
          style={{ background: 'radial-gradient(circle, #6366F1 0%, #06B6D4 100%)' }}
        />
      </div>

      {/* ─── Quick Actions Grid ──────────────────────────────── */}
      <div>
        <SectionHeader title="Quick Actions" subtitle="Instant commands to connected Android hardware" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          {[
            { label: 'Send File', icon: Send, desc: 'P2P WebRTC Transfer', path: '/files' },
            { label: 'Screen Mirror', icon: Cast, desc: 'Live Device Display', path: '/mirror' },
            { label: 'Sync Clipboard', icon: ClipboardList, desc: 'Shared text & URLs', path: '/files' },
            { label: 'Ring Device', icon: Volume2, desc: 'Locate nearby phone', path: '/devices' },
          ].map((action) => {
            const Icon = action.icon
            return (
              <div
                key={action.label}
                onClick={() => navigate(action.path)}
                className="virux-card virux-card-interactive p-4 flex flex-col justify-between group cursor-pointer"
                style={{ backgroundColor: 'var(--color-card)' }}
              >
                <div>
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center mb-3 transition-transform group-hover:scale-105"
                    style={{
                      backgroundColor: 'rgba(99, 102, 241, 0.1)',
                      border: '1px solid rgba(99, 102, 241, 0.25)',
                    }}
                  >
                    <Icon className="w-5 h-5 text-indigo-400 group-hover:text-cyan-400 transition-colors" />
                  </div>
                  <h4 className="font-semibold text-sm text-slate-200">{action.label}</h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">{action.desc}</p>
                </div>
                <div className="mt-3 pt-2 border-t border-slate-800/60 flex items-center justify-between text-[10px] text-slate-400 font-medium">
                  <span className="text-cyan-400">Phase 5 Protocol</span>
                  <ArrowUpRight className="w-3.5 h-3.5 opacity-50 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ─── Two-Column Primary Row ──────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Connected Devices (2 Cols) */}
        <div className="lg:col-span-2 space-y-4">
          <SectionHeader
            title="Registered Devices"
            subtitle="Hardware status in this ecosystem (Sliding window liveness)"
            action={
              <span className="text-xs text-cyan-400 font-mono bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">
                {devices.length} Paired · {onlineCount} Online
              </span>
            }
          />

          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center space-y-2">
              <Loader2 className="w-6 h-6 text-cyan-400 animate-spin" />
              <p className="text-xs text-slate-400">Synchronizing device mesh...</p>
            </div>
          ) : devices.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {devices.slice(0, 4).map((device) => (
                <DeviceCard
                  key={device.deviceId}
                  device={device}
                  onSelect={() => navigate('/devices')}
                  onRename={(dev) => {
                    const newName = window.prompt('Enter new device label:', dev.deviceName)
                    if (newName && newName.trim()) {
                      renameDevice(dev.deviceId, newName.trim()).catch(console.error)
                    }
                  }}
                  onUnpair={(dev) => {
                    if (window.confirm(`Unpair ${dev.deviceName}? This will revoke access.`)) {
                      unpairDevice(dev.deviceId).catch(console.error)
                    }
                  }}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={Smartphone}
              title="No Devices Paired"
              description="You have not paired any Android devices to this account yet. Click below to generate a QR token and connect your phone or tablet."
              actionLabel="Pair Android Device"
              actionIcon={Plus}
              onAction={openPairingModal}
            />
          )}

          {/* Aggregated Ecosystem Storage / Capability Info */}
          <DashboardCard title="Mesh Storage & Channel Readiness" subtitle="Capacity & WebRTC signaling state">
            <div className="space-y-4">
              <div>
                <div className="flex justify-between items-center text-xs mb-2">
                  <span className="flex items-center gap-2 text-slate-300 font-medium">
                    <HardDrive className="w-4 h-4 text-cyan-400" />
                    Paired Devices Storage Allocation
                  </span>
                  <span className="text-slate-400">
                    {devices.length > 0 ? `${devices.length} active hardware units` : 'No storage active'}
                  </span>
                </div>
                <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-800">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: devices.length > 0 ? `${Math.min(100, devices.length * 35)}%` : '0%',
                      background: 'linear-gradient(90deg, #6366F1, #06B6D4)',
                    }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-2 text-center text-xs">
                <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800">
                  <span className="block text-[11px] text-slate-400">P2P File Transfer</span>
                  <span className="font-semibold text-cyan-400">Ready</span>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800">
                  <span className="block text-[11px] text-slate-400">Screen Mirror</span>
                  <span className="font-semibold text-indigo-400">Phase 5</span>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800">
                  <span className="block text-[11px] text-slate-400">Encrypted Channel</span>
                  <span className="font-semibold text-emerald-400">Active</span>
                </div>
              </div>
            </div>
          </DashboardCard>
        </div>

        {/* Right Column: Connection Status & Recent Activity (1 Col) */}
        <div className="space-y-6">
          {/* Connection Status Card */}
          <DashboardCard title="Ecosystem Connection Status" subtitle="Backend signaling & channel health">
            <div className="space-y-3.5">
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-xs">
                <div className="flex items-center gap-2.5">
                  <Radio className="w-4 h-4 text-emerald-400 animate-pulse" />
                  <span className="text-slate-300 font-medium">Firestore Signaling</span>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-300">
                  Ready
                </span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-xs">
                <div className="flex items-center gap-2.5">
                  <Activity className="w-4 h-4 text-cyan-400" />
                  <span className="text-slate-300 font-medium">STUN NAT Traversal</span>
                </div>
                <span className="text-slate-400 font-mono text-[11px]">Google STUN</span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-xs">
                <div className="flex items-center gap-2.5">
                  <ShieldAlert className="w-4 h-4 text-indigo-400" />
                  <span className="text-slate-300 font-medium">Security Boundary</span>
                </div>
                <span className="text-slate-400 font-mono text-[11px]">Deny-by-Default</span>
              </div>

              <div className="pt-2 text-[11px] text-slate-400 text-center">
                Firebase Project: <code className="text-slate-300">virux-504a5</code> (Spark)
              </div>
            </div>
          </DashboardCard>

          {/* Recent Activity Card */}
          <DashboardCard title="Ecosystem Highlights" subtitle="Security and architecture status">
            <div className="space-y-3">
              {recentActivities.map((act) => (
                <div
                  key={act.id}
                  className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 flex items-start gap-3"
                >
                  <div className="w-2 h-2 rounded-full bg-cyan-400 mt-1.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-200 truncate">{act.title}</p>
                    <p className="text-[11px] text-slate-400 leading-snug mt-0.5">{act.subtitle}</p>
                    <span className="text-[10px] text-slate-500 mt-1 flex items-center gap-1 font-mono">
                      <Clock className="w-3 h-3" />
                      {act.timestamp}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </DashboardCard>
        </div>
      </div>
    </PageContainer>
  )
}

export default DashboardPage
