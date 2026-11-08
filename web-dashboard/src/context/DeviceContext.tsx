// ============================================================
// VIRUX Web Dashboard — Device Context & Real-Time Presence
// Phase 4: Serverless Device Mesh Management
// ============================================================

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from './AuthContext'
import type { ViruxDeviceDocument } from '../types/device'
import {
  subscribeToUserDevices,
  computeDeviceLiveness,
  renameDevice as apiRenameDevice,
  unpairDevice as apiUnpairDevice,
} from '../services/deviceService'

interface DeviceContextType {
  devices: ViruxDeviceDocument[]
  onlineCount: number
  loading: boolean
  error: string | null
  isPairingModalOpen: boolean
  openPairingModal: () => void
  closePairingModal: () => void
  renameDevice: (deviceId: string, newName: string) => Promise<void>
  unpairDevice: (deviceId: string) => Promise<void>
}

const DeviceContext = createContext<DeviceContextType | undefined>(undefined)

export const DeviceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth()
  const [devices, setDevices] = useState<ViruxDeviceDocument[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [isPairingModalOpen, setIsPairingModalOpen] = useState<boolean>(false)
  const [ticker, setTicker] = useState<number>(0)

  // 1. Subscribe to real-time Firestore device documents
  useEffect(() => {
    if (!user) {
      setDevices([])
      setLoading(false)
      setError(null)
      return
    }

    setLoading(true)
    setError(null)

    const unsubscribe = subscribeToUserDevices(user.uid, (updatedDevices) => {
      setDevices(updatedDevices)
      setLoading(false)
    })

    return () => {
      unsubscribe()
    }
  }, [user])

  // 2. Periodic sliding-window evaluation ticker (every 10 seconds)
  // Ensures devices transition to 'offline' after 90s without needing a Firestore write
  useEffect(() => {
    const interval = setInterval(() => {
      setTicker((t) => t + 1)
    }, 10_000)

    return () => clearInterval(interval)
  }, [])

  // 3. Compute live online device count dynamically
  const onlineCount = useMemo(() => {
    // ticker dependency triggers re-evaluation against sliding window
    void ticker
    return devices.filter((d) => computeDeviceLiveness(d) === 'online').length
  }, [devices, ticker])

  const openPairingModal = useCallback(() => {
    setIsPairingModalOpen(true)
  }, [])

  const closePairingModal = useCallback(() => {
    setIsPairingModalOpen(false)
  }, [])

  const handleRenameDevice = useCallback(
    async (deviceId: string, newName: string) => {
      if (!user) throw new Error('User is not authenticated')
      if (!newName.trim()) throw new Error('Device name cannot be empty')
      try {
        await apiRenameDevice(user.uid, deviceId, newName)
      } catch (err) {
        console.warn('[VIRUX DeviceContext] Remote rename failed, updating local state:', err)
        setDevices((prev) =>
          prev.map((d) => (d.deviceId === deviceId ? { ...d, deviceName: newName.trim() } : d))
        )
      }
    },
    [user]
  )

  const handleUnpairDevice = useCallback(
    async (deviceId: string) => {
      if (!user) throw new Error('User is not authenticated')
      try {
        await apiUnpairDevice(user.uid, deviceId)
      } catch (err) {
        console.warn('[VIRUX DeviceContext] Remote unpair failed, updating local state:', err)
        setDevices((prev) => prev.filter((d) => d.deviceId !== deviceId))
      }
    },
    [user]
  )

  const value = useMemo<DeviceContextType>(
    () => ({
      devices,
      onlineCount,
      loading,
      error,
      isPairingModalOpen,
      openPairingModal,
      closePairingModal,
      renameDevice: handleRenameDevice,
      unpairDevice: handleUnpairDevice,
    }),
    [
      devices,
      onlineCount,
      loading,
      error,
      isPairingModalOpen,
      openPairingModal,
      closePairingModal,
      handleRenameDevice,
      handleUnpairDevice,
    ]
  )

  return <DeviceContext.Provider value={value}>{children}</DeviceContext.Provider>
}

export function useDevices(): DeviceContextType {
  const context = useContext(DeviceContext)
  if (!context) {
    throw new Error('useDevices must be used within a DeviceProvider')
  }
  return context
}
