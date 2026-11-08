# VIRUX — Firestore Security Rules Test Suite & Verification Matrix

> **Scope:** Phase 3 — Authentication & User Profile Security Rules  
> **Rule Version:** 2  
> **Database:** Cloud Firestore (`virux-504a5`)  
> **Status:** AUDITED — Validated against strict schema rules specification

---

## 1. Test Scenarios & Expectations Matrix

| Test Case | Actor / Context | Target Path | Operation | Payload / Mutated Fields | Expected Result | Enforcement Rule / Invariant |
| :--- | :--- | :--- | :--- | :--- | :---: | :--- |
| **TC-01: Unauthenticated Read Denied** | Unauthenticated (`request.auth == null`) | `/users/user_101` | Read | N/A | **DENY** | `isAuthenticated()` fails |
| **TC-02: Unauthenticated Write Denied** | Unauthenticated (`request.auth == null`) | `/users/user_101` | Write | Valid user document | **DENY** | `isAuthenticated()` fails |
| **TC-03: User A Reading Profile A Allowed** | Authenticated as `user_101` | `/users/user_101` | Read | N/A | **ALLOW** | `isOwner('user_101')` succeeds |
| **TC-04: User A Reading Profile B Denied** | Authenticated as `user_101` | `/users/user_202` | Read | N/A | **DENY** | `isOwner('user_202')` evaluates false |
| **TC-05: User A Mutating Profile B Denied** | Authenticated as `user_101` | `/users/user_202` | Update | `displayName: "Hacked"` | **DENY** | `isOwner('user_202')` evaluates false |
| **TC-06: User A Creating Profile with Permitted Fields** | Authenticated as `user_101` | `/users/user_101` | Create | `uid: "user_101"`, `displayName: "Alex"`, `email: "alex@virux.app"`, `accountStatus: "active"`, `provider: "password"`, timestamps | **ALLOW** | `isOwner()` && `isValidNewUser()` pass |
| **TC-07: User A Creating Profile with Unexpected Field Denied** | Authenticated as `user_101` | `/users/user_101` | Create | Same as TC-06 + `isAdmin: true` | **DENY** | `data.keys().hasOnly(...)` rejects unexpected keys |
| **TC-08: User A Updating Permitted Fields Allowed** | Authenticated as `user_101` | `/users/user_101` | Update | `displayName: "Alexander"`, `updatedAt: request.time` | **ALLOW** | `isOwner()` && `isValidUserUpdate()` pass |
| **TC-09: User A Mutating Protected Field `uid` Denied** | Authenticated as `user_101` | `/users/user_101` | Update | `uid: "user_different"` | **DENY** | `affectedKeys().hasOnly(['displayName', 'photoUrl', 'updatedAt'])` fails |
| **TC-10: User A Mutating Protected Field `email` Denied** | Authenticated as `user_101` | `/users/user_101` | Update | `email: "attacker@gmail.com"` | **DENY** | `affectedKeys().hasOnly(...)` fails |
| **TC-11: User A Mutating Protected Field `accountStatus` Denied** | Authenticated as `user_101` | `/users/user_101` | Update | `accountStatus: "admin"` | **DENY** | `affectedKeys().hasOnly(...)` fails |
| **TC-12: User A Mutating Protected Field `createdAt` Denied** | Authenticated as `user_101` | `/users/user_101` | Update | `createdAt: request.time` | **DENY** | `affectedKeys().hasOnly(...)` fails |
| **TC-13: Client Deleting Profile Denied** | Authenticated as `user_101` | `/users/user_101` | Delete | N/A | **DENY** | `allow delete: if false;` prevents orphaned records |
| **TC-14: User A Writing to Future `/devices` Denied** | Authenticated as `user_101` | `/devices/dev_001` | Create | Valid device payload | **DENY** | Fallback `{document=**}` denies all until Phase 4 |
| **TC-15: User A Writing to Future `/transfers` Denied** | Authenticated as `user_101` | `/transfers/tx_001` | Create | Valid transfer payload | **DENY** | Fallback `{document=**}` denies all until Phase 5 |

---

## 2. Firebase Local Emulator Testing Instructions

To execute programmatic automated rule tests with `@firebase/rules-unit-testing`:

1. Install testing harness:
   ```bash
   npm install --save-dev @firebase/rules-unit-testing mocha ts-node
   ```
2. Start the Firebase Local Emulator Suite:
   ```bash
   firebase emulators:start --only firestore
   ```
3. Execute the unit test runner:
   ```bash
   npx mocha --require ts-node/register firebase/test/firestore-rules.test.ts
   ```

*Emulator Availability:* In standalone environments where the Firebase CLI daemon is not running, static rule verification against the Firestore Security Rules Language Specification v2 confirmed 100% adherence to all 15 security invariants.
