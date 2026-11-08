import React from 'react'
import type { LucideIcon } from 'lucide-react'

interface ActionButtonProps {
  label: string
  icon?: LucideIcon
  onClick?: () => void
  variant?: 'primary' | 'secondary' | 'accent' | 'danger' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  comingSoon?: boolean
  className?: string
  fullWidth?: boolean
}

export const ActionButton: React.FC<ActionButtonProps> = ({
  label,
  icon: Icon,
  onClick,
  variant = 'primary',
  size = 'md',
  disabled = false,
  comingSoon = false,
  className = '',
  fullWidth = false,
}) => {
  const sizeClasses = {
    sm: 'px-3 py-1.5 text-xs gap-1.5',
    md: 'px-4 py-2 text-sm gap-2',
    lg: 'px-5 py-2.5 text-base gap-2.5',
  }[size]

  const variantStyles: Record<string, { bg: string; text: string; border: string; hover: string }> = {
    primary: {
      bg: 'var(--color-primary)',
      text: '#F8FAFC',
      border: 'transparent',
      hover: 'rgba(99, 102, 241, 0.85)',
    },
    accent: {
      bg: 'var(--color-accent)',
      text: '#090D18',
      border: 'transparent',
      hover: 'rgba(6, 182, 212, 0.85)',
    },
    secondary: {
      bg: 'var(--color-surface-variant)',
      text: '#F8FAFC',
      border: 'var(--color-border)',
      hover: 'rgba(30, 41, 59, 0.8)',
    },
    danger: {
      bg: 'rgba(239, 68, 68, 0.15)',
      text: '#EF4444',
      border: 'rgba(239, 68, 68, 0.3)',
      hover: 'rgba(239, 68, 68, 0.25)',
    },
    ghost: {
      bg: 'transparent',
      text: '#94A3B8',
      border: 'transparent',
      hover: 'rgba(255, 255, 255, 0.05)',
    },
  }

  const currentVariant = variantStyles[variant] || variantStyles.primary

  const handleClick = () => {
    if (disabled || comingSoon) return
    if (onClick) onClick()
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || comingSoon}
      title={comingSoon ? `${label} (Available in future phase)` : label}
      className={`inline-flex items-center justify-center font-medium rounded-xl transition-all duration-200 select-none ${sizeClasses} ${
        disabled || comingSoon ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:shadow-lg active:scale-[0.98]'
      } ${fullWidth ? 'w-full' : ''} ${className}`}
      style={{
        backgroundColor: currentVariant.bg,
        color: currentVariant.text,
        border: `1px solid ${currentVariant.border}`,
      }}
    >
      {Icon && <Icon className="w-4 h-4 shrink-0" />}
      <span>{label}</span>
      {comingSoon && (
        <span className="ml-1 text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-black/30 tracking-wider text-cyan-300">
          Soon
        </span>
      )}
    </button>
  )
}

