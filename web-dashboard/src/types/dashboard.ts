// ============================================================
// VIRUX Web — Dashboard & Device Types
// ============================================================

export type DeviceType = 'phone' | 'tablet' | 'foldable' | 'wearable'

export type ConnectionStatus = 'online' | 'offline' | 'syncing' | 'pairing'

export interface ViruxDevice {
  id: string
  name: string
  model: string
  manufacturer: string
  androidVersion: string
  batteryLevel?: number
  isCharging?: boolean
  status: ConnectionStatus
  lastConnected: string
  storageUsedGb?: number
  storageTotalGb?: number
  ipAddress?: string
  wifiSsid?: string
}

export interface ActivityItem {
  id: string
  type: 'transfer' | 'notification' | 'connection' | 'sync'
  title: string
  subtitle: string
  timestamp: string
  status?: 'success' | 'warning' | 'error' | 'info'
}

export interface FileTransferItem {
  id: string
  fileName: string
  fileSize: string
  direction: 'upload' | 'download'
  status: 'completed' | 'transferring' | 'failed'
  progress: number
  timestamp: string
  deviceName: string
}

export interface NotificationItem {
  id: string
  appName: string
  title: string
  body: string
  timestamp: string
  isRead: boolean
  category: 'system' | 'messaging' | 'social' | 'alerts'
}

