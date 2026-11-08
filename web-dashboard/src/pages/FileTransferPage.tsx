import React, { useState, useEffect, useRef } from 'react'
import {
  UploadCloud,
  FileText,
  Image,
  Video,
  Music,
  Archive,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  AlertCircle,
  Smartphone,
  ShieldCheck,
  XCircle,
  Wifi,
  Radio,
  StopCircle,
} from 'lucide-react'
import { PageContainer } from '../components/PageContainer'
import { ActionButton } from '../components/ActionButton'
import { StatusIndicator } from '../components/StatusIndicator'
import { useDevices } from '../hooks/useDevices'
import { useFileTransferSession } from '../hooks/useFileTransferSession'
import { FILE_TRANSFER_CONSTANTS } from '../types/fileTransfer'

export const FileTransferPage: React.FC = () => {
  const { devices, loading: loadingDevices } = useDevices()
  const activeDevices = devices.filter((d) => !d.revokedAt)

  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('')
  const [dragActive, setDragActive] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const {
    sessionState,
    dataChannelOpen,
    transferProgress,
    incomingRequest,
    history,
    errorMessage,
    connect,
    disconnect,
    sendFile,
    acceptIncoming,
    rejectIncoming,
    cancelTransfer,
  } = useFileTransferSession()

  // Auto-select first active device
  useEffect(() => {
    if (!selectedDeviceId && activeDevices.length > 0) {
      setSelectedDeviceId(activeDevices[0].deviceId)
    }
  }, [selectedDeviceId, activeDevices])

  const isConnected = sessionState === 'connected' && dataChannelOpen
  const isConnecting = sessionState === 'requesting' || sessionState === 'waiting_for_peer' || sessionState === 'connecting'

  const handleToggleConnection = () => {
    if (isConnected || isConnecting) {
      void disconnect()
    } else if (selectedDeviceId) {
      void connect(selectedDeviceId)
    }
  }

  const handleFileSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    const file = files[0]
    try {
      await sendFile(file)
    } catch (e) {
      console.error('[FileTransferPage] Send file failed:', e)
    }
  }

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      void handleFileSelect(e.dataTransfer.files)
    }
  }

  const getFileIcon = (fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase()
    if (['jpg', 'jpeg', 'png', 'dng', 'webp'].includes(ext || '')) return Image
    if (['mp4', 'mov', 'mkv'].includes(ext || '')) return Video
    if (['mp3', 'flac', 'wav'].includes(ext || '')) return Music
    if (['zip', 'tar', 'gz', 'rar'].includes(ext || '')) return Archive
    return FileText
  }

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
  }

  return (
    <PageContainer>
      {/* ─── Page Title Header ───────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-100">File Transfer</h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            End-to-end encrypted direct WebRTC data channels (64 KiB SCTP chunks, SHA-256 verified).
          </p>
        </div>

        <div className="flex items-center gap-3">
          <StatusIndicator
            status={
              isConnected
                ? 'online'
                : isConnecting
                ? 'syncing'
                : 'offline'
            }
          />

          <ActionButton
            label={isConnected || isConnecting ? 'Disconnect' : 'Connect Channel'}
            icon={isConnected || isConnecting ? StopCircle : Radio}
            variant={isConnected || isConnecting ? 'danger' : 'accent'}
            size="md"
            disabled={!selectedDeviceId || isConnecting}
            onClick={handleToggleConnection}
          />
        </div>
      </div>

      {/* ─── Error Notification Banner ──────────────────────── */}
      {errorMessage && (
        <div className="p-4 rounded-xl bg-red-950/40 border border-red-500/30 flex items-start gap-3 text-red-200">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="text-sm font-semibold text-red-300">File Transfer Notice</h4>
            <p className="text-xs mt-0.5 text-red-300/80">{errorMessage}</p>
          </div>
        </div>
      )}

      {/* ─── Incoming File Transfer Approval Modal / Banner ──── */}
      {incomingRequest && (
        <div className="p-5 rounded-2xl bg-cyan-950/50 border-2 border-cyan-500/60 shadow-xl shadow-cyan-950/30 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center text-cyan-300">
              <ArrowDown className="w-6 h-6 animate-bounce" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-cyan-400">Incoming File</span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-950 border border-cyan-500/30 text-cyan-200">
                  {formatBytes(incomingRequest.fileSize)}
                </span>
              </div>
              <h3 className="text-base font-bold text-slate-100 mt-0.5">{incomingRequest.fileName}</h3>
              <p className="text-xs text-slate-400">
                Remote Android peer is requesting to transmit this file over WebRTC DataChannel.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto">
            <ActionButton
              label="Accept & Receive"
              icon={CheckCircle2}
              variant="accent"
              size="md"
              onClick={() => acceptIncoming(incomingRequest.transferId)}
            />
            <ActionButton
              label="Decline"
              icon={XCircle}
              variant="secondary"
              size="md"
              onClick={() => rejectIncoming(incomingRequest.transferId)}
            />
          </div>
        </div>
      )}

      {/* ─── Session Setup & Controls Bar ───────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Device Selection */}
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
          <label className="text-xs font-medium text-slate-400 block mb-2 flex items-center gap-1.5">
            <Smartphone className="w-4 h-4 text-cyan-400" />
            Target Android Device
          </label>
          <select
            value={selectedDeviceId}
            onChange={(e) => setSelectedDeviceId(e.target.value)}
            disabled={isConnected || isConnecting || loadingDevices || activeDevices.length === 0}
            className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
          >
            {activeDevices.length === 0 ? (
              <option value="">No paired Android devices</option>
            ) : (
              activeDevices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.deviceName} ({d.model || 'Android'})
                </option>
              ))
            )}
          </select>
        </div>

        {/* Security & Protocol Status */}
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
          <div className="text-xs font-medium text-slate-400 mb-2 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            Security & Protocol
          </div>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between text-slate-300">
              <span className="text-slate-400">Channel Label:</span>
              <span className="font-mono text-cyan-300">{FILE_TRANSFER_CONSTANTS.DATA_CHANNEL_LABEL}</span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span className="text-slate-400">Integrity:</span>
              <span className="font-semibold text-emerald-400">SHA-256 Digest</span>
            </div>
          </div>
        </div>

        {/* Transport Metrics */}
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
          <div className="text-xs font-medium text-slate-400 mb-2 flex items-center gap-1.5">
            <Wifi className="w-4 h-4 text-cyan-400" />
            SCTP Chunk Transport
          </div>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between text-slate-300">
              <span className="text-slate-400">Chunk Size:</span>
              <span className="font-mono text-slate-200">64 KiB (Framed)</span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span className="text-slate-400">Max File Size:</span>
              <span className="font-mono text-slate-200">500 MB limit</span>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Active Transfer Progress Card ──────────────────── */}
      {transferProgress && transferProgress.status !== 'COMPLETED' && (
        <div className="p-5 rounded-2xl bg-slate-900/90 border border-cyan-500/30 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                {transferProgress.direction === 'send' ? (
                  <ArrowUp className="w-5 h-5 animate-pulse" />
                ) : (
                  <ArrowDown className="w-5 h-5 animate-pulse" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-semibold text-slate-100">{transferProgress.fileName}</h4>
                  <span className="text-[10px] px-2 py-0.5 rounded font-mono font-semibold bg-cyan-950 border border-cyan-500/30 text-cyan-300">
                    {transferProgress.status}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  {formatBytes(transferProgress.bytesTransferred)} of {formatBytes(transferProgress.fileSize)} ({transferProgress.progress}%)
                </p>
              </div>
            </div>

            <ActionButton
              label="Cancel"
              icon={XCircle}
              variant="danger"
              size="sm"
              onClick={() => cancelTransfer()}
            />
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-slate-950 rounded-full h-2.5 overflow-hidden border border-slate-800">
            <div
              className="bg-cyan-500 h-2.5 rounded-full transition-all duration-200 ease-out"
              style={{ width: `${Math.max(2, transferProgress.progress)}%` }}
            />
          </div>
        </div>
      )}

      {/* ─── Drag & Drop / File Upload Card ──────────────────── */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={(e) => void handleFileSelect(e.target.files)}
        className="hidden"
      />

      <div
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        onClick={() => {
          if (isConnected) {
            fileInputRef.current?.click()
          }
        }}
        className={`relative border-2 border-dashed rounded-2xl p-8 sm:p-12 text-center transition-all ${
          !isConnected
            ? 'border-slate-800 bg-slate-950/40 opacity-70 cursor-not-allowed'
            : dragActive
            ? 'border-cyan-400 bg-cyan-950/20 scale-[1.01]'
            : 'border-slate-700 bg-slate-900/30 hover:border-cyan-500/50 hover:bg-slate-900/50 cursor-pointer'
        }`}
      >
        <div className="max-w-md mx-auto flex flex-col items-center">
          <div
            className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4 transition-colors ${
              isConnected
                ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                : 'bg-slate-800 text-slate-500'
            }`}
          >
            <UploadCloud className="w-8 h-8" />
          </div>

          <h3 className="text-base font-bold text-slate-100">
            {isConnected ? 'Drop files here or click to browse' : 'Connect DataChannel to Send Files'}
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            {isConnected
              ? 'Transfers stream directly P2P without intermediate server storage (up to 500 MB).'
              : 'Select your paired Android phone above and click "Connect Channel" to establish a direct WebRTC DataChannel.'}
          </p>

          {isConnected && (
            <div className="mt-4">
              <ActionButton
                label="Browse Files"
                icon={UploadCloud}
                variant="accent"
                size="sm"
                onClick={() => {
                  fileInputRef.current?.click()
                }}
              />
            </div>
          )}
        </div>
      </div>

      {/* ─── Transfer History ────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-200">Transfer History</h3>
            <p className="text-xs text-slate-400">Completed files in the current WebRTC session</p>
          </div>
        </div>

        {history.length === 0 ? (
          <div className="p-8 text-center rounded-xl bg-slate-900/30 border border-slate-800/80 text-slate-500 text-xs">
            No transfers completed in this session yet.
          </div>
        ) : (
          <div className="divide-y divide-slate-800 rounded-xl bg-slate-900/60 border border-slate-800 overflow-hidden">
            {history.map((item) => {
              const IconComp = getFileIcon(item.fileName)
              return (
                <div key={item.transferId} className="p-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-slate-800 flex items-center justify-center text-slate-400">
                      <IconComp className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-slate-200">{item.fileName}</span>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                            item.status === 'COMPLETED'
                              ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/30'
                              : 'bg-red-950 text-red-400 border border-red-500/30'
                          }`}
                        >
                          {item.status}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {formatBytes(item.fileSize)} · {item.direction === 'send' ? 'Uploaded to phone' : 'Received from phone'}
                      </p>
                    </div>
                  </div>

                  <div className="text-right text-[11px] text-slate-400">
                    {item.completedAt ? new Date(item.completedAt).toLocaleTimeString() : 'Just now'}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </PageContainer>
  )
}

export default FileTransferPage
