/**
 * VIRUX Phase 4, Step 3 — Firestore Security Rules Comprehensive Test Suite
 * 
 * Target: firebase/firestore.rules
 * Framework: @firebase/rules-unit-testing
 * Project ID: virux-504a5
 * 
 * Comprehensive Test Coverage Matrix (25 Scenarios):
 * 1.  Unauthenticated access to pairing sessions (TC-01: DENIED)
 * 2.  Unauthenticated access to devices (TC-02: DENIED)
 * 3.  Cross-user access to pairing sessions (TC-03: DENIED)
 * 4.  Cross-user access to devices (TC-04: DENIED)
 * 5.  Valid user profile creation (TC-05: ALLOWED)
 * 6.  Unauthorized profile mutation of immutable fields (TC-06: DENIED)
 * 7.  Unauthorized profile deletion (TC-07: DENIED)
 * 8.  Valid pending pairing session creation (TC-08: ALLOWED)
 * 9.  Invalid session creation: non 6-digit PIN (TC-09: DENIED)
 * 10. Invalid session creation: invalid 256-bit hex nonce (TC-10: DENIED)
 * 11. Invalid session creation: excessive expiry > 10m30s (TC-11: DENIED)
 * 12. Claim session without creating device in same transaction (TC-12: DENIED)
 * 13. Create device without claiming session in same transaction (TC-13: DENIED)
 * 14. Atomic claim session + register device in single transaction (TC-14: ALLOWED)
 * 15. Replay / duplicate claim on already claimed session (TC-15: DENIED)
 * 16. Claim expired pairing session (TC-16: DENIED)
 * 17. Valid device rename by owner (TC-17: ALLOWED)
 * 18. Unauthorized mutation of immutable hardware identity (TC-18: DENIED)
 * 19. Valid telemetry & presence heartbeat update (TC-19: ALLOWED)
 * 20. Telemetry bounds violation: battery > 100% (TC-20: DENIED)
 * 21. Valid unpair / deletion by owner (TC-21: ALLOWED)
 * 22. Revoked device forbidden from sending heartbeat (TC-22: DENIED)
 * 23. Revoked device forbidden from renaming (TC-23: DENIED)
 * 24. Revocation cannot be reversed / un-done (TC-24: DENIED)
 * 25. Re-creation of device using an old already-claimed session after unpair (TC-25: DENIED)
 * 26. Default-deny lock on unauthorized root collection (TC-26: DENIED)
 */

import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import * as fs from 'fs'
import * as path from 'path'

const PROJECT_ID = 'virux-504a5'
const USER_ALEX = 'user_alex_101'
const USER_BOB = 'user_bob_202'
const DEVICE_ID = 'android_dev_888'
const SESSION_ID = 'session_uuid_999'

describe('VIRUX Firestore Security Rules — Phase 4 Hardened Matrix', () => {
  let testEnv: RulesTestEnvironment

  beforeAll(async () => {
    const rulesPath = path.resolve(__dirname, '../firestore.rules')
    const rules = fs.readFileSync(rulesPath, 'utf8')

    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        rules,
        host: '127.0.0.1',
        port: 8080,
      },
    })
  })

  afterAll(async () => {
    if (testEnv) {
      await testEnv.cleanup()
    }
  })

  beforeEach(async () => {
    if (testEnv) {
      await testEnv.clearFirestore()
    }
  })

  // ============================================================
  // VECTOR 1: Unauthenticated & Cross-User Access
  // ============================================================
  describe('Vector 1: Auth Boundary & Cross-User Isolation', () => {
    it('TC-01: Rejects unauthenticated read to pairing sessions', async () => {
      const unauthCtx = testEnv.unauthenticatedContext()
      const docRef = unauthCtx.firestore().doc(`users/${USER_ALEX}/pairingSessions/${SESSION_ID}`)
      await assertFails(docRef.get())
    })

    it('TC-02: Rejects unauthenticated read to devices', async () => {
      const unauthCtx = testEnv.unauthenticatedContext()
      const docRef = unauthCtx.firestore().doc(`users/${USER_ALEX}/devices/${DEVICE_ID}`)
      await assertFails(docRef.get())
    })

    it('TC-03: Rejects User Bob attempting to read User Alex pairing sessions', async () => {
      const bobCtx = testEnv.authenticatedContext(USER_BOB)
      const docRef = bobCtx.firestore().doc(`users/${USER_ALEX}/pairingSessions/${SESSION_ID}`)
      await assertFails(docRef.get())
    })

    it('TC-04: Rejects User Bob attempting to read User Alex devices', async () => {
      const bobCtx = testEnv.authenticatedContext(USER_BOB)
      const docRef = bobCtx.firestore().doc(`users/${USER_ALEX}/devices/${DEVICE_ID}`)
      await assertFails(docRef.get())
    })
  })

  // ============================================================
  // VECTOR 2: Phase 3 Profile Protections Preserved
  // ============================================================
  describe('Vector 2: Phase 3 Profile Hardening Preservation', () => {
    it('TC-05: Allows owner to create valid profile with active status', async () => {
      const alexCtx = testEnv.authenticatedContext(USER_ALEX)
      const profileRef = alexCtx.firestore().doc(`users/${USER_ALEX}`)
      await assertSucceeds(
        profileRef.set({
          uid: USER_ALEX,
          email: 'alex@virux.app',
          displayName: 'Alex',
          photoUrl: null,
          accountStatus: 'active',
          provider: 'password',
          createdAt: new Date(),
          updatedAt: new Date(),
        })
      )
    })

    it('TC-06: Rejects profile mutation of immutable uid or email', async () => {
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

    it('TC-07: Rejects profile deletion', async () => {
      const alexCtx = testEnv.authenticatedContext(USER_ALEX)
      const profileRef = alexCtx.firestore().doc(`users/${USER_ALEX}`)
      await assertFails(profileRef.delete())
    })
  })

  // ============================================================
  // VECTOR 3: Pairing Session Creation & Expiry Bounds
  // ============================================================
  describe('Vector 3: Pairing Session Creation Validation', () => {
    it('TC-08: Allows creating valid pending pairing session (6-digit PIN, 64-hex nonce, < 10m expiry)', async () => {
      const alexCtx = testEnv.authenticatedContext(USER_ALEX)
      const sessionRef = alexCtx.firestore().doc(`users/${USER_ALEX}/pairingSessions/${SESSION_ID}`)
      const now = new Date()
      const expiresAt = new Date(now.getTime() + 600 * 1000)

      await assertSucceeds(
        sessionRef.set({
          sessionId: SESSION_ID,
          ownerUid: USER_ALEX,
          pin: '849201',
          challengeNonce: 'a'.repeat(64),
          status: 'pending',
          createdAt: now,
          expiresAt: expiresAt,
        })
      )
    })

    it('TC-09: Rejects session creation with invalid PIN format (non-numeric or wrong length)', async () => {
      const alexCtx = testEnv.authenticatedContext(USER_ALEX)
      const sessionRef = alexCtx.firestore().doc(`users/${USER_ALEX}/pairingSessions/${SESSION_ID}`)
      const now = new Date()
      const expiresAt = new Date(now.getTime() + 600 * 1000)

      await assertFails(
        sessionRef.set({
          sessionId: SESSION_ID,
          ownerUid: USER_ALEX,
          pin: '12345',
          challengeNonce: 'a'.repeat(64),
          status: 'pending',
          createdAt: now,
          expiresAt: expiresAt,
        })
      )
    })

    it('TC-10: Rejects session creation with invalid challenge nonce format', async () => {
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

    it('TC-11: Rejects session creation with excessive expiry (> 10m30s)', async () => {
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
  })

  // ============================================================
  // VECTOR 4: Atomic Pairing Claim & Transaction Coupling (getAfter)
  // ============================================================
  describe('Vector 4: Atomic Device Pairing & getAfter() Enforcement', () => {
    beforeEach(async () => {
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
    })

    it('TC-12: Rejects claiming pairing session without creating device in same transaction', async () => {
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

    it('TC-13: Rejects creating device document without claiming pairing session in same transaction', async () => {
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

    it('TC-14: Allows atomic transaction claiming session AND registering device together', async () => {
      const alexCtx = testEnv.authenticatedContext(USER_ALEX)
      const db = alexCtx.firestore()
      const now = new Date()

      await assertSucceeds(
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
            capabilities: { fileTransfer: true, screenMirror: true, notifications: true, clipboard: true },
            createdAt: now,
            lastSeen: now,
            revokedAt: null,
            pairingSessionId: SESSION_ID,
          })
        })
      )
    })

    it('TC-15: Rejects replay / duplicate claim on already claimed session', async () => {
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

    it('TC-16: Rejects claiming an expired session', async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        const past = new Date(Date.now() - 3600 * 1000)
        await ctx.firestore().doc(`users/${USER_ALEX}/pairingSessions/${SESSION_ID}`).set({
          sessionId: SESSION_ID,
          ownerUid: USER_ALEX,
          pin: '849201',
          challengeNonce: 'c'.repeat(64),
          status: 'pending',
          createdAt: past,
          expiresAt: new Date(Date.now() - 60 * 1000),
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
  })

  // ============================================================
  // VECTOR 5: Device Management, Renaming & Heartbeat Updates
  // ============================================================
  describe('Vector 5: Device Management, Renaming & Heartbeat Updates', () => {
    beforeEach(async () => {
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
    })

    it('TC-17: Allows owner to rename device', async () => {
      const alexCtx = testEnv.authenticatedContext(USER_ALEX)
      const devRef = alexCtx.firestore().doc(`users/${USER_ALEX}/devices/${DEVICE_ID}`)

      await assertSucceeds(
        devRef.update({
          deviceName: "Alex's Work Phone",
        })
      )
    })

    it('TC-18: Rejects mutating immutable hardware identity fields (deviceId, devicePublicKey)', async () => {
      const alexCtx = testEnv.authenticatedContext(USER_ALEX)
      const devRef = alexCtx.firestore().doc(`users/${USER_ALEX}/devices/${DEVICE_ID}`)

      await assertFails(
        devRef.update({
          devicePublicKey: 'attacker_fake_public_key',
        })
      )
    })

    it('TC-19: Allows valid heartbeat presence update (lastSeen, batteryLevel, isCharging, networkType)', async () => {
      const alexCtx = testEnv.authenticatedContext(USER_ALEX)
      const devRef = alexCtx.firestore().doc(`users/${USER_ALEX}/devices/${DEVICE_ID}`)

      await assertSucceeds(
        devRef.update({
          lastSeen: new Date(),
          batteryLevel: 72,
          isCharging: false,
          networkType: 'cellular',
        })
      )
    })

    it('TC-20: Rejects invalid telemetry values (battery > 100 or negative)', async () => {
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

    it('TC-21: Allows owner to unpair/delete device', async () => {
      const alexCtx = testEnv.authenticatedContext(USER_ALEX)
      const devRef = alexCtx.firestore().doc(`users/${USER_ALEX}/devices/${DEVICE_ID}`)

      await assertSucceeds(devRef.delete())
    })
  })

  // ============================================================
  // VECTOR 6: Revocation Protection Invariants
  // ============================================================
  describe('Vector 6: Revocation Hardening Invariants', () => {
    beforeEach(async () => {
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
          revokedAt: past, // Pre-revoked
          pairingSessionId: SESSION_ID,
        })
      })
    })

    it('TC-22: Rejects heartbeat update from a revoked device', async () => {
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

    it('TC-23: Rejects rename attempt on a revoked device', async () => {
      const alexCtx = testEnv.authenticatedContext(USER_ALEX)
      const devRef = alexCtx.firestore().doc(`users/${USER_ALEX}/devices/${DEVICE_ID}`)

      await assertFails(
        devRef.update({
          deviceName: 'New Revoked Name',
        })
      )
    })

    it('TC-24: Rejects attempting to reverse revocation (setting revokedAt back to null)', async () => {
      const alexCtx = testEnv.authenticatedContext(USER_ALEX)
      const devRef = alexCtx.firestore().doc(`users/${USER_ALEX}/devices/${DEVICE_ID}`)

      await assertFails(
        devRef.update({
          revokedAt: null,
        })
      )
    })

    it('TC-25: Rejects recreating device using an existing already-claimed session after unpair', async () => {
      // Seed claimed session in the past
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
        // And delete the device (unpaired)
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
  })

  // ============================================================
  // VECTOR 7: Default-Deny Catch-All
  // ============================================================
  describe('Vector 7: Default-Deny Catch-All', () => {
    it('TC-26: Rejects write to unauthorized top-level collection', async () => {
      const alexCtx = testEnv.authenticatedContext(USER_ALEX)
      const docRef = alexCtx.firestore().doc('adminSettings/globalConfig')

      await assertFails(
        docRef.set({
          maintenance: true,
        })
      )
    })
  })
})
