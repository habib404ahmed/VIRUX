// ============================================================
// VIRUX Design System — Design Tokens (Web)
//
// Single source of truth for all VIRUX brand values.
// Brand Personality: Premium, Futuristic, Minimal, Cinematic, Professional
// ============================================================

export const viruxTokens = {
  // ─── Colors ───────────────────────────────────────────────
  colors: {
    background:          '#090D18', // Primary background
    secondaryBackground: '#111827', // Secondary background
    cardBackground:      '#172033', // Card background
    surface:             '#111827',
    surfaceVariant:      '#1A2235',
    primary:             '#6366F1', // Primary accent (Indigo)
    primaryDark:         '#4F46E5',
    primaryLight:        '#818CF8',
    accent:              '#06B6D4', // Secondary accent (Cyan)
    accentDark:          '#0891B2',
    accentLight:         '#22D3EE',
    textPrimary:         '#F8FAFC', // Primary text
    textSecondary:       '#94A3B8', // Secondary text
    textMuted:           '#64748B',
    border:              '#1E293B',
    borderLight:         '#334155',
    divider:             '#1E293B',
    overlay:             'rgba(9, 13, 24, 0.85)',
    // Status
    success:             '#22C55E',
    warning:             '#F59E0B',
    error:               '#EF4444',
    info:                '#3B82F6',
  },

  // ─── Typography ───────────────────────────────────────────
  typography: {
    fontFamily:    '"Inter", system-ui, -apple-system, sans-serif',
    fontFamilyMono: '"JetBrains Mono", "Fira Code", monospace',
    fontSize: {
      xs:   '11px',
      sm:   '12px',
      base: '14px',
      md:   '16px',
      lg:   '18px',
      xl:   '20px',
      '2xl':'24px',
      '3xl':'30px',
      '4xl':'36px',
      '5xl':'48px',
    },
    fontWeight: {
      normal:    400,
      medium:    500,
      semibold:  600,
      bold:      700,
    },
    lineHeight: {
      tight:  1.25,
      normal: 1.5,
      relaxed: 1.75,
    },
    letterSpacing: {
      tight:  '-0.025em',
      normal: '0em',
      wide:   '0.05em',
      wider:  '0.1em',
      widest: '0.2em',
    },
  },

  // ─── Spacing (base 4px) ───────────────────────────────────
  spacing: {
    xs:   '4px',
    sm:   '8px',
    md:   '16px',
    lg:   '24px',
    xl:   '32px',
    '2xl':'48px',
    '3xl':'64px',
    '4xl':'96px',
  },

  // ─── Border Radius ────────────────────────────────────────
  borderRadius: {
    sm:   '4px',
    md:   '8px',
    lg:   '12px',
    xl:   '16px',
    '2xl':'24px',
    full: '9999px',
  },

  // ─── Shadows & Glows ──────────────────────────────────────
  shadows: {
    sm:         '0 1px 2px rgba(0, 0, 0, 0.4)',
    md:         '0 4px 6px -1px rgba(0, 0, 0, 0.5)',
    lg:         '0 10px 15px -3px rgba(0, 0, 0, 0.6)',
    xl:         '0 20px 25px -5px rgba(0, 0, 0, 0.7)',
    card:       '0 4px 20px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
    cardHover:  '0 10px 30px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(99, 102, 241, 0.2)',
    glow:       '0 0 20px rgba(99, 102, 241, 0.25)',
    accentGlow: '0 0 20px rgba(6, 182, 212, 0.25)',
  },

  // ─── Transitions ──────────────────────────────────────────
  animation: {
    fast:   '150ms ease',
    normal: '250ms ease',
    slow:   '350ms ease',
  },
} as const

export type ViruxTokens = typeof viruxTokens
