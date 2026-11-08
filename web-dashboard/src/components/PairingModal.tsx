// ============================================================
// VIRUX Web Dashboard — Device Pairing Modal
// Phase 4: QR Code & Hardware Cryptographic Handshake
// ============================================================

import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  X,
  QrCode,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  RotateCw,
  Copy,
  Check,
  Loader2,
  KeyRound,
  Clock,
  Sparkles,
  WifiOff,
  ShieldAlert,
  Lock,
} from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import type { PairingSessionDocument } from '../types/device'
import {
  createPairingSession,
  listenToPairingSession,
  cancelPairingSession,
  verifyDeviceSignature,
  unpairDevice,
  checkExistingPairingSession,
} from '../services/deviceService'

interface PairingModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

export type ModalStage =
  | 'generating_challenge'
  | 'creating_session'
  | 'waiting_for_device'
  | 'verifying'
  | 'paired'
  | 'permission_denied'
  | 'authentication_required'
  | 'session_expired'
  | 'connection_failed'
  | 'error'

export const PairingModal: React.FC<PairingModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const { user, loading: authLoading } = useAuth()
  const [stage, setStage] = useState<ModalStage>('generating_challenge')
  const [session, setSession] = useState<PairingSessionDocument | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string>('')
  const [remainingSeconds, setRemainingSeconds] = useState<number>(600)
  const [copiedPin, setCopiedPin] = useState<boolean>(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [claimedDeviceId, setClaimedDeviceId] = useState<string | null>(null)

  const unsubscribeRef = useRef<(() => void) | null>(null)
  const timerIntervalRef = useRef<any>(null)
  const currentSessionIdRef = useRef<string | null>(null)
  const isCreatingRef = useRef<boolean>(false)
  const requestIdRef = useRef<number>(0)

  // ─── Cleanup helper ──────────────────────────────────────────
  const cleanupSession = useCallback(
    (shouldRevokeInFirestore = false) => {
      // Invalidate any in-flight asynchronous completions
      requestIdRef.current += 1
      isCreatingRef.current = false

      if (unsubscribeRef.current) {
        unsubscribeRef.current()
        unsubscribeRef.current = null
      }
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current)
        timerIntervalRef.current = null
      }
      if (
        shouldRevokeInFirestore &&
        user &&
        currentSessionIdRef.current &&
        stage === 'waiting_for_device'
      ) {
        cancelPairingSession(user.uid, currentSessionIdRef.current).catch((err) => {
          console.warn('[VIRUX PairingModal] Failed to revoke session on close:', err)
        })
      }
    },
    [user, stage]
  )

  // ─── Initialize or refresh pairing session ───────────────────
  const initSession = useCallback(async () => {
    if (authLoading) return

    if (!user) {
      setStage('authentication_required')
      setErrorMessage('You must be signed in with Firebase to pair an Android device.')
      return
    }

    // Prevent duplicate triggers
    if (isCreatingRef.current) return
    isCreatingRef.current = true

    const thisRequestId = ++requestIdRef.current

    cleanupSession(true)
    setErrorMessage(null)
    setClaimedDeviceId(null)
    setRemainingSeconds(600)

    try {
      // 1. Stage: generating_challenge
      setStage('generating_challenge')
      // Small pause to allow UI update
      await new Promise((res) => setTimeout(res, 50))
      if (thisRequestId !== requestIdRef.current) return

      // 2. Stage: creating_session (writes to Firestore with 10s bounded timeout)
      setStage('creating_session')

      // Check if session already exists in Firestore (useful after timeout recovery)
      if (currentSessionIdRef.current) {
        const existing = await checkExistingPairingSession(user.uid, currentSessionIdRef.current)
        if (existing && existing.status === 'pending' && thisRequestId === requestIdRef.current) {
          setSession(existing)
          setStage('waiting_for_device')
          isCreatingRef.current = false
          return
        }
      }

      const { session: newSession, qrDataUrl: newQrUrl } = await createPairingSession(user.uid)
      if (thisRequestId !== requestIdRef.current) return

      setSession(newSession)
      currentSessionIdRef.current = newSession.sessionId
      setQrDataUrl(newQrUrl)
      setStage('waiting_for_device')

      // Start 10-minute expiry countdown (10 * 60 = 600s)
      timerIntervalRef.current = setInterval(() => {
        setRemainingSeconds((prev) => {
          if (prev <= 1) {
            clearInterval(timerIntervalRef.current)
            timerIntervalRef.current = null
            setStage('session_expired')
            return 0
          }
          return prev - 1
        })
      }, 1000)

      // Subscribe to real-time session changes in Firestore
      unsubscribeRef.current = listenToPairingSession(user.uid, newSession.sessionId, async (snap) => {
        if (!snap || thisRequestId !== requestIdRef.current) return

        if (snap.status === 'claimed') {
          // Device has scanned and submitted claim payload
          setStage('verifying')

          if (!snap.challengeNonce || !snap.claimedByDeviceId || !snap.devicePublicKey || !snap.signature) {
            if (user && snap.claimedByDeviceId) {
              unpairDevice(user.uid, snap.claimedByDeviceId).catch((err: any) => {
                console.warn('[VIRUX PairingModal] Failed to remove incomplete device:', err)
              })
            }
            setErrorMessage('Incomplete claim payload received from scanning device. Device rejected.')
            setStage('error')
            return
          }

          // Cryptographic ECDSA signature verification via Web Crypto API
          const isValid = await verifyDeviceSignature(
            snap.challengeNonce,
            snap.sessionId,
            snap.ownerUid,
            snap.claimedByDeviceId,
            snap.devicePublicKey,
            snap.signature
          )

          if (thisRequestId !== requestIdRef.current) return

          if (isValid) {
            setClaimedDeviceId(snap.claimedByDeviceId)
            setStage('paired')
            if (onSuccess) onSuccess()
          } else {
            // Immediate safe rejection & cleanup: Purge unverified device from Firestore
            if (user && snap.claimedByDeviceId) {
              unpairDevice(user.uid, snap.claimedByDeviceId).catch((err: any) => {
                console.warn('[VIRUX PairingModal] Failed to remove unverified device:', err)
              })
            }
            setErrorMessage(
              'Hardware signature verification failed: The scanning device did not produce a valid ECDSA signature corresponding to its reported key.'
            )
            setStage('error')
          }
        } else if (snap.status === 'revoked') {
          setStage('session_expired')
        }
      })
    } catch (err: any) {
      if (thisRequestId !== requestIdRef.current) return
      console.error('[VIRUX PairingModal] Initialization error:', err)

      const code = err?.code || ''
      const msg = err?.message || ''

      if (code === 'permission-denied' || msg.includes('permission-denied') || msg.includes('insufficient permissions')) {
        setStage('permission_denied')
        setErrorMessage('Firestore access denied. Verify that your user account has active permissions.')
      } else if (
        code === 'deadline-exceeded' ||
        code === 'unavailable' ||
        msg.includes('timed out') ||
        msg.includes('timeout') ||
        msg.includes('network') ||
        msg.includes('offline')
      ) {
        setStage('connection_failed')
        setErrorMessage(msg || 'Network timed out while writing session document to Firestore. Check your connection.')
      } else if (code === 'unauthenticated' || msg.includes('unauthenticated') || msg.includes('authenticated')) {
        setStage('authentication_required')
        setErrorMessage('Your login session has expired. Please sign in to create a pairing session.')
      } else {
        setStage('error')
        setErrorMessage(msg || 'Failed to initialize pairing session.')
      }
    } finally {
      if (thisRequestId === requestIdRef.current) {
        isCreatingRef.current = false
      }
    }
  }, [user, authLoading, cleanupSession, onSuccess])

  // Trigger init on modal open or when auth finishes loading
  useEffect(() => {
    if (isOpen) {
      if (!authLoading) {
        initSession()
      }
    } else {
      cleanupSession(true)
      currentSessionIdRef.current = null
      setSession(null)
      setQrDataUrl('')
    }

    return () => {
      cleanupSession(true)
    }
  }, [isOpen, authLoading, initSession, cleanupSession])

  // Copy PIN to clipboard
  const handleCopyPin = () => {
    if (!session?.pin) return
    navigator.clipboard.writeText(session.pin)
    setCopiedPin(true)
    setTimeout(() => setCopiedPin(false), 2000)
  }

  // Handle user close
  const handleClose = () => {
    cleanupSession(true)
    onClose()
  }

  if (!isOpen) return null

  const minutes = Math.floor(remainingSeconds / 60)
  const seconds = remainingSeconds % 60
  const formattedTime = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  const progressPercent = (remainingSeconds / 600) * 100

  const isBusy = stage === 'generating_challenge' || stage === 'creating_session' || stage === 'verifying'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
      onClick={handleClose}
    >
      <div
        className="virux-card max-w-md w-full p-6 space-y-5 relative overflow-hidden shadow-2xl border border-slate-800"
        style={{ backgroundColor: 'var(--color-card)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Subtle Ambient Glow */}
        <div
          className="absolute -right-20 -top-20 w-52 h-52 rounded-full opacity-20 pointer-events-none blur-3xl"
          style={{ background: 'radial-gradient(circle, #6366F1 0%, #06B6D4 100%)' }}
        />

        {/* Modal Header */}
        <div className="flex items-start justify-between border-b border-slate-800 pb-4 relative z-10">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{
                backgroundColor: 'rgba(99, 102, 241, 0.1)',
                border: '1px solid rgba(99, 102, 241, 0.25)',
              }}
            >
              <QrCode className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-100">Pair Android Device</h3>
              <p className="text-xs text-slate-400">Your Devices. One Ecosystem.</p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ─── State: generating_challenge ─────────────────────── */}
        {stage === 'generating_challenge' && (
          <div className="py-12 flex flex-col items-center justify-center space-y-4 text-center">
            <Loader2 className="w-10 h-10 text-cyan-400 animate-spin" />
            <div>
              <h4 className="text-sm font-semibold text-slate-200">Generating Cryptographic Challenge</h4>
              <p className="text-xs text-slate-400 mt-1 max-w-xs">
                Creating 256-bit cryptographic challenge & secure PIN via Web Crypto API...
              </p>
            </div>
          </div>
        )}

        {/* ─── State: creating_session ─────────────────────────── */}
        {stage === 'creating_session' && (
          <div className="py-12 flex flex-col items-center justify-center space-y-4 text-center">
            <Loader2 className="w-10 h-10 text-cyan-400 animate-spin" />
            <div>
              <h4 className="text-sm font-semibold text-slate-200">Creating Secure Session</h4>
              <p className="text-xs text-slate-400 mt-1 max-w-xs">
                Writing session document to Firestore (bounded 10s timeout)...
              </p>
            </div>
          </div>
        )}

        {/* ─── State: waiting_for_device (QR Ready) ────────────── */}
        {stage === 'waiting_for_device' && session && (
          <div className="space-y-5 relative z-10">
            {/* QR Code Container */}
            <div className="flex flex-col items-center justify-center">
              <div className="relative p-3.5 rounded-2xl bg-slate-950 border border-slate-800 shadow-inner group">
                <div className="absolute top-2 left-2 w-4 h-4 border-t-2 border-l-2 border-cyan-400 rounded-tl-sm pointer-events-none" />
                <div className="absolute top-2 right-2 w-4 h-4 border-t-2 border-r-2 border-cyan-400 rounded-tr-sm pointer-events-none" />
                <div className="absolute bottom-2 left-2 w-4 h-4 border-b-2 border-l-2 border-cyan-400 rounded-bl-sm pointer-events-none" />
                <div className="absolute bottom-2 right-2 w-4 h-4 border-b-2 border-r-2 border-cyan-400 rounded-br-sm pointer-events-none" />

                <img
                  src={qrDataUrl}
                  alt="Pairing QR Code"
                  className="w-56 h-56 rounded-xl object-contain"
                />
              </div>

              <p className="text-xs text-slate-400 mt-3 flex items-center gap-1.5 font-medium">
                <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                Scan using the VIRUX Android camera
              </p>
            </div>

            {/* Expiry Timer Bar */}
            <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400 flex items-center gap-1.5 font-mono">
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                  Expires in: <span className="text-slate-200 font-semibold">{formattedTime}</span>
                </span>
                <button
                  type="button"
                  onClick={initSession}
                  disabled={isBusy}
                  className="text-xs text-cyan-400 hover:text-cyan-300 disabled:opacity-50 flex items-center gap-1 transition"
                  title="Regenerate session"
                >
                  <RotateCw className="w-3 h-3" />
                  Regenerate
                </button>
              </div>

              <div className="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-1000"
                  style={{
                    width: `${progressPercent}%`,
                    background:
                      remainingSeconds < 60
                        ? '#EF4444'
                        : 'linear-gradient(90deg, #6366F1, #06B6D4)',
                  }}
                />
              </div>
            </div>

            {/* Manual PIN Code Fallback */}
            <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 block">
                  Manual Pairing PIN
                </span>
                <div className="flex items-center gap-2 mt-0.5">
                  <KeyRound className="w-4 h-4 text-indigo-400" />
                  <span className="font-mono text-lg font-bold tracking-widest text-slate-100">
                    {session.pin}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleCopyPin}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 flex items-center gap-1.5 transition"
              >
                {copiedPin ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-slate-400" />
                    Copy
                  </>
                )}
              </button>
            </div>

            {/* Cryptographic Assurance Pill */}
            <div className="flex items-center gap-2 p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-[11px] text-indigo-300">
              <ShieldCheck className="w-4 h-4 text-cyan-400 shrink-0" />
              <span>Hardware-backed EC P-256 challenge-response identity.</span>
            </div>
          </div>
        )}

        {/* ─── State: verifying ────────────────────────────────── */}
        {stage === 'verifying' && (
          <div className="py-12 flex flex-col items-center justify-center space-y-4 text-center">
            <div className="relative">
              <Loader2 className="w-12 h-12 text-cyan-400 animate-spin" />
              <ShieldCheck className="w-5 h-5 text-indigo-400 absolute inset-0 m-auto" />
            </div>
            <div>
              <h4 className="text-base font-bold text-slate-100">Verifying Hardware Identity</h4>
              <p className="text-xs text-slate-400 mt-1 max-w-xs">
                Executing ECDSA P-256 cryptographic signature validation via Web Crypto API...
              </p>
            </div>
          </div>
        )}

        {/* ─── State: paired ───────────────────────────────────── */}
        {stage === 'paired' && (
          <div className="py-8 flex flex-col items-center justify-center space-y-4 text-center">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-400 shadow-lg shadow-emerald-500/10">
              <CheckCircle2 className="w-9 h-9" />
            </div>
            <div>
              <h4 className="text-lg font-bold text-slate-100">Device Successfully Paired</h4>
              <p className="text-xs text-slate-400 mt-1 max-w-xs">
                {claimedDeviceId
                  ? `Device ${claimedDeviceId.substring(0, 8)}... has been authenticated and added to your mesh.`
                  : 'Your Android device has been cryptographically verified and registered.'}
              </p>
            </div>

            <div className="pt-3 w-full">
              <button
                type="button"
                onClick={handleClose}
                className="w-full py-2.5 px-4 rounded-xl font-semibold text-xs text-white bg-indigo-600 hover:bg-indigo-500 transition shadow-lg shadow-indigo-600/25"
              >
                Done
              </button>
            </div>
          </div>
        )}

        {/* ─── State: permission_denied ────────────────────────── */}
        {stage === 'permission_denied' && (
          <div className="py-8 flex flex-col items-center justify-center space-y-4 text-center">
            <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/25 flex items-center justify-center text-rose-400">
              <ShieldAlert className="w-8 h-8" />
            </div>
            <div>
              <h4 className="text-base font-bold text-slate-100">Firestore Permission Denied</h4>
              <p className="text-xs text-rose-300 mt-1 max-w-xs break-words">
                {errorMessage || 'Missing or insufficient permissions to create a pairing session.'}
              </p>
            </div>

            <div className="pt-2 w-full flex gap-2">
              <button
                type="button"
                onClick={handleClose}
                className="flex-1 py-2 px-4 rounded-xl text-xs font-medium text-slate-400 hover:bg-slate-800 transition"
              >
                Dismiss
              </button>
              <button
                type="button"
                onClick={initSession}
                className="flex-1 py-2 px-4 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition flex items-center justify-center gap-1.5"
              >
                <RotateCw className="w-3.5 h-3.5" />
                Retry
              </button>
            </div>
          </div>
        )}

        {/* ─── State: authentication_required ──────────────────── */}
        {stage === 'authentication_required' && (
          <div className="py-8 flex flex-col items-center justify-center space-y-4 text-center">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-center text-amber-400">
              <Lock className="w-8 h-8" />
            </div>
            <div>
              <h4 className="text-base font-bold text-slate-100">Authentication Required</h4>
              <p className="text-xs text-amber-300 mt-1 max-w-xs break-words">
                {errorMessage || 'You must be signed in with Firebase to pair an Android device.'}
              </p>
            </div>

            <div className="pt-2 w-full flex gap-2">
              <button
                type="button"
                onClick={handleClose}
                className="w-full py-2 px-4 rounded-xl text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 transition"
              >
                Close
              </button>
            </div>
          </div>
        )}

        {/* ─── State: session_expired ──────────────────────────── */}
        {stage === 'session_expired' && (
          <div className="py-8 flex flex-col items-center justify-center space-y-4 text-center">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-center text-amber-400">
              <Clock className="w-8 h-8" />
            </div>
            <div>
              <h4 className="text-base font-bold text-slate-100">Pairing Session Expired</h4>
              <p className="text-xs text-slate-400 mt-1 max-w-xs">
                For security, pairing QR tokens expire after 10 minutes. Please generate a new session.
              </p>
            </div>

            <div className="pt-2 w-full flex gap-2">
              <button
                type="button"
                onClick={handleClose}
                className="flex-1 py-2 px-4 rounded-xl text-xs font-medium text-slate-400 hover:bg-slate-800 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={initSession}
                className="flex-1 py-2 px-4 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition flex items-center justify-center gap-1.5"
              >
                <RotateCw className="w-3.5 h-3.5" />
                Generate New QR
              </button>
            </div>
          </div>
        )}

        {/* ─── State: connection_failed ────────────────────────── */}
        {stage === 'connection_failed' && (
          <div className="py-8 flex flex-col items-center justify-center space-y-4 text-center">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-center text-amber-400">
              <WifiOff className="w-8 h-8" />
            </div>
            <div>
              <h4 className="text-base font-bold text-slate-100">Connection Timed Out</h4>
              <p className="text-xs text-amber-300 mt-1 max-w-xs break-words">
                {errorMessage || 'Firestore write timed out or network is unreachable. No session established.'}
              </p>
            </div>

            <div className="pt-2 w-full flex gap-2">
              <button
                type="button"
                onClick={handleClose}
                className="flex-1 py-2 px-4 rounded-xl text-xs font-medium text-slate-400 hover:bg-slate-800 transition"
              >
                Dismiss
              </button>
              <button
                type="button"
                onClick={initSession}
                className="flex-1 py-2 px-4 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition flex items-center justify-center gap-1.5"
              >
                <RotateCw className="w-3.5 h-3.5" />
                Retry
              </button>
            </div>
          </div>
        )}

        {/* ─── State: error ────────────────────────────────────── */}
        {stage === 'error' && (
          <div className="py-8 flex flex-col items-center justify-center space-y-4 text-center">
            <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/25 flex items-center justify-center text-rose-400">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <div>
              <h4 className="text-base font-bold text-slate-100">Pairing Failed</h4>
              <p className="text-xs text-rose-300 mt-1 max-w-xs break-words">
                {errorMessage || 'An error occurred during pairing handshake.'}
              </p>
            </div>

            <div className="pt-2 w-full flex gap-2">
              <button
                type="button"
                onClick={handleClose}
                className="flex-1 py-2 px-4 rounded-xl text-xs font-medium text-slate-400 hover:bg-slate-800 transition"
              >
                Dismiss
              </button>
              <button
                type="button"
                onClick={initSession}
                className="flex-1 py-2 px-4 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition flex items-center justify-center gap-1.5"
              >
                <RotateCw className="w-3.5 h-3.5" />
                Try Again
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
