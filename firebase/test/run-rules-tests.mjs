// ============================================================
// VIRUX Phase 4, Step 3 — Firestore Security Rules Test Runner
// Runs directly against local Cloud Firestore Emulator (127.0.0.1:8080)
// ============================================================

import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing'
import {
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const PROJECT_ID = 'virux-504a5'
const USER_ALEX = 'user_alex_101'
const USER_BOB = 'user_bob_202'
const DEVICE_ID = 'android_dev_888'
const SESSION_ID = 'session_uuid_999'

let passed = 0
let failed = 0
let skipped = 0
const results = []

async function test(name, fn) {
  try {
    await fn()
    passed++
    results.push({ name, status: 'PASS' })
    console.log(`  \x1b[32m✔ PASS\x1b[0m: ${name}`)
  } catch (err) {
    failed++
    results.push({ name, status: 'FAIL', error: err.message || String(err) })
    console.error(`  \x1b[31m✖ FAIL\x1b[0m: ${name}`)
    console.error(`    \x1b[33mError\x1b[0m: ${err.message || String(err)}`)
  }
}

async function run() {
  console.log('\n============================================================')
  console.log('VIRUX Phase 4, Step 3 — Firestore Rules Test Suite')
  console.log('Target: firebase/firestore.rules')
  console.log('Emulator: 127.0.0.1:8080')
  console.log('============================================================\n')

  const rulesPath = path.resolve(__dirname, '../firestore.rules')
  const rules = fs.readFileSync(rulesPath, 'utf8')

  const testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules,
      host: '127.0.0.1',
      port: 8080,
    },
  })

  // ------------------------------------------------------------
  // Vector 1: Auth Boundary & Tenant Isolation
  // ------------------------------------------------------------
  console.log('\n--- Vector 1: Auth Boundary & Cross-User Isolation ---')

  await test('TC-01: Rejects unauthenticated read to pairing sessions', async () => {
    await testEnv.clearFirestore()
    const unauthCtx = testEnv.unauthenticatedContext()
    const docRef = unauthCtx.firestore().doc(`users/${USER_ALEX}/pairingSessions/${SESSION_ID}`)
    await assertFails(docRef.get())
  })

  await test('TC-02: Rejects unauthenticated read to devices', async () => {
    await testEnv.clearFirestore()
    const unauthCtx = testEnv.unauthenticatedContext()
    const docRef = unauthCtx.firestore().doc(`users/${USER_ALEX}/devices/${DEVICE_ID}`)
    await assertFails(docRef.get())
  })

  await test('TC-03: Rejects User Bob attempting to read User Alex pairing sessions', async () => {
    await testEnv.clearFirestore()
    const bobCtx = testEnv.authenticatedContext(USER_BOB)
    const docRef = bobCtx.firestore().doc(`users/${USER_ALEX}/pairingSessions/${SESSION_ID}`)
    await assertFails(docRef.get())
  })

  await test('TC-04: Rejects User Bob attempting to read User Alex devices', async () => {
    await testEnv.clearFirestore()
    const bobCtx = testEnv.authenticatedContext(USER_BOB)
    const docRef = bobCtx.firestore().doc(`users/${USER_ALEX}/devices/${DEVICE_ID}`)
    await assertFails(docRef.get())
  })

  // ------------------------------------------------------------
  // Vector 2: Phase 3 Profile Hardening Preservation
  // ------------------------------------------------------------
  console.log('\n--- Vector 2: Phase 3 Profile Hardening Preservation ---')

  await test('TC-05a: Allows owner to create valid profile with optional fields present', async () => {
    await testEnv.clearFirestore()
    const alexCtx = testEnv.authenticatedContext(USER_ALEX)
    const profileRef = alexCtx.firestore().doc(`users/${USER_ALEX}`)
    await assertSucceeds(
      profileRef.set({
        uid: USER_ALEX,
        email: 'alex@virux.app',
        displayName: 'Alex Smith',
        photoUrl: 'https://virux.app/avatars/alex.png',
        accountStatus: 'active',
        provider: 'password',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    )
  })

  await test('TC-05b: Allows owner to create valid profile with optional fields set to null', async () => {
    await testEnv.clearFirestore()
    const alexCtx = testEnv.authenticatedContext(USER_ALEX)
    const profileRef = alexCtx.firestore().doc(`users/${USER_ALEX}`)
    await assertSucceeds(
      profileRef.set({
        uid: USER_ALEX,
        email: 'alex@virux.app',
        displayName: null,
        photoUrl: null,
        accountStatus: 'active',
        provider: 'password',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    )
  })

  await test('TC-05c: Allows owner to create valid profile with optional fields omitted', async () => {
    await testEnv.clearFirestore()
    const alexCtx = testEnv.authenticatedContext(USER_ALEX)
    const profileRef = alexCtx.firestore().doc(`users/${USER_ALEX}`)
    await assertSucceeds(
      profileRef.set({
        uid: USER_ALEX,
        email: 'alex@virux.app',
        accountStatus: 'active',
        provider: 'password',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    )
  })

  await test('TC-06: Rejects profile mutation of immutable uid or email', async () => {
    await testEnv.clearFirestore()
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc(`users/${USER_ALEX}`).set({
        uid: USER_ALEX,
        email: 'alex@virux.app',
        displayName: 'Alex',
        photoUrl: null,
        accountStatus: 'active',
        provider: 'password',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    })

    const alexCtx = testEnv.authenticatedContext(USER_ALEX)
    const profileRef = alexCtx.firestore().doc(`users/${USER_ALEX}`)
    await assertFails(
      profileRef.update({
        email: 'attacker@evil.com',
        updatedAt: new Date(),
      })
    )
  })

  await test('TC-07: Rejects profile deletion', async () => {
    await testEnv.clearFirestore()
    const alexCtx = testEnv.authenticatedContext(USER_ALEX)
    const profileRef = alexCtx.firestore().doc(`users/${USER_ALEX}`)
    await assertFails(profileRef.delete())
  })

  // ------------------------------------------------------------
  // Vector 3: Pairing Session Creation Validation
  // ------------------------------------------------------------
  console.log('\n--- Vector 3: Pairing Session Creation Validation ---')

  await test('TC-08: Allows creating valid pending pairing session (6-digit PIN, 64-hex nonce, < 10m expiry)', async () => {
    await testEnv.clearFirestore()
    const alexCtx = testEnv.authenticatedContext(USER_ALEX)
    const sessionRef = alexCtx.firestore().doc(`users/${USER_ALEX}/pairingSessions/${SESSION_ID}`)
    const expiresAt = Timestamp.fromMillis(Date.now() + 600 * 1000)

    await assertSucceeds(
      sessionRef.set({
        sessionId: SESSION_ID,
        ownerUid: USER_ALEX,
        pin: '849201',
        challengeNonce: 'a'.repeat(64),
        status: 'pending',
        createdAt: serverTimestamp(),
        expiresAt: expiresAt,
      })
    )
  })

  await test('TC-09: Rejects session creation with invalid PIN format (non-numeric or wrong length)', async () => {
    await testEnv.clearFirestore()
    const alexCtx = testEnv.authenticatedContext(USER_ALEX)
    const sessionRef = alexCtx.firestore().doc(`users/${USER_ALEX}/pairingSessions/${SESSION_ID}`)
    const now = new Date()
    const expiresAt = new Date(now.getTime() + 600 * 1000)

    await assertFails(
      sessionRef.set({
        sessionId: SESSION_ID,
        ownerUid: USER_ALEX,
        pin: '12345', // 5 digits
        challengeNonce: 'a'.repeat(64),
        status: 'pending',
        createdAt: now,
        expiresAt: expiresAt,
      })
    )
  })

  await test('TC-10: Rejects session creation with invalid challenge nonce format', async () => {
    await testEnv.clearFirestore()
    const alexCtx = testEnv.authenticatedContext(USER_ALEX)
    const sessionRef = alexCtx.firestore().doc(`users/${USER_ALEX}/pairingSessions/${SESSION_ID}`)
    const now = new Date()
    const expiresAt = new Date(now.getTime() + 600 * 1000)

    await assertFails(
      sessionRef.set({
        sessionId: SESSION_ID,
        ownerUid: USER_ALEX,
        pin: '849201',
        challengeNonce: 'not_a_valid_64_hex_nonce',
        status: 'pending',
        createdAt: now,
        expiresAt: expiresAt,
      })
    )
  })

  await test('TC-11: Rejects session creation with excessive expiry (> 10m30s)', async () => {
    await testEnv.clearFirestore()
    const alexCtx = testEnv.authenticatedContext(USER_ALEX)
    const sessionRef = alexCtx.firestore().doc(`users/${USER_ALEX}/pairingSessions/${SESSION_ID}`)
    const now = new Date()
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000)

    await assertFails(
      sessionRef.set({
        sessionId: SESSION_ID,
        ownerUid: USER_ALEX,
        pin: '849201',
        challengeNonce: 'b'.repeat(64),
        status: 'pending',
        createdAt: now,
        expiresAt: expiresAt,
      })
    )
  })

  // ------------------------------------------------------------
  // Vector 4: Atomic Device Pairing & getAfter() Enforcement
  // ------------------------------------------------------------
  console.log('\n--- Vector 4: Atomic Device Pairing & getAfter() Enforcement ---')

  async function seedPendingSession() {
    await testEnv.clearFirestore()
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const now = new Date()
      await ctx.firestore().doc(`users/${USER_ALEX}/pairingSessions/${SESSION_ID}`).set({
        sessionId: SESSION_ID,
        ownerUid: USER_ALEX,
        pin: '849201',
        challengeNonce: 'c'.repeat(64),
        status: 'pending',
        createdAt: now,
        expiresAt: new Date(now.getTime() + 600 * 1000),
      })
    })
  }

  await test('TC-12: Rejects claiming pairing session without creating device in same transaction', async () => {
    await seedPendingSession()
    const alexCtx = testEnv.authenticatedContext(USER_ALEX)
    const sessionRef = alexCtx.firestore().doc(`users/${USER_ALEX}/pairingSessions/${SESSION_ID}`)

    await assertFails(
      sessionRef.update({
        status: 'claimed',
        claimedByDeviceId: DEVICE_ID,
        devicePublicKey: 'd'.repeat(64),
        signature: 'e'.repeat(64),
        claimedAt: new Date(),
      })
    )
  })

  await test('TC-13: Rejects creating device document without claiming pairing session in same transaction', async () => {
    await seedPendingSession()
    const alexCtx = testEnv.authenticatedContext(USER_ALEX)
    const devRef = alexCtx.firestore().doc(`users/${USER_ALEX}/devices/${DEVICE_ID}`)
    const now = new Date()

    await assertFails(
      devRef.set({
        deviceId: DEVICE_ID,
        ownerUid: USER_ALEX,
        deviceName: 'Pixel 9 Pro',
        deviceType: 'phone',
        manufacturer: 'Google',
        model: 'Pixel 9 Pro',
        androidVersion: '15',
        sdkVersion: 35,
        appVersion: '1.0.0',
        devicePublicKey: 'd'.repeat(64),
        batteryLevel: 85,
        isCharging: true,
        networkType: 'wifi',
        capabilities: { fileTransfer: true, screenMirror: true, notifications: true, clipboard: true },
        createdAt: now,
        lastSeen: now,
        revokedAt: null,
        pairingSessionId: SESSION_ID,
      })
    )
  })

  await test('TC-14: Allows atomic transaction claiming session AND registering device together', async () => {
    await seedPendingSession()
    const alexCtx = testEnv.authenticatedContext(USER_ALEX)
    const db = alexCtx.firestore()

    await assertSucceeds(
      db.runTransaction(async (tx) => {
        const sessionRef = db.doc(`users/${USER_ALEX}/pairingSessions/${SESSION_ID}`)
        const devRef = db.doc(`users/${USER_ALEX}/devices/${DEVICE_ID}`)

        tx.update(sessionRef, {
          status: 'claimed',
          claimedByDeviceId: DEVICE_ID,
          devicePublicKey: 'f'.repeat(64),
          signature: '0'.repeat(64),
          claimedAt: serverTimestamp(),
        })

        tx.set(devRef, {
          deviceId: DEVICE_ID,
          ownerUid: USER_ALEX,
          deviceName: 'Pixel 9 Pro',
          deviceType: 'phone',
          manufacturer: 'Google',
          model: 'Pixel 9 Pro',
          androidVersion: '15',
          sdkVersion: 35,
          appVersion: '1.0.0',
          devicePublicKey: 'f'.repeat(64),
          batteryLevel: 85,
          isCharging: true,
          networkType: 'wifi',
          capabilities: { fileTransfer: true, screenMirror: true, notifications: true, clipboard: true },
          createdAt: serverTimestamp(),
          lastSeen: serverTimestamp(),
          revokedAt: null,
          pairingSessionId: SESSION_ID,
        })
      })
    )
  })

  await test('TC-14b: Rejects atomic claim if public key contains invalid non-base64 characters', async () => {
    await seedPendingSession()
    const alexCtx = testEnv.authenticatedContext(USER_ALEX)
    const db = alexCtx.firestore()

    await assertFails(
      db.runTransaction(async (tx) => {
        const sessionRef = db.doc(`users/${USER_ALEX}/pairingSessions/${SESSION_ID}`)
        const devRef = db.doc(`users/${USER_ALEX}/devices/${DEVICE_ID}`)

        tx.update(sessionRef, {
          status: 'claimed',
          claimedByDeviceId: DEVICE_ID,
          devicePublicKey: 'f'.repeat(63) + '$', // invalid character $
          signature: '0'.repeat(64),
          claimedAt: serverTimestamp(),
        })

        tx.set(devRef, {
          deviceId: DEVICE_ID,
          ownerUid: USER_ALEX,
          deviceName: 'Pixel 9 Pro',
          deviceType: 'phone',
          manufacturer: 'Google',
          model: 'Pixel 9 Pro',
          androidVersion: '15',
          sdkVersion: 35,
          appVersion: '1.0.0',
          devicePublicKey: 'f'.repeat(63) + '$',
          batteryLevel: 85,
          isCharging: true,
          networkType: 'wifi',
          capabilities: { fileTransfer: true, screenMirror: true, notifications: true, clipboard: true },
          createdAt: serverTimestamp(),
          lastSeen: serverTimestamp(),
          revokedAt: null,
          pairingSessionId: SESSION_ID,
        })
      })
    )
  })

  await test('TC-14c: Rejects atomic claim if signature contains invalid non-base64 characters or is too short', async () => {
    await seedPendingSession()
    const alexCtx = testEnv.authenticatedContext(USER_ALEX)
    const db = alexCtx.firestore()

    await assertFails(
      db.runTransaction(async (tx) => {
        const sessionRef = db.doc(`users/${USER_ALEX}/pairingSessions/${SESSION_ID}`)
        const devRef = db.doc(`users/${USER_ALEX}/devices/${DEVICE_ID}`)

        tx.update(sessionRef, {
          status: 'claimed',
          claimedByDeviceId: DEVICE_ID,
          devicePublicKey: 'f'.repeat(64),
          signature: 'short', // size < 64
          claimedAt: serverTimestamp(),
        })

        tx.set(devRef, {
          deviceId: DEVICE_ID,
          ownerUid: USER_ALEX,
          deviceName: 'Pixel 9 Pro',
          deviceType: 'phone',
          manufacturer: 'Google',
          model: 'Pixel 9 Pro',
          androidVersion: '15',
          sdkVersion: 35,
          appVersion: '1.0.0',
          devicePublicKey: 'f'.repeat(64),
          batteryLevel: 85,
          isCharging: true,
          networkType: 'wifi',
          capabilities: { fileTransfer: true, screenMirror: true, notifications: true, clipboard: true },
          createdAt: serverTimestamp(),
          lastSeen: serverTimestamp(),
          revokedAt: null,
          pairingSessionId: SESSION_ID,
        })
      })
    )
  })

  await test('TC-14d: Rejects device registration if revokedAt is omitted (violates hasAll schema)', async () => {
    await seedPendingSession()
    const alexCtx = testEnv.authenticatedContext(USER_ALEX)
    const db = alexCtx.firestore()

    await assertFails(
      db.runTransaction(async (tx) => {
        const sessionRef = db.doc(`users/${USER_ALEX}/pairingSessions/${SESSION_ID}`)
        const devRef = db.doc(`users/${USER_ALEX}/devices/${DEVICE_ID}`)

        tx.update(sessionRef, {
          status: 'claimed',
          claimedByDeviceId: DEVICE_ID,
          devicePublicKey: 'f'.repeat(64),
          signature: '0'.repeat(64),
          claimedAt: serverTimestamp(),
        })

        tx.set(devRef, {
          deviceId: DEVICE_ID,
          ownerUid: USER_ALEX,
          deviceName: 'Pixel 9 Pro',
          deviceType: 'phone',
          manufacturer: 'Google',
          model: 'Pixel 9 Pro',
          androidVersion: '15',
          sdkVersion: 35,
          appVersion: '1.0.0',
          devicePublicKey: 'f'.repeat(64),
          batteryLevel: 85,
          isCharging: true,
          networkType: 'wifi',
          capabilities: { fileTransfer: true, screenMirror: true, notifications: true, clipboard: true },
          createdAt: serverTimestamp(),
          lastSeen: serverTimestamp(),
          // revokedAt intentionally omitted to verify hasAll rejection
          pairingSessionId: SESSION_ID,
        })
      })
    )
  })

  await test('TC-15: Rejects replay / duplicate claim on already claimed session', async () => {
    await seedPendingSession()
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc(`users/${USER_ALEX}/pairingSessions/${SESSION_ID}`).update({
        status: 'claimed',
      })
    })

    const alexCtx = testEnv.authenticatedContext(USER_ALEX)
    const db = alexCtx.firestore()
    const now = new Date()

    await assertFails(
      db.runTransaction(async (tx) => {
        const sessionRef = db.doc(`users/${USER_ALEX}/pairingSessions/${SESSION_ID}`)
        const devRef = db.doc(`users/${USER_ALEX}/devices/another_device`)

        tx.update(sessionRef, {
          status: 'claimed',
          claimedByDeviceId: 'another_device',
          devicePublicKey: '1'.repeat(64),
          signature: '2'.repeat(64),
          claimedAt: now,
        })

        tx.set(devRef, {
          deviceId: 'another_device',
          ownerUid: USER_ALEX,
          deviceName: 'Galaxy S24',
          deviceType: 'phone',
          manufacturer: 'Samsung',
          model: 'SM-S921B',
          androidVersion: '14',
          sdkVersion: 34,
          appVersion: '1.0.0',
          devicePublicKey: '1'.repeat(64),
          batteryLevel: 90,
          isCharging: false,
          networkType: 'wifi',
          capabilities: {},
          createdAt: now,
          lastSeen: now,
          revokedAt: null,
          pairingSessionId: SESSION_ID,
        })
      })
    )
  })

  await test('TC-16: Rejects claiming an expired session', async () => {
    await testEnv.clearFirestore()
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const past = new Date(Date.now() - 3600 * 1000)
      await ctx.firestore().doc(`users/${USER_ALEX}/pairingSessions/${SESSION_ID}`).set({
        sessionId: SESSION_ID,
        ownerUid: USER_ALEX,
        pin: '849201',
        challengeNonce: 'c'.repeat(64),
        status: 'pending',
        createdAt: past,
        expiresAt: new Date(Date.now() - 60 * 1000), // Expired
      })
    })

    const alexCtx = testEnv.authenticatedContext(USER_ALEX)
    const db = alexCtx.firestore()
    const now = new Date()

    await assertFails(
      db.runTransaction(async (tx) => {
        const sessionRef = db.doc(`users/${USER_ALEX}/pairingSessions/${SESSION_ID}`)
        const devRef = db.doc(`users/${USER_ALEX}/devices/${DEVICE_ID}`)

        tx.update(sessionRef, {
          status: 'claimed',
          claimedByDeviceId: DEVICE_ID,
          devicePublicKey: 'f'.repeat(64),
          signature: '0'.repeat(64),
          claimedAt: now,
        })

        tx.set(devRef, {
          deviceId: DEVICE_ID,
          ownerUid: USER_ALEX,
          deviceName: 'Pixel 9 Pro',
          deviceType: 'phone',
          manufacturer: 'Google',
          model: 'Pixel 9 Pro',
          androidVersion: '15',
          sdkVersion: 35,
          appVersion: '1.0.0',
          devicePublicKey: 'f'.repeat(64),
          batteryLevel: 85,
          isCharging: true,
          networkType: 'wifi',
          capabilities: {},
          createdAt: now,
          lastSeen: now,
          revokedAt: null,
          pairingSessionId: SESSION_ID,
        })
      })
    )
  })

  // ------------------------------------------------------------
  // Vector 5: Device Management & Presence
  // ------------------------------------------------------------
  console.log('\n--- Vector 5: Device Management, Renaming & Heartbeat Updates ---')

  async function seedActiveDevice() {
    await testEnv.clearFirestore()
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const now = new Date()
      await ctx.firestore().doc(`users/${USER_ALEX}/devices/${DEVICE_ID}`).set({
        deviceId: DEVICE_ID,
        ownerUid: USER_ALEX,
        deviceName: 'Pixel 9 Pro',
        deviceType: 'phone',
        manufacturer: 'Google',
        model: 'Pixel 9 Pro',
        androidVersion: '15',
        sdkVersion: 35,
        appVersion: '1.0.0',
        devicePublicKey: 'f'.repeat(64),
        batteryLevel: 85,
        isCharging: true,
        networkType: 'wifi',
        capabilities: { fileTransfer: true, screenMirror: true, notifications: true, clipboard: true },
        createdAt: now,
        lastSeen: now,
        revokedAt: null,
        pairingSessionId: SESSION_ID,
      })
    })
  }

  await test('TC-17: Allows owner to rename active device', async () => {
    await seedActiveDevice()
    const alexCtx = testEnv.authenticatedContext(USER_ALEX)
    const devRef = alexCtx.firestore().doc(`users/${USER_ALEX}/devices/${DEVICE_ID}`)

    await assertSucceeds(
      devRef.update({
        deviceName: "Alex's Work Phone",
      })
    )
  })

  await test('TC-18: Rejects mutating immutable hardware identity fields (deviceId, devicePublicKey)', async () => {
    await seedActiveDevice()
    const alexCtx = testEnv.authenticatedContext(USER_ALEX)
    const devRef = alexCtx.firestore().doc(`users/${USER_ALEX}/devices/${DEVICE_ID}`)

    await assertFails(
      devRef.update({
        devicePublicKey: 'attacker_fake_public_key',
      })
    )
  })

  await test('TC-19: Allows valid heartbeat presence update on active device', async () => {
    await seedActiveDevice()
    const alexCtx = testEnv.authenticatedContext(USER_ALEX)
    const devRef = alexCtx.firestore().doc(`users/${USER_ALEX}/devices/${DEVICE_ID}`)

    await assertSucceeds(
      devRef.update({
        lastSeen: serverTimestamp(),
        batteryLevel: 72,
        isCharging: false,
        networkType: 'cellular',
      })
    )
  })

  await test('TC-20: Rejects invalid telemetry values (battery > 100 or negative)', async () => {
    await seedActiveDevice()
    const alexCtx = testEnv.authenticatedContext(USER_ALEX)
    const devRef = alexCtx.firestore().doc(`users/${USER_ALEX}/devices/${DEVICE_ID}`)

    await assertFails(
      devRef.update({
        lastSeen: new Date(),
        batteryLevel: 150,
        isCharging: false,
        networkType: 'cellular',
      })
    )
  })

  await test('TC-21: Allows owner to unpair/delete device', async () => {
    await seedActiveDevice()
    const alexCtx = testEnv.authenticatedContext(USER_ALEX)
    const devRef = alexCtx.firestore().doc(`users/${USER_ALEX}/devices/${DEVICE_ID}`)

    await assertSucceeds(devRef.delete())
  })

  // ------------------------------------------------------------
  // Vector 6: Revocation Hardening Invariants
  // ------------------------------------------------------------
  console.log('\n--- Vector 6: Revocation Hardening Invariants ---')

  async function seedRevokedDevice() {
    await testEnv.clearFirestore()
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const past = new Date(Date.now() - 3600 * 1000)
      await ctx.firestore().doc(`users/${USER_ALEX}/devices/${DEVICE_ID}`).set({
        deviceId: DEVICE_ID,
        ownerUid: USER_ALEX,
        deviceName: 'Pixel 9 Pro',
        deviceType: 'phone',
        manufacturer: 'Google',
        model: 'Pixel 9 Pro',
        androidVersion: '15',
        sdkVersion: 35,
        appVersion: '1.0.0',
        devicePublicKey: 'f'.repeat(64),
        batteryLevel: 85,
        isCharging: true,
        networkType: 'wifi',
        capabilities: {},
        createdAt: past,
        lastSeen: past,
        revokedAt: past, // Explicitly revoked
        pairingSessionId: SESSION_ID,
      })
    })
  }

  await test('TC-22: Rejects heartbeat update from a revoked device', async () => {
    await seedRevokedDevice()
    const alexCtx = testEnv.authenticatedContext(USER_ALEX)
    const devRef = alexCtx.firestore().doc(`users/${USER_ALEX}/devices/${DEVICE_ID}`)

    await assertFails(
      devRef.update({
        lastSeen: new Date(),
        batteryLevel: 60,
        isCharging: false,
        networkType: 'wifi',
      })
    )
  })

  await test('TC-23: Rejects rename attempt on a revoked device', async () => {
    await seedRevokedDevice()
    const alexCtx = testEnv.authenticatedContext(USER_ALEX)
    const devRef = alexCtx.firestore().doc(`users/${USER_ALEX}/devices/${DEVICE_ID}`)

    await assertFails(
      devRef.update({
        deviceName: 'New Revoked Name',
      })
    )
  })

  await test('TC-24: Rejects attempting to reverse revocation (setting revokedAt back to null)', async () => {
    await seedRevokedDevice()
    const alexCtx = testEnv.authenticatedContext(USER_ALEX)
    const devRef = alexCtx.firestore().doc(`users/${USER_ALEX}/devices/${DEVICE_ID}`)

    await assertFails(
      devRef.update({
        revokedAt: null,
      })
    )
  })

  await test('TC-25: Rejects recreating device using an existing already-claimed session after unpair', async () => {
    await testEnv.clearFirestore()
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const past = new Date(Date.now() - 1000 * 60)
      await ctx.firestore().doc(`users/${USER_ALEX}/pairingSessions/${SESSION_ID}`).set({
        sessionId: SESSION_ID,
        ownerUid: USER_ALEX,
        pin: '849201',
        challengeNonce: 'a'.repeat(64),
        status: 'claimed',
        claimedByDeviceId: DEVICE_ID,
        devicePublicKey: 'f'.repeat(64),
        signature: 's'.repeat(64),
        createdAt: past,
        claimedAt: past,
        expiresAt: new Date(Date.now() + 600 * 1000),
      })
      // Device is deleted/unpaired
      await ctx.firestore().doc(`users/${USER_ALEX}/devices/${DEVICE_ID}`).delete()
    })

    const alexCtx = testEnv.authenticatedContext(USER_ALEX)
    const devRef = alexCtx.firestore().doc(`users/${USER_ALEX}/devices/${DEVICE_ID}`)
    const now = new Date()

    // Attempt recreating device pointing to the old claimed session
    await assertFails(
      devRef.set({
        deviceId: DEVICE_ID,
        ownerUid: USER_ALEX,
        deviceName: 'Pixel 9 Pro Reborn',
        deviceType: 'phone',
        manufacturer: 'Google',
        model: 'Pixel 9 Pro',
        androidVersion: '15',
        sdkVersion: 35,
        appVersion: '1.0.0',
        devicePublicKey: 'f'.repeat(64),
        batteryLevel: 95,
        isCharging: true,
        networkType: 'wifi',
        capabilities: {},
        createdAt: now,
        lastSeen: now,
        revokedAt: null,
        pairingSessionId: SESSION_ID,
      })
    )
  })

  // ------------------------------------------------------------
  // Vector 7: Default-Deny Catch-All
  // ------------------------------------------------------------
  console.log('\n--- Vector 7: Default-Deny Catch-All ---')

  await test('TC-26: Rejects write to unauthorized top-level collection', async () => {
    await testEnv.clearFirestore()
    const alexCtx = testEnv.authenticatedContext(USER_ALEX)
    const docRef = alexCtx.firestore().doc('adminSettings/globalConfig')

    await assertFails(
      docRef.set({
        maintenance: true,
      })
    )
  })

  // ------------------------------------------------------------
  // Vector 8: WebRTC Signaling Foundation & Lifecycle Invariants
  // ------------------------------------------------------------
  console.log('\n--- Vector 8: WebRTC Signaling Foundation & Lifecycle Invariants ---')

  const SIG_SESSION_ID = 'sig_session_777'
  const BATCH_ID = 'batch_uuid_123'

  async function seedActiveDeviceForSignaling() {
    await testEnv.clearFirestore()
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const past = new Date(Date.now() - 3600 * 1000)
      await ctx.firestore().doc(`users/${USER_ALEX}/devices/${DEVICE_ID}`).set({
        deviceId: DEVICE_ID,
        ownerUid: USER_ALEX,
        deviceName: 'Pixel 9 Pro',
        deviceType: 'phone',
        manufacturer: 'Google',
        model: 'Pixel 9 Pro',
        androidVersion: '15',
        sdkVersion: 35,
        appVersion: '1.0.0',
        devicePublicKey: 'f'.repeat(64),
        batteryLevel: 90,
        isCharging: true,
        networkType: 'wifi',
        capabilities: { screenMirror: true, fileTransfer: true },
        createdAt: past,
        lastSeen: past,
        revokedAt: null,
        pairingSessionId: SESSION_ID,
      })
    })
  }

  await test('TC-27: Allows device owner to create a valid signaling session (TTL <= 120s)', async () => {
    await seedActiveDeviceForSignaling()
    const alexCtx = testEnv.authenticatedContext(USER_ALEX)
    const sigRef = alexCtx.firestore().doc(`users/${USER_ALEX}/devices/${DEVICE_ID}/signaling/${SIG_SESSION_ID}`)

    await assertSucceeds(
      sigRef.set({
        sessionId: SIG_SESSION_ID,
        ownerUid: USER_ALEX,
        deviceId: DEVICE_ID,
        initiator: 'web',
        sessionType: 'screen_mirror',
        status: 'created',
        protocolVersion: '1.0',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        expiresAt: new Date(Date.now() + 60 * 1000), // 60s (< 120s limit)
      })
    )
  })

  await test('TC-28: Rejects unauthenticated read to signaling sessions', async () => {
    await seedActiveDeviceForSignaling()
    const unauthCtx = testEnv.unauthenticatedContext()
    const sigRef = unauthCtx.firestore().doc(`users/${USER_ALEX}/devices/${DEVICE_ID}/signaling/${SIG_SESSION_ID}`)
    await assertFails(sigRef.get())
  })

  await test('TC-29: Rejects another authenticated user (User Bob) reading User Alex signaling sessions', async () => {
    await seedActiveDeviceForSignaling()
    const bobCtx = testEnv.authenticatedContext(USER_BOB)
    const sigRef = bobCtx.firestore().doc(`users/${USER_ALEX}/devices/${DEVICE_ID}/signaling/${SIG_SESSION_ID}`)
    await assertFails(sigRef.get())
  })

  await test('TC-30: Rejects another authenticated user (User Bob) creating a session on User Alex device', async () => {
    await seedActiveDeviceForSignaling()
    const bobCtx = testEnv.authenticatedContext(USER_BOB)
    const sigRef = bobCtx.firestore().doc(`users/${USER_ALEX}/devices/${DEVICE_ID}/signaling/${SIG_SESSION_ID}`)

    await assertFails(
      sigRef.set({
        sessionId: SIG_SESSION_ID,
        ownerUid: USER_ALEX,
        deviceId: DEVICE_ID,
        initiator: 'web',
        sessionType: 'screen_mirror',
        status: 'created',
        protocolVersion: '1.0',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        expiresAt: new Date(Date.now() + 60 * 1000),
      })
    )
  })

  await test('TC-31: Rejects session creation for a revoked device', async () => {
    await seedRevokedDevice() // Alex device with revokedAt != null
    const alexCtx = testEnv.authenticatedContext(USER_ALEX)
    const sigRef = alexCtx.firestore().doc(`users/${USER_ALEX}/devices/${DEVICE_ID}/signaling/${SIG_SESSION_ID}`)

    await assertFails(
      sigRef.set({
        sessionId: SIG_SESSION_ID,
        ownerUid: USER_ALEX,
        deviceId: DEVICE_ID,
        initiator: 'web',
        sessionType: 'screen_mirror',
        status: 'created',
        protocolVersion: '1.0',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        expiresAt: new Date(Date.now() + 60 * 1000),
      })
    )
  })

  await test('TC-32: Rejects session creation if expiresAt exceeds 120s limit (>120s)', async () => {
    await seedActiveDeviceForSignaling()
    const alexCtx = testEnv.authenticatedContext(USER_ALEX)
    const sigRef = alexCtx.firestore().doc(`users/${USER_ALEX}/devices/${DEVICE_ID}/signaling/${SIG_SESSION_ID}`)

    await assertFails(
      sigRef.set({
        sessionId: SIG_SESSION_ID,
        ownerUid: USER_ALEX,
        deviceId: DEVICE_ID,
        initiator: 'web',
        sessionType: 'screen_mirror',
        status: 'created',
        protocolVersion: '1.0',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        expiresAt: new Date(Date.now() + 300 * 1000), // 300s > 120s
      })
    )
  })

  await test('TC-33: Rejects session creation with mismatched ownerUid or deviceId', async () => {
    await seedActiveDeviceForSignaling()
    const alexCtx = testEnv.authenticatedContext(USER_ALEX)
    const sigRef = alexCtx.firestore().doc(`users/${USER_ALEX}/devices/${DEVICE_ID}/signaling/${SIG_SESSION_ID}`)

    await assertFails(
      sigRef.set({
        sessionId: SIG_SESSION_ID,
        ownerUid: USER_BOB, // Mismatched UID
        deviceId: DEVICE_ID,
        initiator: 'web',
        sessionType: 'screen_mirror',
        status: 'created',
        protocolVersion: '1.0',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        expiresAt: new Date(Date.now() + 60 * 1000),
      })
    )
  })

  async function seedSignalingSessionWithState(status, expiresAtDeltaMs = 60000) {
    await seedActiveDeviceForSignaling()
    const now = new Date()
    const exp = new Date(Date.now() + expiresAtDeltaMs)
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc(`users/${USER_ALEX}/devices/${DEVICE_ID}/signaling/${SIG_SESSION_ID}`).set({
        sessionId: SIG_SESSION_ID,
        ownerUid: USER_ALEX,
        deviceId: DEVICE_ID,
        initiator: 'web',
        sessionType: 'screen_mirror',
        status,
        protocolVersion: '1.0',
        createdAt: now,
        updatedAt: now,
        expiresAt: exp,
      })
    })
    return { now, exp }
  }

  await test('TC-34: Allows transition from created to offer_created with valid SDP offer', async () => {
    await seedSignalingSessionWithState('created')
    const alexCtx = testEnv.authenticatedContext(USER_ALEX)
    const sigRef = alexCtx.firestore().doc(`users/${USER_ALEX}/devices/${DEVICE_ID}/signaling/${SIG_SESSION_ID}`)

    await assertSucceeds(
      sigRef.update({
        status: 'offer_created',
        updatedAt: serverTimestamp(),
        offer: {
          type: 'offer',
          sdp: 'v=0\r\no=- 42 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n',
        },
      })
    )
  })

  await test('TC-35: Rejects offer with oversized SDP payload (> 64KB)', async () => {
    await seedSignalingSessionWithState('created')
    const alexCtx = testEnv.authenticatedContext(USER_ALEX)
    const sigRef = alexCtx.firestore().doc(`users/${USER_ALEX}/devices/${DEVICE_ID}/signaling/${SIG_SESSION_ID}`)

    await assertFails(
      sigRef.update({
        status: 'offer_created',
        updatedAt: serverTimestamp(),
        offer: {
          type: 'offer',
          sdp: 'x'.repeat(66000), // > 65536
        },
      })
    )
  })

  await test('TC-36: Allows transition from offer_created to answer_created with valid SDP answer', async () => {
    await seedActiveDeviceForSignaling()
    const now = new Date()
    const exp = new Date(Date.now() + 60000)
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc(`users/${USER_ALEX}/devices/${DEVICE_ID}/signaling/${SIG_SESSION_ID}`).set({
        sessionId: SIG_SESSION_ID,
        ownerUid: USER_ALEX,
        deviceId: DEVICE_ID,
        initiator: 'web',
        sessionType: 'screen_mirror',
        status: 'offer_created',
        protocolVersion: '1.0',
        createdAt: now,
        updatedAt: now,
        expiresAt: exp,
        offer: {
          type: 'offer',
          sdp: 'v=0\r\no=- 42 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n',
        },
      })
    })

    const alexCtx = testEnv.authenticatedContext(USER_ALEX)
    const sigRef = alexCtx.firestore().doc(`users/${USER_ALEX}/devices/${DEVICE_ID}/signaling/${SIG_SESSION_ID}`)

    await assertSucceeds(
      sigRef.update({
        status: 'answer_created',
        updatedAt: serverTimestamp(),
        answer: {
          type: 'answer',
          sdp: 'v=0\r\no=- 84 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n',
        },
      })
    )
  })

  await test('TC-37: Allows progress through connecting and connected states', async () => {
    await seedActiveDeviceForSignaling()
    const now = new Date()
    const exp = new Date(Date.now() + 60000)
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc(`users/${USER_ALEX}/devices/${DEVICE_ID}/signaling/${SIG_SESSION_ID}`).set({
        sessionId: SIG_SESSION_ID,
        ownerUid: USER_ALEX,
        deviceId: DEVICE_ID,
        initiator: 'web',
        sessionType: 'screen_mirror',
        status: 'answer_created',
        protocolVersion: '1.0',
        createdAt: now,
        updatedAt: now,
        expiresAt: exp,
      })
    })

    const alexCtx = testEnv.authenticatedContext(USER_ALEX)
    const sigRef = alexCtx.firestore().doc(`users/${USER_ALEX}/devices/${DEVICE_ID}/signaling/${SIG_SESSION_ID}`)

    await assertSucceeds(
      sigRef.update({
        status: 'connecting',
        updatedAt: serverTimestamp(),
      })
    )

    await assertSucceeds(
      sigRef.update({
        status: 'connected',
        updatedAt: serverTimestamp(),
      })
    )
  })

  await test('TC-38: Rejects mutating an expired signaling session', async () => {
    // Seed an already expired session (expiresAt in the past)
    await seedActiveDeviceForSignaling()
    const past = new Date(Date.now() - 30000)
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc(`users/${USER_ALEX}/devices/${DEVICE_ID}/signaling/${SIG_SESSION_ID}`).set({
        sessionId: SIG_SESSION_ID,
        ownerUid: USER_ALEX,
        deviceId: DEVICE_ID,
        initiator: 'web',
        sessionType: 'screen_mirror',
        status: 'offer_created',
        protocolVersion: '1.0',
        createdAt: past,
        updatedAt: past,
        expiresAt: past, // Expired
      })
    })

    const alexCtx = testEnv.authenticatedContext(USER_ALEX)
    const sigRef = alexCtx.firestore().doc(`users/${USER_ALEX}/devices/${DEVICE_ID}/signaling/${SIG_SESSION_ID}`)

    await assertFails(
      sigRef.update({
        status: 'answer_created',
        updatedAt: serverTimestamp(),
        answer: {
          type: 'answer',
          sdp: 'v=0\r\n',
        },
      })
    )
  })

  await test('TC-39: Rejects mutating a terminal session (status == closed)', async () => {
    await seedSignalingSessionWithState('closed')
    const alexCtx = testEnv.authenticatedContext(USER_ALEX)
    const sigRef = alexCtx.firestore().doc(`users/${USER_ALEX}/devices/${DEVICE_ID}/signaling/${SIG_SESSION_ID}`)

    await assertFails(
      sigRef.update({
        status: 'connected',
        updatedAt: serverTimestamp(),
      })
    )
  })

  await test('TC-40: Allows creating a valid ICE candidate batch in candidateBatches subcollection', async () => {
    await seedSignalingSessionWithState('connecting')
    const alexCtx = testEnv.authenticatedContext(USER_ALEX)
    const batchRef = alexCtx.firestore().doc(`users/${USER_ALEX}/devices/${DEVICE_ID}/signaling/${SIG_SESSION_ID}/candidateBatches/${BATCH_ID}`)

    await assertSucceeds(
      batchRef.set({
        batchId: BATCH_ID,
        sessionId: SIG_SESSION_ID,
        sender: 'web',
        sequenceNumber: 0,
        candidates: [
          {
            candidate: 'candidate:1 1 UDP 2130706431 192.168.1.50 54321 typ host',
            sdpMid: '0',
            sdpMLineIndex: 0,
          },
        ],
        isComplete: false,
        createdAt: serverTimestamp(),
      })
    )
  })

  await test('TC-41: Rejects candidate batch with > 25 candidates', async () => {
    await seedSignalingSessionWithState('connecting')
    const alexCtx = testEnv.authenticatedContext(USER_ALEX)
    const batchRef = alexCtx.firestore().doc(`users/${USER_ALEX}/devices/${DEVICE_ID}/signaling/${SIG_SESSION_ID}/candidateBatches/${BATCH_ID}`)

    const excessiveCandidates = Array.from({ length: 26 }, (_, i) => ({
      candidate: `candidate:${i} 1 UDP 2130706431 192.168.1.50 ${50000 + i} typ host`,
      sdpMid: '0',
      sdpMLineIndex: 0,
    }))

    await assertFails(
      batchRef.set({
        batchId: BATCH_ID,
        sessionId: SIG_SESSION_ID,
        sender: 'web',
        sequenceNumber: 0,
        candidates: excessiveCandidates,
        isComplete: false,
        createdAt: serverTimestamp(),
      })
    )
  })

  await test('TC-42: Rejects candidate batch write to an expired session', async () => {
    await seedActiveDeviceForSignaling()
    const past = new Date(Date.now() - 30000)
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc(`users/${USER_ALEX}/devices/${DEVICE_ID}/signaling/${SIG_SESSION_ID}`).set({
        sessionId: SIG_SESSION_ID,
        ownerUid: USER_ALEX,
        deviceId: DEVICE_ID,
        initiator: 'web',
        sessionType: 'screen_mirror',
        status: 'connecting',
        protocolVersion: '1.0',
        createdAt: past,
        updatedAt: past,
        expiresAt: past, // Expired
      })
    })

    const alexCtx = testEnv.authenticatedContext(USER_ALEX)
    const batchRef = alexCtx.firestore().doc(`users/${USER_ALEX}/devices/${DEVICE_ID}/signaling/${SIG_SESSION_ID}/candidateBatches/${BATCH_ID}`)

    await assertFails(
      batchRef.set({
        batchId: BATCH_ID,
        sessionId: SIG_SESSION_ID,
        sender: 'web',
        sequenceNumber: 0,
        candidates: [],
        isComplete: true,
        createdAt: serverTimestamp(),
      })
    )
  })

  await test('TC-43: Rejects candidate batch write to a closed session', async () => {
    await seedSignalingSessionWithState('closed')
    const alexCtx = testEnv.authenticatedContext(USER_ALEX)
    const batchRef = alexCtx.firestore().doc(`users/${USER_ALEX}/devices/${DEVICE_ID}/signaling/${SIG_SESSION_ID}/candidateBatches/${BATCH_ID}`)

    await assertFails(
      batchRef.set({
        batchId: BATCH_ID,
        sessionId: SIG_SESSION_ID,
        sender: 'web',
        sequenceNumber: 0,
        candidates: [],
        isComplete: true,
        createdAt: serverTimestamp(),
      })
    )
  })

  await test('TC-44: Rejects updating or deleting an existing candidate batch (append-only enforcement)', async () => {
    await seedSignalingSessionWithState('connecting')
    const alexCtx = testEnv.authenticatedContext(USER_ALEX)
    const batchRef = alexCtx.firestore().doc(`users/${USER_ALEX}/devices/${DEVICE_ID}/signaling/${SIG_SESSION_ID}/candidateBatches/${BATCH_ID}`)

    await assertSucceeds(
      batchRef.set({
        batchId: BATCH_ID,
        sessionId: SIG_SESSION_ID,
        sender: 'web',
        sequenceNumber: 0,
        candidates: [],
        isComplete: false,
        createdAt: serverTimestamp(),
      })
    )

    // Modification is blocked
    await assertFails(
      batchRef.update({
        isComplete: true,
      })
    )

    // Deletion is blocked
    await assertFails(batchRef.delete())
  })

  await test('TC-45: Rejects unauthorized user (Bob) creating candidate batch on Alex session', async () => {
    await seedSignalingSessionWithState('connecting')
    const bobCtx = testEnv.authenticatedContext(USER_BOB)
    const batchRef = bobCtx.firestore().doc(`users/${USER_ALEX}/devices/${DEVICE_ID}/signaling/${SIG_SESSION_ID}/candidateBatches/${BATCH_ID}`)

    await assertFails(
      batchRef.set({
        batchId: BATCH_ID,
        sessionId: SIG_SESSION_ID,
        sender: 'android',
        sequenceNumber: 0,
        candidates: [],
        isComplete: true,
        createdAt: serverTimestamp(),
      })
    )
  })

  await testEnv.cleanup()

  console.log('\n============================================================')
  console.log(`TEST SUMMARY: Total: ${passed + failed + skipped} | Passed: ${passed} | Failed: ${failed} | Skipped: ${skipped}`)
  console.log('============================================================\n')

  if (failed > 0) {
    process.exit(1)
  }
}

run().catch((err) => {
  console.error('Fatal Test Runner Exception:', err)
  process.exit(1)
})
