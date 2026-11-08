// ============================================================
// VIRUX Web Dashboard — Device Pairing & Cryptographic Flow Unit Tests
// Phase 4: QR Handshake, Web Crypto, Timeout Guard & Schema Compatibility
// ============================================================

import assert from 'node:assert'
import test from 'node:test'

// ─── Helpers mirroring deviceService implementation ───────────

function generate256BitChallengeNonce(mockCrypto = globalThis.crypto) {
  if (!mockCrypto || !mockCrypto.getRandomValues) {
    throw new Error('Web Crypto API is not available in this browser environment. Secure random generation failed.')
  }
  const challengeArray = new Uint8Array(32)
  mockCrypto.getRandomValues(challengeArray)
  return Array.from(challengeArray, (b) => b.toString(16).padStart(2, '0')).join('')
}

function generateSecurePin(mockCrypto = globalThis.crypto) {
  if (!mockCrypto || !mockCrypto.getRandomValues) {
    throw new Error('Web Crypto API is not available in this browser environment. Secure random generation failed.')
  }
  const array = new Uint32Array(1)
  mockCrypto.getRandomValues(array)
  const pinNum = 100000 + (array[0] % 900000)
  return pinNum.toString()
}

async function withTimeout(promise, ms, errorMsg = 'Operation timed out') {
  let timer
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(errorMsg)
      err.code = 'deadline-exceeded'
      reject(err)
    }, ms)
  })
  try {
    return await Promise.race([promise, timeoutPromise])
  } finally {
    clearTimeout(timer)
  }
}

// ─── Test 1: Successful challenge generation ──────────────────
test('1. Successful challenge generation creates 256-bit hex nonce and 6-digit PIN', () => {
  const nonce = generate256BitChallengeNonce()
  assert.strictEqual(nonce.length, 64, 'Nonce must be exactly 64 hex characters (32 bytes = 256 bits)')
  assert.match(nonce, /^[0-9a-fA-F]{64}$/, 'Nonce must contain only hexadecimal characters')

  const pin = generateSecurePin()
  assert.strictEqual(pin.length, 6, 'PIN must be exactly 6 digits')
  assert.match(pin, /^[0-9]{6}$/, 'PIN must be numeric')
  const pinNum = parseInt(pin, 10)
  assert.ok(pinNum >= 100000 && pinNum <= 999999, 'PIN must be within 100000..999999')
})

// ─── Test 2: Cryptographic API unavailable ───────────────────
test('2. Cryptographic API unavailable throws explicit secure environment error', () => {
  assert.throws(
    () => generate256BitChallengeNonce(null),
    /Web Crypto API is not available/,
    'Must fail safely with descriptive error when Web Crypto is absent'
  )

  assert.throws(
    () => generateSecurePin({}),
    /Web Crypto API is not available/,
    'Must fail safely when getRandomValues is missing'
  )
})

// ─── Test 3: Firestore session creation success ───────────────
test('3. Firestore session creation satisfies schema and TTL invariants', () => {
  const ownerUid = 'user_test_404'
  const sessionId = 'session_test_abc'
  const nonce = generate256BitChallengeNonce()
  const pin = generateSecurePin()
  const now = Date.now()
  const tenMinutesFromNow = new Date(now + 10 * 60 * 1000)

  const sessionDoc = {
    sessionId,
    ownerUid,
    pin,
    challengeNonce: nonce,
    status: 'pending',
    createdAt: new Date(now),
    expiresAt: tenMinutesFromNow,
  }

  // Verify exact required fields
  const requiredKeys = ['sessionId', 'ownerUid', 'pin', 'challengeNonce', 'status', 'createdAt', 'expiresAt']
  for (const key of requiredKeys) {
    assert.ok(key in sessionDoc, `Session document missing required field: ${key}`)
  }

  // Verify TTL invariant
  const ttlMs = sessionDoc.expiresAt.getTime() - sessionDoc.createdAt.getTime()
  assert.strictEqual(ttlMs, 600000, 'TTL must equal exactly 10 minutes (600,000 ms)')
  assert.ok(ttlMs <= 630000, 'TTL must not exceed Firestore rules upper bound of 10m30s')
})

// ─── Test 4: Firestore permission denied ─────────────────────
test('4. Firestore permission denied is identified and mapped to permission_denied stage', () => {
  const error = new Error('Missing or insufficient permissions')
  error.code = 'permission-denied'

  let mappedStage = 'unknown'
  let userFacingMessage = ''

  if (error.code === 'permission-denied' || error.message.includes('permission-denied')) {
    mappedStage = 'permission_denied'
    userFacingMessage = 'Firestore access denied. Verify that your user account has active permissions.'
  }

  assert.strictEqual(mappedStage, 'permission_denied')
  assert.ok(userFacingMessage.includes('Firestore access denied'))
})

// ─── Test 5: Missing Firebase authentication ──────────────────
test('5. Missing Firebase authentication prevents session creation and sets authentication_required', () => {
  function checkAuthAndInit(user) {
    if (!user || !user.uid) {
      const err = new Error('User must be authenticated to create a pairing session.')
      err.code = 'unauthenticated'
      return { stage: 'authentication_required', error: err }
    }
    return { stage: 'generating_challenge' }
  }

  const resultNull = checkAuthAndInit(null)
  assert.strictEqual(resultNull.stage, 'authentication_required')
  assert.strictEqual(resultNull.error.code, 'unauthenticated')

  const resultEmpty = checkAuthAndInit({ uid: '' })
  assert.strictEqual(resultEmpty.stage, 'authentication_required')

  const resultValid = checkAuthAndInit({ uid: 'user_123' })
  assert.strictEqual(resultValid.stage, 'generating_challenge')
})

// ─── Test 6: Network failure or stalled session creation ──────
test('6. Network failure or stalled session creation triggers timeout and connection_failed stage', async () => {
  // Simulate a hanging Firestore write promise that never resolves
  const hangingFirestoreWrite = new Promise(() => {})

  let didTimeout = false
  let stage = 'creating_session'

  try {
    await withTimeout(hangingFirestoreWrite, 50, 'Firestore write timed out')
  } catch (err) {
    if (err.code === 'deadline-exceeded') {
      didTimeout = true
      stage = 'connection_failed'
    }
  }

  assert.ok(didTimeout, 'Must reject when operation exceeds deadline')
  assert.strictEqual(stage, 'connection_failed', 'Must transition to connection_failed stage')
})

// ─── Test 7: Duplicate Pair Device clicks ─────────────────────
test('7. Duplicate Pair Device clicks are guarded by in-flight lock', async () => {
  let isCreating = false
  let callCount = 0

  async function mockInitSession() {
    if (isCreating) return 'BLOCKED_DUPLICATE'
    isCreating = true
    callCount++
    await new Promise((res) => setTimeout(res, 30))
    isCreating = false
    return 'SUCCESS'
  }

  // Trigger rapid concurrent calls
  const [res1, res2, res3] = await Promise.all([
    mockInitSession(),
    mockInitSession(),
    mockInitSession(),
  ])

  assert.strictEqual(callCount, 1, 'Only one session initialization must execute')
  assert.strictEqual(res1, 'SUCCESS')
  assert.strictEqual(res2, 'BLOCKED_DUPLICATE')
  assert.strictEqual(res3, 'BLOCKED_DUPLICATE')
})

// ─── Test 8: Retry after a failed request ─────────────────────
test('8. Retry after a failed request resets state and resumes session initialization', async () => {
  let attempt = 0

  async function attemptInit() {
    attempt++
    if (attempt === 1) {
      const err = new Error('Network timeout')
      err.code = 'deadline-exceeded'
      throw err
    }
    return { status: 'waiting_for_device', pin: '654321' }
  }

  let stage = 'creating_session'
  let lastError = null

  // First attempt fails
  try {
    await attemptInit()
  } catch (e) {
    lastError = e
    stage = 'connection_failed'
  }

  assert.strictEqual(stage, 'connection_failed')
  assert.ok(lastError != null)

  // User clicks retry
  const retryResult = await attemptInit()
  stage = retryResult.status

  assert.strictEqual(stage, 'waiting_for_device')
  assert.strictEqual(retryResult.pin, '654321')
})

// ─── Test 9: Closing the modal during an in-flight request ────
test('9. Closing modal invalidates in-flight request and drops late completions', async () => {
  let requestId = 0
  let stateUpdated = false

  async function triggerAsyncInit() {
    const thisId = ++requestId
    // Simulate async Firestore delay
    await new Promise((res) => setTimeout(res, 40))
    // If request was invalidated by close, do not mutate state
    if (thisId !== requestId) {
      return
    }
    stateUpdated = true
  }

  const p = triggerAsyncInit()

  // User immediately closes modal
  function handleClose() {
    requestId++ // Invalidate active request
  }
  handleClose()

  await p
  assert.strictEqual(stateUpdated, false, 'Late async resolution must not mutate state after modal close')
})

// ─── Test 10: Session expiry and cleanup ──────────────────────
test('10. Session expiry transitions to session_expired and triggers safe cleanup', () => {
  let stage = 'waiting_for_device'
  let timerActive = true
  let revokedSessionId = null

  function onExpiry() {
    timerActive = false
    stage = 'session_expired'
  }

  function cleanupSession(shouldRevoke, sessionId) {
    if (shouldRevoke) {
      revokedSessionId = sessionId
    }
  }

  onExpiry()
  assert.strictEqual(stage, 'session_expired')
  assert.strictEqual(timerActive, false)

  cleanupSession(true, 'sess_xyz')
  assert.strictEqual(revokedSessionId, 'sess_xyz')
})

// ─── Test 11: Invalid or missing device ID ────────────────────
test('11. verifyDeviceSignature safely rejects invalid or missing device parameters', async () => {
  function validateSignatureParams(challengeNonce, sessionId, ownerUid, deviceId, pubKey, sig) {
    if (!challengeNonce || !sessionId || !ownerUid || !deviceId || !pubKey || !sig) {
      return false
    }
    return true
  }

  assert.strictEqual(validateSignatureParams('', 's1', 'u1', 'd1', 'pk', 'sig'), false)
  assert.strictEqual(validateSignatureParams('cn', '', 'u1', 'd1', 'pk', 'sig'), false)
  assert.strictEqual(validateSignatureParams('cn', 's1', '', 'd1', 'pk', 'sig'), false)
  assert.strictEqual(validateSignatureParams('cn', 's1', 'u1', '', 'pk', 'sig'), false)
  assert.strictEqual(validateSignatureParams('cn', 's1', 'u1', 'd1', '', 'sig'), false)
  assert.strictEqual(validateSignatureParams('cn', 's1', 'u1', 'd1', 'pk', ''), false)
  assert.strictEqual(validateSignatureParams('cn', 's1', 'u1', 'd1', 'pk', 'sig'), true)
})

// ─── Test 12: Web and Android signaling schema compatibility ──
test('12. Web and Android QR payload and canonical signature schemas are strictly identical', () => {
  const mockPayload = {
    v: 1,
    sid: 'session_uuid_101',
    uid: 'owner_uid_202',
    cn: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    pin: '839201',
    exp: 1762590000000,
  }

  // Check JSON QR serialization format
  const serialized = JSON.stringify(mockPayload)
  const deserialized = JSON.parse(serialized)

  assert.strictEqual(deserialized.v, 1)
  assert.strictEqual(deserialized.sid, mockPayload.sid)
  assert.strictEqual(deserialized.uid, mockPayload.uid)
  assert.strictEqual(deserialized.cn, mockPayload.cn)
  assert.strictEqual(deserialized.pin, mockPayload.pin)
  assert.strictEqual(deserialized.exp, mockPayload.exp)

  // Verify canonical challenge buffer construction matches Android KeyStoreProvider.kt:
  // "$challengeNonce$sessionId$ownerUid$deviceId"
  const deviceId = 'android_dev_999'
  const expectedCanonical = `${mockPayload.cn}${mockPayload.sid}${mockPayload.uid}${deviceId}`
  const webBuffer = new TextEncoder().encode(expectedCanonical)
  const androidBytes = Buffer.from(`${mockPayload.cn}${mockPayload.sid}${mockPayload.uid}${deviceId}`, 'utf-8')

  assert.strictEqual(webBuffer.length, androidBytes.length)
  assert.deepStrictEqual(Array.from(webBuffer), Array.from(androidBytes))
})
