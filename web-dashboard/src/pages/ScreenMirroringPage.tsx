import React, { useState, useRef, useEffect } from 'react'
import {
  Cast,
  Maximize2,
  Minimize2,
  Play,
  Square,
  Smartphone,
  Info,
  ShieldCheck,
  AlertCircle,
  RefreshCw,
  Wifi,
  Radio,
  XCircle,
} from 'lucide-react'
import { PageContainer } from '../components/PageContainer'
import { ActionButton } from '../components/ActionButton'
import { StatusIndicator } from '../components/StatusIndicator'
import { useDevices } from '../hooks/useDevices'
import { useScreenMirrorSession } from '../hooks/useScreenMirrorSession'

export const ScreenMirroringPage: React.FC = () => {
  const { devices, loading: loadingDevices } = useDevices()
  const activeDevices = devices.filter((d) => !d.revokedAt)

  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('')
  const [resolution, setResolution] = useState<'1080p' | '720p' | '480p'>('720p')
  const [frameRate, setFrameRate] = useState<'60fps' | '30fps'>('30fps')
  const [isFullscreen, setIsFullscreen] = useState(false)

  const {
    sessionState,
    peerStatus,
    activeSession,
    remoteStream,
    errorMessage,
    startMirroring,
    stopMirroring,
  } = useScreenMirrorSession()

  const videoRef = useRef<HTMLVideoElement | null>(null)

  // Auto-select first active device if none selected
  useEffect(() => {
    if (!selectedDeviceId && activeDevices.length > 0) {
      setSelectedDeviceId(activeDevices[0].deviceId)
    }
  }, [selectedDeviceId, activeDevices])

  // Attach remote MediaStream to the HTML5 video element
  useEffect(() => {
    if (videoRef.current && remoteStream) {
      videoRef.current.srcObject = remoteStream
      void videoRef.current.play().catch((err) => {
        console.warn('[ScreenMirroringPage] Video autoPlay error:', err)
      })
    }
  }, [remoteStream])

  const isSessionActive =
    sessionState === 'requesting' ||
    sessionState === 'waiting_for_android' ||
    sessionState === 'capturing' ||
    sessionState === 'connecting' ||
    sessionState === 'connected_awaiting_video' ||
    sessionState === 'live_video'

  const handleToggleMirroring = () => {
    if (isSessionActive) {
      void stopMirroring()
    } else if (selectedDeviceId) {
      void startMirroring(selectedDeviceId)
    }
  }

  return (
    <PageContainer>
      {/* ─── Page Title Header ───────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-100">Screen Mirroring</h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Real-time low latency Android display stream powered by WebRTC MediaProjection.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <StatusIndicator
            status={
              sessionState === 'live_video'
                ? 'online'
                : isSessionActive
                  ? 'syncing'
                  : 'offline'
            }
          />
          <ActionButton
            label={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            icon={isFullscreen ? Minimize2 : Maximize2}
            variant="secondary"
            size="sm"
            onClick={() => setIsFullscreen(!isFullscreen)}
          />
        </div>
      </div>

      {/* ─── Architecture Status Banner ──────────────────────── */}
      <div className="p-4 rounded-xl border border-cyan-500/30 bg-cyan-500/10 flex items-start gap-3">
        <Info className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
        <div className="text-xs text-slate-300">
          <span className="font-semibold text-cyan-300 block mb-0.5">
            WebRTC Direct Peer-to-Peer Architecture (Step 4.4)
          </span>
          Native hardware video encoding (H.264/VP8) streams directly from Android MediaProjection to browser via Google STUN (<code className="text-cyan-200">stun:stun.l.google.com:19302</code>). Zero cloud relays; direct end-to-end DTLS-SRTP encryption.
        </div>
      </div>

      {/* ─── Error Notification Banner ───────────────────────── */}
      {errorMessage && (
        <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-500/10 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div className="text-xs text-rose-300">
            <span className="font-semibold block mb-0.5">Session Status</span>
            {errorMessage}
          </div>
        </div>
      )}

      {/* ─── Mirror Viewport & Stream Controls ───────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Main Viewport Column (3 cols) */}
        <div className="lg:col-span-3">
          <div
            className={`virux-card relative overflow-hidden flex flex-col items-center justify-center transition-all ${
              isFullscreen ? 'fixed inset-4 z-50 p-4' : 'min-h-[520px] p-8'
            }`}
            style={{ backgroundColor: '#060A14' }}
          >
            {/* Phone Bezel Simulator */}
            <div
              className="relative w-72 h-[520px] rounded-[40px] border-4 border-slate-700 bg-slate-950 shadow-2xl flex flex-col justify-between p-3 overflow-hidden"
              style={{
                boxShadow:
                  sessionState === 'live_video'
                    ? '0 0 35px rgba(6, 182, 212, 0.45), inset 0 0 20px rgba(99, 102, 241, 0.25)'
                    : sessionState === 'connected_awaiting_video'
                      ? '0 0 25px rgba(16, 185, 129, 0.3)'
                      : '0 10px 40px rgba(0, 0, 0, 0.8)',
              }}
            >
              {/* Dynamic Island / Camera Punch Hole */}
              <div className="w-20 h-4 bg-slate-800 rounded-full mx-auto shrink-0 z-20" />

              {/* Viewport Screen Content */}
              <div className="flex-1 flex flex-col items-center justify-center text-center p-2 relative overflow-hidden">
                {/* Real Remote Video Element */}
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`absolute inset-0 w-full h-full object-contain rounded-[32px] transition-opacity duration-300 ${
                    sessionState === 'live_video' && remoteStream
                      ? 'opacity-100 z-10'
                      : 'opacity-0 pointer-events-none'
                  }`}
                />

                {/* State-Based Viewport Overlays */}
                {(sessionState !== 'live_video' || !remoteStream) && (
                  <div className="space-y-3 z-10 px-4">
                    {sessionState === 'idle' && (
                      <>
                        <div className="w-14 h-14 rounded-2xl bg-slate-800/80 border border-slate-700 flex items-center justify-center mx-auto text-slate-400">
                          <Cast className="w-7 h-7" />
                        </div>
                        <h4 className="font-semibold text-xs text-slate-200">
                          Ready to Mirror
                        </h4>
                        <p className="text-[11px] text-slate-400">
                          Select an active device and click Start Mirroring to begin.
                        </p>
                      </>
                    )}

                    {sessionState === 'requesting' && (
                      <>
                        <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin mx-auto" />
                        <h4 className="font-semibold text-xs text-cyan-300">
                          Creating Session...
                        </h4>
                        <p className="text-[10px] text-slate-400 font-mono">
                          Publishing SDP Offer to Firestore
                        </p>
                      </>
                    )}

                    {sessionState === 'waiting_for_android' && (
                      <>
                        <div className="relative w-12 h-12 mx-auto flex items-center justify-center">
                          <div className="absolute inset-0 rounded-full border border-cyan-400 animate-ping opacity-40" />
                          <Smartphone className="w-6 h-6 text-cyan-400" />
                        </div>
                        <h4 className="font-semibold text-xs text-slate-100">
                          Awaiting Android Consent
                        </h4>
                        <p className="text-[10px] text-cyan-400/90 font-mono">
                          Accept the MediaProjection prompt on your phone
                        </p>
                        <span className="inline-block text-[10px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 font-mono">
                          TTL: 120s
                        </span>
                      </>
                    )}

                    {sessionState === 'connecting' && (
                      <>
                        <Radio className="w-8 h-8 text-indigo-400 animate-pulse mx-auto" />
                        <h4 className="font-semibold text-xs text-indigo-300">
                          Connecting Peer...
                        </h4>
                        <p className="text-[10px] text-slate-400 font-mono">
                          Checking STUN ICE Candidate Pairs
                        </p>
                      </>
                    )}

                    {sessionState === 'connected_awaiting_video' && (
                      <>
                        <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto text-emerald-400">
                          <Wifi className="w-6 h-6 animate-pulse" />
                        </div>
                        <h4 className="font-semibold text-xs text-emerald-400">
                          WebRTC Connected
                        </h4>
                        <p className="text-[10px] text-slate-400">
                          Hardware encoder initialized. Awaiting video frames...
                        </p>
                      </>
                    )}

                    {sessionState === 'permission_denied' && (
                      <>
                        <XCircle className="w-10 h-10 text-rose-400 mx-auto" />
                        <h4 className="font-semibold text-xs text-rose-300">
                          Consent Denied
                        </h4>
                        <p className="text-[10px] text-slate-400">
                          Screen capture permission was declined or canceled on the phone.
                        </p>
                      </>
                    )}

                    {sessionState === 'connection_failed' && (
                      <>
                        <AlertCircle className="w-10 h-10 text-rose-400 mx-auto" />
                        <h4 className="font-semibold text-xs text-rose-300">
                          Connection Failed
                        </h4>
                        <p className="text-[10px] text-slate-400">
                          P2P connectivity checks exhausted without direct UDP path.
                        </p>
                      </>
                    )}

                    {sessionState === 'session_expired' && (
                      <>
                        <AlertCircle className="w-10 h-10 text-amber-400 mx-auto" />
                        <h4 className="font-semibold text-xs text-amber-300">
                          Session Expired
                        </h4>
                        <p className="text-[10px] text-slate-400">
                          120-second signaling window elapsed. Please restart session.
                        </p>
                      </>
                    )}

                    {sessionState === 'disconnected' && (
                      <>
                        <div className="w-12 h-12 rounded-2xl bg-slate-800/80 border border-slate-700 flex items-center justify-center mx-auto text-slate-400">
                          <Cast className="w-6 h-6" />
                        </div>
                        <h4 className="font-semibold text-xs text-slate-300">
                          Session Disconnected
                        </h4>
                        <p className="text-[10px] text-slate-400">
                          Signaling and media channels closed cleanly.
                        </p>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Bottom Home Indicator Bar */}
              <div className="w-24 h-1 bg-slate-700 rounded-full mx-auto shrink-0 z-20" />
            </div>
          </div>
        </div>

        {/* Controls & Configuration Column (1 col) */}
        <div className="space-y-6">
          {/* Device Selection & Action Card */}
          <div className="virux-card p-5 space-y-4">
            <h3 className="text-sm font-semibold text-slate-200">Session Controls</h3>

            {/* Target Device Dropdown */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400">
                Target Device
              </label>
              {loadingDevices ? (
                <div className="h-9 bg-slate-800/50 rounded-lg animate-pulse" />
              ) : activeDevices.length === 0 ? (
                <p className="text-xs text-amber-400 py-1">
                  No paired devices available. Please pair an Android device first.
                </p>
              ) : (
                <select
                  value={selectedDeviceId}
                  onChange={(e) => setSelectedDeviceId(e.target.value)}
                  disabled={isSessionActive}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 disabled:opacity-50"
                >
                  {activeDevices.map((dev) => (
                    <option key={dev.deviceId} value={dev.deviceId}>
                      {dev.deviceName} ({dev.model})
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Main Action Button */}
            <ActionButton
              label={isSessionActive ? 'Disconnect Mirroring' : 'Start Mirroring'}
              icon={isSessionActive ? Square : Play}
              variant={isSessionActive ? 'danger' : 'primary'}
              disabled={!selectedDeviceId || activeDevices.length === 0}
              className="w-full justify-center"
              onClick={handleToggleMirroring}
            />
          </div>

          {/* Quality & Resolution Settings Card */}
          <div className="virux-card p-5 space-y-4">
            <h3 className="text-sm font-semibold text-slate-200">Stream Quality</h3>

            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-400">Target Resolution</label>
              <div className="grid grid-cols-3 gap-2">
                {(['480p', '720p', '1080p'] as const).map((res) => (
                  <button
                    key={res}
                    type="button"
                    disabled={isSessionActive}
                    onClick={() => setResolution(res)}
                    className={`px-2 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      resolution === res
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                        : 'bg-slate-800/50 text-slate-400 border border-slate-700/50 hover:bg-slate-800'
                    }`}
                  >
                    {res}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-400">Frame Rate</label>
              <div className="grid grid-cols-2 gap-2">
                {(['30fps', '60fps'] as const).map((fps) => (
                  <button
                    key={fps}
                    type="button"
                    disabled={isSessionActive}
                    onClick={() => setFrameRate(fps)}
                    className={`px-2 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      frameRate === fps
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                        : 'bg-slate-800/50 text-slate-400 border border-slate-700/50 hover:bg-slate-800'
                    }`}
                  >
                    {fps}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Connection Diagnostics Card */}
          <div className="virux-card p-5 space-y-3">
            <h3 className="text-sm font-semibold text-slate-200">P2P Diagnostics</h3>
            <div className="space-y-2 text-xs font-mono">
              <div className="flex justify-between items-center text-slate-400">
                <span>Signaling:</span>
                <span className="text-slate-200 font-semibold">{sessionState}</span>
              </div>
              <div className="flex justify-between items-center text-slate-400">
                <span>WebRTC Peer:</span>
                <span className="text-slate-200 font-semibold">{peerStatus || 'idle'}</span>
              </div>
              <div className="flex justify-between items-center text-slate-400">
                <span>Session ID:</span>
                <span className="text-cyan-400 truncate max-w-[120px]">
                  {activeSession?.sessionId.slice(0, 8) || 'none'}
                </span>
              </div>
              <div className="flex justify-between items-center text-slate-400">
                <span>Transport:</span>
                <span className="text-emerald-400">STUN (P2P)</span>
              </div>
            </div>
          </div>

          {/* Security Notice */}
          <div className="p-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Screen mirroring requires active user confirmation on the Android device. DTLS-SRTP encryption secures real-time video frames end-to-end.
            </p>
          </div>
        </div>
      </div>
    </PageContainer>
  )
}

export default ScreenMirroringPage
