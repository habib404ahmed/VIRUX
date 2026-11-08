import React from 'react'

interface DashboardCardProps {
  title?: string
  subtitle?: string
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
  interactive?: boolean
  onClick?: () => void
}

export const DashboardCard: React.FC<DashboardCardProps> = ({
  title,
  subtitle,
  action,
  children,
  className = '',
  interactive = false,
  onClick,
}) => {
  return (
    <div
      onClick={onClick}
      className={`virux-card p-5 md:p-6 ${
        interactive ? 'virux-card-interactive cursor-pointer' : ''
      } ${className}`}
      style={{ backgroundColor: 'var(--color-card)' }}
    >
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-800/80">
          <div>
            {title && <h3 className="font-semibold text-sm text-slate-100">{title}</h3>}
            {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </div>
  )
}

