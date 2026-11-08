import React from 'react'

interface LoadingStateProps {
  message?: string
  subtext?: string
  className?: string
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  message = 'Loading VIRUX Ecosystem...',
  subtext = 'Synchronizing interface parameters',
  className = '',
}) => {
  return (
    <div className={`flex flex-col items-center justify-center min-h-[300px] p-8 text-center ${className}`}>
      {/* Outer pulsing ring */}
      <div className="relative w-14 h-14 mb-4 flex items-center justify-center">
        <div
          className="absolute inset-0 rounded-full animate-ping opacity-25"
          style={{ backgroundColor: 'var(--color-primary)' }}
        />
        <div
          className="w-10 h-10 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: 'var(--color-primary)', borderTopColor: 'transparent' }}
        />
        <div
          className="w-2 h-2 rounded-full absolute"
          style={{ backgroundColor: 'var(--color-accent)' }}
        />
      </div>

      <p className="text-sm font-semibold tracking-wide" style={{ color: 'var(--color-text-primary)' }}>
        {message}
      </p>

      {subtext && (
        <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
          {subtext}
        </p>
      )}
    </div>
  )
}

