// ============================================================
// VIRUX Web Dashboard — Foundation Page (Phase 1)
//
// This page is a placeholder that confirms the design system,
// routing, and Firebase SDK are correctly configured.
// It is NOT a final UI screen and will be replaced by the
// authentication flow in Phase 2.
// ============================================================

import { motion, type Variants, type Easing } from 'framer-motion'
import { Layers, Zap, Shield } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface Pillar {
  icon: LucideIcon
  label: string
  description: string
}

const pillars: Pillar[] = [
  {
    icon: Layers,
    label: 'Architecture',
    description: 'Monorepo with Android, Web, and Firebase layers.',
  },
  {
    icon: Zap,
    label: 'Real-Time',
    description: 'WebRTC + Firestore signaling (Phase 3).',
  },
  {
    icon: Shield,
    label: 'Secure',
    description: 'Deny-by-default Firestore rules (Phase 2).',
  },
]

// Framer Motion requires typed Easing values — not plain strings
const easeOut: Easing = 'easeOut'

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.15, delayChildren: 0.3 },
  },
}

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: easeOut },
  },
}

export default function FoundationPage() {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6 py-16"
      style={{ backgroundColor: 'var(--color-background)' }}
    >
      <motion.div
        className="text-center max-w-2xl w-full"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {/* Logo / Brand */}
        <motion.div variants={itemVariants} className="mb-4">
          <h1
            className="text-7xl font-bold tracking-[0.5em] virux-gradient-text"
            style={{ fontFamily: 'var(--font-family-base)' }}
          >
            VIRUX
          </h1>
        </motion.div>

        {/* Tagline */}
        <motion.p
          variants={itemVariants}
          className="text-lg tracking-widest mb-10"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          Your Devices. One Ecosystem.
        </motion.p>

        {/* Phase badge */}
        <motion.div variants={itemVariants} className="flex justify-center mb-12">
          <span
            className="inline-flex items-center gap-2 px-5 py-2 rounded-full text-sm font-medium border"
            style={{
              backgroundColor: 'var(--color-surface)',
              borderColor: 'var(--color-border)',
              color: 'var(--color-accent)',
            }}
          >
            <span className="w-2 h-2 rounded-full bg-current animate-pulse" />
            Phase 1 — Foundation Initialized
          </span>
        </motion.div>

        {/* Pillars grid */}
        <motion.div
          className="grid grid-cols-1 sm:grid-cols-3 gap-4"
          variants={containerVariants}
        >
          {pillars.map(({ icon: Icon, label, description }) => (
            <motion.div
              key={label}
              variants={itemVariants}
              className="rounded-xl border p-6 text-left transition-colors"
              style={{
                backgroundColor: 'var(--color-surface)',
                borderColor: 'var(--color-border)',
              }}
              whileHover={{
                borderColor: 'var(--color-primary)',
                transition: { duration: 0.2 },
              }}
            >
              <Icon
                className="w-6 h-6 mb-3"
                style={{ color: 'var(--color-primary)' }}
              />
              <p
                className="font-semibold mb-1 text-sm tracking-wide"
                style={{ color: 'var(--color-text-primary)' }}
              >
                {label}
              </p>
              <p
                className="text-xs leading-relaxed"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                {description}
              </p>
            </motion.div>
          ))}
        </motion.div>

        {/* Footer note */}
        <motion.p
          variants={itemVariants}
          className="text-xs mt-10"
          style={{ color: 'var(--color-text-muted)' }}
        >
          Design system · Firebase SDK · Navigation ready · Phase 2 pending approval
        </motion.p>
      </motion.div>
    </div>
  )
}
