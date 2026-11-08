import React from 'react'
import type { LucideIcon } from 'lucide-react'
import { ActionButton } from './ActionButton'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description: string
  actionLabel?: string
  actionIcon?: LucideIcon
  onAction?: () => void
  comingSoon?: boolean
  className?: string
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  title,
  description,
  actionLabel,
  actionIcon,
  onAction,
  comingSoon = false,
  className = '',
}) => {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center p-8 md:p-12 virux-card ${className}`}
      style={{ backgroundColor: 'var(--color-card)' }}
    >
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
        style={{
          backgroundColor: 'rgba(99, 102, 241, 0.1)',
          border: '1px solid rgba(99, 102, 241, 0.2)',
        }}
      >
        <Icon className="w-8 h-8" style={{ color: 'var(--color-primary)' }} />
      </div>

      <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--color-text-primary)' }}>
        {title}
      </h3>

      <p className="text-sm max-w-md mb-6 leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
        {description}
      </p>

      {actionLabel && (
        <ActionButton
          label={actionLabel}
          icon={actionIcon}
          onClick={onAction}
          variant="primary"
          comingSoon={comingSoon}
        />
      )}
    </div>
  )
}

