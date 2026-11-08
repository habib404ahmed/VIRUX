import React from 'react'
import type { ConnectionStatus } from '../types/dashboard'

interface StatusIndicatorProps {
  status: ConnectionStatus
  showLabel?: boolean
  className?: string
}

const statusConfig: Record<ConnectionStatus, { color: string; bg: string; label: string; pulse: boolean }> = {
  online: {
    color: '#22C55E',
    bg: 'rgba(34, 197, 94, 0.15)',
    label: 'Connected',
    pulse: true,
  },
  offline: {
    color: '#94A3B8',
    bg: 'rgba(148, 163, 184, 0.15)',
    label: 'Disconnected',
    pulse: false,
  },
  syncing: {
    color: '#06B6D4',
    bg: 'rgba(6, 182, 212, 0.15)',
    label: 'Syncing',
    pulse: true,
  },
  pairing: {
    color: '#F59E0B',
    bg: 'rgba(245, 158, 11, 0.15)',
    label: 'Pairing...',
    pulse: true,
  },
}

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({
  status,
  showLabel = true,
  className = '',
}) => {
  const config = statusConfig[status] || statusConfig.offline

  return (
    <span
      className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-medium ${className}`}
      style={{ backgroundColor: config.bg, color: config.color }}
    >
      <span className="relative flex h-2 w-2">
        {config.pulse && (
          <span
            className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
            style={{ backgroundColor: config.color }}
          />
        )}
        <span
          className="relative inline-flex rounded-full h-2 w-2"
          style={{ backgroundColor: config.color }}
        />
      </span>
      {showLabel && <span>{config.label}</span>}
    </span>
  )
}

