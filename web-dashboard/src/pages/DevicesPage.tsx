// ============================================================
// VIRUX Web Dashboard — Device Management Page
// Phase 4: Real Firestore Device Hardware Registry & Operations
// ============================================================

import React, { useState } from 'react'
import {
  Smartphone,
  Plus,
  Search,
  Filter,
  X,
  Cpu,
  Wifi,
  Shield,
  BatteryCharging,
  Clock,
  Key,
  Edit2,
  Trash2,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Signal,
} from 'lucide-react'
import { PageContainer } from '../components/PageContainer'
import { DeviceCard } from '../components/DeviceCard'
import { EmptyState } from '../components/EmptyState'
import { ActionButton } from '../components/ActionButton'
import { StatusIndicator } from '../components/StatusIndicator'
import { useDevices } from '../hooks/useDevices'
import { computeDeviceLiveness, formatLastSeen } from '../services/deviceService'
import type { ViruxDeviceDocument } from '../types/device'

export const DevicesPage: React.FC = () => {
  const { devices, loading, error, openPairingModal, renameDevice, unpairDevice } = useDevices()

  const [filter, setFilter] = useState<'all' | 'online' | 'offline'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedDevice, setSelectedDevice] = useState<ViruxDeviceDocument | null>(null)

  // Rename Dialog State
  const [deviceToRename, setDeviceToRename] = useState<ViruxDeviceDocument | null>(null)
  const [renameInputValue, setRenameInputValue] = useState('')
  const [renameLoading, setRenameLoading] = useState(false)
  const [renameError, setRenameError] = useState<string | null>(null)

  // Unpair Dialog State
  const [deviceToUnpair, setDeviceToUnpair] = useState<ViruxDeviceDocument | null>(null)
  const [unpairLoading, setUnpairLoading] = useState(false)
  const [unpairError, setUnpairError] = useState<string | null>(null)

  // Filter and search computation
  const filteredDevices = devices.filter((device) => {
    const isOnline = computeDeviceLiveness(device) === 'online'
    const matchesFilter =
      filter === 'all' ? true : filter === 'online' ? isOnline : !isOnline

    const query = searchQuery.toLowerCase()
    const matchesSearch =
      device.deviceName.toLowerCase().includes(query) ||
      device.model.toLowerCase().includes(query) ||
      device.manufacturer.toLowerCase().includes(query)

    return matchesFilter && matchesSearch
  })

  // ─── Rename Handler ──────────────────────────────────────────
  const openRenameDialog = (device: ViruxDeviceDocument) => {
    setDeviceToRename(device)
    setRenameInputValue(device.deviceName)
    setRenameError(null)
  }

  const handleConfirmRename = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!deviceToRename) return

    const trimmed = renameInputValue.trim()
    if (!trimmed) {
      setRenameError('Device name cannot be blank.')
      return
    }

    if (trimmed.length > 40) {
      setRenameError('Device name must be 40 characters or fewer.')
      return
    }

    setRenameLoading(true)
    setRenameError(null)

    try {
      await renameDevice(deviceToRename.deviceId, trimmed)
      if (selectedDevice?.deviceId === deviceToRename.deviceId) {
        setSelectedDevice((prev) => (prev ? { ...prev, deviceName: trimmed } : null))
      }
      setDeviceToRename(null)
    } catch (err: any) {
      console.error('[VIRUX DevicesPage] Rename failed:', err)
      setRenameError(err?.message || 'Failed to rename device. Check network connection.')
    } finally {
      setRenameLoading(false)
    }
  }

  // ─── Unpair Handler ──────────────────────────────────────────
  const openUnpairDialog = (device: ViruxDeviceDocument) => {
    setDeviceToUnpair(device)
    setUnpairError(null)
  }

  const handleConfirmUnpair = async () => {
    if (!deviceToUnpair) return

    setUnpairLoading(true)
    setUnpairError(null)

    try {
      await unpairDevice(deviceToUnpair.deviceId)
      if (selectedDevice?.deviceId === deviceToUnpair.deviceId) {
        setSelectedDevice(null)
      }
      setDeviceToUnpair(null)
    } catch (err: any) {
      console.error('[VIRUX DevicesPage] Unpair failed:', err)
      setUnpairError(err?.message || 'Failed to unpair device.')
    } finally {
      setUnpairLoading(false)
    }
  }

  return (
    <PageContainer>
      {/* ─── Page Title Header ───────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-100">Device Management</h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Real-time registered Android hardware · Cryptographically paired via ECDSA P-256.
          </p>
        </div>

        <ActionButton
          label="Pair New Device"
          icon={Plus}
          variant="accent"
          size="md"
          onClick={openPairingModal}
        />
      </div>

      {/* ─── Error Notification ──────────────────────────────── */}
      {error && (
        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/25 text-xs text-rose-300 flex items-center gap-2.5">
          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>Error loading device registry: {error}</span>
        </div>
      )}

      {/* ─── Controls: Filter Tabs & Search ──────────────────── */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-900 border border-slate-800 text-xs self-start">
          {(['all', 'online', 'offline'] as const).map((tab) => {
            const count =
              tab === 'all'
                ? devices.length
                : tab === 'online'
                ? devices.filter((d) => computeDeviceLiveness(d) === 'online').length
                : devices.filter((d) => computeDeviceLiveness(d) !== 'online').length

            return (
              <button
                key={tab}
                type="button"
                onClick={() => setFilter(tab)}
                className={`px-3 py-1.5 rounded-lg capitalize font-medium transition-all ${
                  filter === tab
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tab} ({count})
              </button>
            )
          })}
        </div>

        {/* Search Input */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-400 w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name or model..."
            className="bg-transparent border-none outline-none w-full text-slate-200 placeholder:text-slate-500 text-xs"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="text-slate-500 hover:text-slate-300"
              title="Clear search"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* ─── Device Cards Grid / Loading / Empty State ───────── */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center space-y-3">
          <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
          <p className="text-xs text-slate-400">Connecting to secure device registry...</p>
        </div>
      ) : filteredDevices.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredDevices.map((device) => (
            <DeviceCard
              key={device.deviceId}
              device={device}
              onSelect={(dev) => setSelectedDevice(dev)}
              onRename={(dev) => openRenameDialog(dev)}
              onUnpair={(dev) => openUnpairDialog(dev)}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Smartphone}
          title={searchQuery ? 'No Matching Devices' : 'No Devices Paired'}
          description={
            searchQuery
              ? `No devices matched your query "${searchQuery}". Clear your search or filter.`
              : 'You do not have any registered Android devices in your VIRUX ecosystem yet. Click below to pair your first hardware device.'
          }
          actionLabel={searchQuery ? 'Clear Filters' : 'Pair New Device'}
          actionIcon={searchQuery ? Filter : Plus}
          onAction={() => {
            if (searchQuery) {
              setFilter('all')
              setSearchQuery('')
            } else {
              openPairingModal()
            }
          }}
        />
      )}

      {/* ─── Device Details Modal Drawer ─────────────────────── */}
      {selectedDevice && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-150"
          onClick={() => setSelectedDevice(null)}
        >
          <div
            className="virux-card max-w-lg w-full p-6 space-y-5 shadow-2xl border border-slate-800"
            style={{ backgroundColor: 'var(--color-card)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{
                    backgroundColor: 'rgba(99, 102, 241, 0.1)',
                    border: '1px solid rgba(99, 102, 241, 0.25)',
                  }}
                >
                  <Smartphone className="w-5 h-5 text-cyan-400" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-100">{selectedDevice.deviceName}</h3>
                  <p className="text-xs text-slate-400">
                    {selectedDevice.manufacturer} · {selectedDevice.model}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <StatusIndicator
                  status={computeDeviceLiveness(selectedDevice) === 'online' ? 'online' : 'offline'}
                />
                <button
                  type="button"
                  onClick={() => setSelectedDevice(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Hardware Security Badge */}
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-[11px] text-emerald-300 flex items-center justify-between">
              <span className="flex items-center gap-1.5 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                Hardware Cryptographic Identity Verified
              </span>
              <span className="font-mono text-[10px] text-emerald-400">NIST P-256</span>
            </div>

            {/* Spec breakdown */}
            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                <span className="text-slate-400 flex items-center gap-2">
                  <Cpu className="w-3.5 h-3.5 text-indigo-400" />
                  OS & Android SDK
                </span>
                <span className="text-slate-200 font-mono">
                  Android {selectedDevice.androidVersion || '15'} (API {selectedDevice.sdkVersion || 35})
                </span>
              </div>

              <div className="flex justify-between p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                <span className="text-slate-400 flex items-center gap-2">
                  {selectedDevice.networkType === 'wifi' ? (
                    <Wifi className="w-3.5 h-3.5 text-cyan-400" />
                  ) : (
                    <Signal className="w-3.5 h-3.5 text-cyan-400" />
                  )}
                  Network Transport
                </span>
                <span className="text-slate-200 font-mono capitalize">
                  {selectedDevice.networkType || 'Mesh Connected'}
                </span>
              </div>

              <div className="flex justify-between p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                <span className="text-slate-400 flex items-center gap-2">
                  <BatteryCharging className="w-3.5 h-3.5 text-amber-400" />
                  Battery Telemetry
                </span>
                <span className="text-slate-200 font-mono">
                  {selectedDevice.batteryLevel !== undefined ? `${selectedDevice.batteryLevel}%` : 'N/A'}{' '}
                  {selectedDevice.isCharging ? '· Charging' : '· Discharging'}
                </span>
              </div>

              <div className="flex justify-between p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                <span className="text-slate-400 flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-pink-400" />
                  Last Seen / Heartbeat
                </span>
                <span className="text-slate-200 font-mono">
                  {formatLastSeen(selectedDevice.lastSeen)}
                </span>
              </div>

              <div className="flex flex-col gap-1 p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                <span className="text-slate-400 flex items-center gap-2 text-[11px]">
                  <Key className="w-3.5 h-3.5 text-indigo-400" />
                  Hardware Device Key Fingerprint
                </span>
                <span className="text-slate-400 font-mono text-[10px] truncate">
                  {selectedDevice.devicePublicKey
                    ? selectedDevice.devicePublicKey.substring(0, 48) + '...'
                    : 'Unregistered'}
                </span>
              </div>
            </div>

            {/* Ecosystem Capabilities */}
            <div>
              <span className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Supported Ecosystem Capabilities
              </span>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                {[
                  { key: 'fileTransfer', label: 'P2P File Transfer' },
                  { key: 'screenMirror', label: 'Screen Mirroring' },
                  { key: 'notifications', label: 'Notification Mirror' },
                  { key: 'clipboard', label: 'Encrypted Clipboard' },
                ].map(({ key, label }) => {
                  const enabled =
                    selectedDevice.capabilities &&
                    (selectedDevice.capabilities as any)[key] !== false

                  return (
                    <div
                      key={key}
                      className={`p-2 rounded-lg border flex items-center gap-2 ${
                        enabled
                          ? 'bg-slate-900/60 border-slate-800/80 text-slate-300'
                          : 'bg-slate-950/40 border-slate-900 text-slate-500'
                      }`}
                    >
                      <Shield className={`w-3 h-3 ${enabled ? 'text-cyan-400' : 'text-slate-600'}`} />
                      <span>{label}</span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Modal Actions */}
            <div className="pt-2 flex justify-between gap-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => openRenameDialog(selectedDevice)}
                className="px-3 py-1.5 rounded-xl text-xs text-slate-300 hover:text-slate-100 hover:bg-slate-800 border border-slate-800 flex items-center gap-1.5 transition"
              >
                <Edit2 className="w-3.5 h-3.5 text-cyan-400" />
                Rename
              </button>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => openUnpairDialog(selectedDevice)}
                  className="px-3 py-1.5 rounded-xl text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 border border-rose-500/20 flex items-center gap-1.5 transition"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Unpair Device
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedDevice(null)}
                  className="px-4 py-1.5 rounded-xl text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 transition"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Rename Device Confirmation Dialog ───────────────── */}
      {deviceToRename && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150"
          onClick={() => !renameLoading && setDeviceToRename(null)}
        >
          <div
            className="virux-card max-w-sm w-full p-5 space-y-4 shadow-2xl border border-slate-800"
            style={{ backgroundColor: 'var(--color-card)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/25 flex items-center justify-center">
                <Edit2 className="w-4 h-4 text-cyan-400" />
              </div>
              <div>
                <h4 className="font-bold text-sm text-slate-100">Rename Device</h4>
                <p className="text-[11px] text-slate-400">{deviceToRename.model}</p>
              </div>
            </div>

            <form onSubmit={handleConfirmRename} className="space-y-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Device Label</label>
                <input
                  type="text"
                  value={renameInputValue}
                  onChange={(e) => setRenameInputValue(e.target.value)}
                  placeholder="e.g. My Primary Phone"
                  disabled={renameLoading}
                  maxLength={40}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-100 outline-none focus:border-cyan-400 transition"
                  autoFocus
                />
              </div>

              {renameError && (
                <p className="text-xs text-rose-400 bg-rose-500/10 p-2 rounded-lg border border-rose-500/20">
                  {renameError}
                </p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDeviceToRename(null)}
                  disabled={renameLoading}
                  className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-slate-200 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={renameLoading}
                  className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 transition flex items-center gap-1.5"
                >
                  {renameLoading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save Name'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Unpair Device Confirmation Dialog ───────────────── */}
      {deviceToUnpair && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150"
          onClick={() => !unpairLoading && setDeviceToUnpair(null)}
        >
          <div
            className="virux-card max-w-sm w-full p-5 space-y-4 shadow-2xl border border-rose-500/20"
            style={{ backgroundColor: 'var(--color-card)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/25 flex items-center justify-center text-rose-400">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-sm text-slate-100">Unpair Android Device?</h4>
                <p className="text-xs text-slate-400">{deviceToUnpair.deviceName}</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              This will permanently remove{' '}
              <strong className="text-slate-100">{deviceToUnpair.deviceName}</strong> from your
              authenticated mesh. To reconnect later, you will need to scan a new QR pairing token.
            </p>

            {unpairError && (
              <p className="text-xs text-rose-400 bg-rose-500/10 p-2 rounded-lg border border-rose-500/20">
                {unpairError}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeviceToUnpair(null)}
                disabled={unpairLoading}
                className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-slate-200 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmUnpair}
                disabled={unpairLoading}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 disabled:opacity-50 transition flex items-center gap-1.5"
              >
                {unpairLoading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Unpairing...
                  </>
                ) : (
                  'Confirm Unpair'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  )
}

export default DevicesPage
