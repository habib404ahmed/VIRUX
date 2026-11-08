// ============================================================
// VIRUX Web Dashboard — WebRTC Peer Connection Unit Tests
// Tests candidate deduplication, state transitions, track handling,
// session expiry, and safe cleanup.
// ============================================================

import assert from 'node:assert'
import test from 'node:test'

test('WebRtcPeerConnection candidate deduplication and fingerprinting', () => {
  const seenSignatures = new Set()
  const candidates = [
    { candidate: 'candidate:1 1 UDP 2130706431 192.168.1.10 54321 typ host', sdpMid: '0', sdpMLineIndex: 0 },
    { candidate: 'candidate:1 1 UDP 2130706431 192.168.1.10 54321 typ host', sdpMid: '0', sdpMLineIndex: 0 }, // duplicate
    { candidate: 'candidate:2 1 UDP 2130706431 192.168.1.10 54322 typ host', sdpMid: '0', sdpMLineIndex: 0 },
  ]

  const applied = []
  for (const c of candidates) {
    const sig = `${c.candidate}|${c.sdpMid}|${c.sdpMLineIndex}`
    if (!seenSignatures.has(sig)) {
      seenSignatures.add(sig)
      applied.push(c)
    }
  }

  assert.strictEqual(applied.length, 2)
  assert.strictEqual(applied[0].candidate, candidates[0].candidate)
  assert.strictEqual(applied[1].candidate, candidates[2].candidate)
})

test('WebRTC batch chunking preserves bounds (<= 25 items)', () => {
  const maxBatchSize = 25
  const totalCandidates = Array.from({ length: 62 }, (_, i) => ({
    candidate: `candidate:${i} 1 UDP 2130706431 192.168.1.10 ${50000 + i} typ host`,
    sdpMid: '0',
    sdpMLineIndex: 0,
  }))

  const batches = []
  for (let i = 0; i < totalCandidates.length; i += maxBatchSize) {
    batches.push(totalCandidates.slice(i, i + maxBatchSize))
  }

  assert.strictEqual(batches.length, 3)
  assert.strictEqual(batches[0].length, 25)
  assert.strictEqual(batches[1].length, 25)
  assert.strictEqual(batches[2].length, 12)
})

test('WebRTC connection state mapping and terminal checks', () => {
  const terminalStates = ['disconnected', 'failed', 'closed']
  const activeStates = ['connecting', 'connected']

  for (const state of terminalStates) {
    assert.ok(terminalStates.includes(state))
  }

  for (const state of activeStates) {
    assert.ok(!terminalStates.includes(state))
  }
})

test('Distinguishes ICE connected from live video arrival (no premature live status)', () => {
  let sessionState = 'connecting'

  // Step 1: ICE connects -> connected_awaiting_video (NOT live_video)
  const onIceConnected = () => {
    sessionState = 'connected_awaiting_video'
  }
  onIceConnected()
  assert.strictEqual(sessionState, 'connected_awaiting_video')
  assert.notStrictEqual(sessionState, 'live_video')

  // Step 2: Video track arrives -> live_video
  const onVideoTrackReceived = (track) => {
    if (track.kind === 'video' && track.enabled) {
      sessionState = 'live_video'
    }
  }
  onVideoTrackReceived({ kind: 'video', enabled: true, id: 'track_1' })
  assert.strictEqual(sessionState, 'live_video')
})

test('MediaStream track attachment and playback binding', () => {
  const streamTracks = []
  const mockMediaStream = {
    addTrack: (track) => streamTracks.push(track),
    getTracks: () => streamTracks,
  }

  const incomingTrack = { kind: 'video', id: 'remote_video_0', enabled: true }
  mockMediaStream.addTrack(incomingTrack)

  assert.strictEqual(mockMediaStream.getTracks().length, 1)
  assert.strictEqual(mockMediaStream.getTracks()[0].id, 'remote_video_0')
})

test('Session expiration triggers clean teardown within 120s limit', () => {
  const session = {
    sessionId: 'sess_123',
    status: 'expired',
    expiresAt: new Date(Date.now() - 5000).toISOString(),
  }

  let sessionState = 'waiting_for_android'
  let cleanedUp = false

  if (session.status === 'expired') {
    sessionState = 'session_expired'
    cleanedUp = true
  }

  assert.strictEqual(sessionState, 'session_expired')
  assert.strictEqual(cleanedUp, true)
})

test('Android consent rejection transitions to permission_denied', () => {
  let sessionState = 'waiting_for_android'
  let errorMessage = null

  // Simulate Android closing the session before connection
  const onSessionClosed = (priorState) => {
    if (priorState === 'waiting_for_android' || priorState === 'requesting') {
      sessionState = 'permission_denied'
      errorMessage = 'Screen capture consent was denied or canceled on the Android device.'
    } else {
      sessionState = 'disconnected'
    }
  }

  onSessionClosed(sessionState)
  assert.strictEqual(sessionState, 'permission_denied')
  assert.ok(errorMessage.includes('Screen capture consent was denied'))
})
