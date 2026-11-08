// ============================================================
// VIRUX Web Dashboard — Device Card Component
// Phase 4: Real Hardware Telemetry & Device Actions
// ============================================================

import React, { useState, useRef, useEffect } from 'react'
import {
  Smartphone,
  Tablet,
  Battery,
  BatteryCharging,
  Wifi,
  Signal,
  MoreVertical,
  Edit2,
  Trash2,
  ShieldCheck,
  Clock,
} from 'lucide-react'
import type { ViruxDeviceDocument } from '../types/device'
import { computeDeviceLiveness, formatLastSeen } from '../services/deviceService'
import { StatusIndicator } from './StatusIndicator'

interface DeviceCardProps {
  device: ViruxDeviceDocument
  onSelect?: (device: ViruxDeviceDocument) => void
  onRename?: (device: ViruxDeviceDocument) => void
  onUnpair?: (device: ViruxDeviceDocument) => void
}

export const DeviceCard: React.FC<DeviceCardProps> = ({
  device,
  onSelect,
  onRename,
  onUnpair,
}) => {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const isOnline = computeDeviceLiveness(device) === 'online'
  const isTablet =
    device.deviceType === 'tablet' ||
    device.model?.toLowerCase().includes('tab') ||
    device.deviceName?.toLowerCase().includes('tab')

  const DeviceIcon = isTablet ? Tablet : Smartphone

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const getNetworkLabel = (type: string) => {
    switch (type) {
      case 'wifi':
        return 'Wi-Fi'
      case 'cellular':
        return 'Cellular LTE/5G'
      case 'ethernet':
        return 'Ethernet'
      default:
        return 'Local Mesh'
    }
  }

  return (
    <div
      className="virux-card virux-card-interactive p-5 flex flex-col justify-between relative group cursor-pointer transition-all duration-200"
      style={{ backgroundColor: 'var(--color-card)' }}
      onClick={() => onSelect && onSelect(device)}
    >
      <div>
        {/* Top Header: Icon, Name, and Status */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105"
              style={{
                backgroundColor: 'rgba(99, 102, 241, 0.1)',
                border: '1px solid rgba(99, 102, 241, 0.25)',
              }}
            >
              <DeviceIcon className="w-6 h-6 text-cyan-400" />
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h4 className="font-semibold text-sm text-slate-100 truncate">
                  {device.deviceName}
                </h4>
                <span className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 flex items-center gap-1">
                  <ShieldCheck className="w-2.5 h-2.5" />
                  Hardware Paired
                </span>
              </div>
              <p className="text-xs text-slate-400 truncate">
                {device.manufacturer} {device.model}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
            <StatusIndicator status={isOnline ? 'online' : 'offline'} />

            {/* Dropdown Menu */}
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((prev) => !prev)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
                title="Options"
              >
                <MoreVertical className="w-4 h-4" />
              </button>

              {menuOpen && (
                <div className="absolute right-0 top-full mt-1 w-36 rounded-xl bg-slate-900 border border-slate-800 shadow-xl py-1 z-30 animate-in fade-in zoom-in-95 duration-100">
                  {onRename && (
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false)
                        onRename(device)
                      }}
                      className="w-full px-3 py-2 text-left text-xs text-slate-300 hover:text-slate-100 hover:bg-slate-800 flex items-center gap-2 transition"
                    >
                      <Edit2 className="w-3.5 h-3.5 text-cyan-400" />
                      Rename
                    </button>
                  )}
                  {onUnpair && (
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false)
                        onUnpair(device)
                      }}
                      className="w-full px-3 py-2 text-left text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 flex items-center gap-2 transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Unpair Device
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Specs Pills: Battery & Network Transport */}
        <div className="grid grid-cols-2 gap-2 mb-3 text-xs text-slate-300">
          <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-900/60 border border-slate-800/80">
            {device.isCharging ? (
              <BatteryCharging className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <Battery className="w-4 h-4 text-cyan-400 shrink-0" />
            )}
            <span className="truncate">
              {device.batteryLevel !== undefined ? `${device.batteryLevel}%` : 'N/A'}
              {device.isCharging ? ' (Charging)' : ''}
            </span>
          </div>

          <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-900/60 border border-slate-800/80">
            {device.networkType === 'wifi' ? (
              <Wifi className="w-4 h-4 text-indigo-400 shrink-0" />
            ) : (
              <Signal className="w-4 h-4 text-indigo-400 shrink-0" />
            )}
            <span className="truncate">{getNetworkLabel(device.networkType)}</span>
          </div>
        </div>

        {/* Operating System Pill */}
        <div className="p-2 rounded-lg bg-slate-900/40 border border-slate-800/60 flex items-center justify-between text-[11px] text-slate-400">
          <span>Android {device.androidVersion || '15'}</span>
          <span className="font-mono text-slate-400">API {device.sdkVersion || 35}</span>
        </div>
      </div>

      {/* Footer: Last Seen relative time */}
      <div className="pt-3 mt-3 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-400">
        <span className="flex items-center gap-1.5">
          <Clock className="w-3 h-3 text-slate-500" />
          Last active
        </span>
        <span className="font-medium text-slate-300">
          {isOnline ? 'Active now' : formatLastSeen(device.lastSeen)}
        </span>
      </div>
    </div>
  )
}
