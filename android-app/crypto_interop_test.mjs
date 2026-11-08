// ============================================================
// VIRUX — Cryptographic Interoperability Verification
// Tests that Android's JCA ASN.1 DER ECDSA signature verifies
// cleanly under Web Crypto's IEEE P1363 engine
// ============================================================

import crypto from 'crypto'

// Exact derToP1363 implementation from web-dashboard deviceService.ts
function derToP1363(der) {
  if (der.length === 64) return der

  let offset = 0
  if (der[offset++] !== 0x30) throw new Error('Invalid DER signature: missing SEQUENCE')

  let seqLen = der[offset++]
  if (seqLen & 0x80) {
    const lenBytes = seqLen & 0x7f
    offset += lenBytes
  }

  if (der[offset++] !== 0x02) throw new Error('Invalid DER signature: missing r INTEGER')
  const rLen = der[offset++]
  const rStart = offset
  offset += rLen

  if (der[offset++] !== 0x02) throw new Error('Invalid DER signature: missing s INTEGER')
  const sLen = der[offset++]
  const sStart = offset

  let r = der.subarray(rStart, rStart + rLen)
  while (r.length > 32 && r[0] === 0x00) r = r.subarray(1)

  let s = der.subarray(sStart, sStart + sLen)
  while (s.length > 32 && s[0] === 0x00) s = s.subarray(1)

  const p1363 = new Uint8Array(64)
  p1363.set(r, 32 - r.length)
  p1363.set(s, 64 - s.length)
  return p1363
}

async function runInteropTest() {
  console.log('[Interop Test] Generating EC P-256 KeyPair (simulating Android Keystore)...')
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1', // NIST P-256 / secp256r1
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'der' },
  })

  const challengeNonce = 'a8f3b4c1d2e9f0a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9'
  const sessionId = '7b8d3a1f-4c2e-4b92-91a5-8e3b7c2a1e0f'
  const ownerUid = 'VX_9a8b7c6d5e4f3a2b1c'
  const deviceId = '4d3c2b1a-9f8e-4d3c-2b1a-9f8e4d3c2b1a'

  // Construct message buffer: challengeNonce || sessionId || ownerUid || deviceId
  const messageString = `${challengeNonce}${sessionId}${ownerUid}${deviceId}`
  const messageBuffer = Buffer.from(messageString, 'utf8')

  console.log('[Interop Test] Signing payload with SHA256withECDSA (JCA ASN.1 DER)...')
  const signer = crypto.createSign('SHA256')
  signer.update(messageBuffer)
  signer.end()
  const derSignature = signer.sign({
    key: crypto.createPrivateKey({ key: privateKey, format: 'der', type: 'pkcs8' }),
    dsaEncoding: 'der',
  })

  console.log(`[Interop Test] DER Signature length: ${derSignature.length} bytes (starts with 0x${derSignature[0].toString(16)})`)

  // Convert DER to IEEE P1363 using our Web Dashboard function
  const p1363Signature = derToP1363(new Uint8Array(derSignature))
  console.log(`[Interop Test] Converted to IEEE P1363: ${p1363Signature.length} bytes`)

  // Verify using Web Crypto API (crypto.subtle in Node 18+)
  console.log('[Interop Test] Importing public key into Web Crypto API...')
  const webCryptoKey = await crypto.subtle.importKey(
    'spki',
    publicKey,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify']
  )

  console.log('[Interop Test] Verifying signature with Web Crypto API subtle.verify()...')
  const isValid = await crypto.subtle.verify(
    { name: 'ECDSA', hash: { name: 'SHA-256' } },
    webCryptoKey,
    p1363Signature,
    new TextEncoder().encode(messageString)
  )

  if (isValid) {
    console.log('✅ [INTEROP SUCCESS] Android JCA DER signature verified flawlessly under Web Crypto API!')
  } else {
    throw new Error('❌ [INTEROP FAILURE] Web Crypto verify returned false!')
  }

  // Verify that message tampering fails
  const tamperedString = `${challengeNonce}${sessionId}${ownerUid}${deviceId}_tampered`
  const isTamperedValid = await crypto.subtle.verify(
    { name: 'ECDSA', hash: { name: 'SHA-256' } },
    webCryptoKey,
    p1363Signature,
    new TextEncoder().encode(tamperedString)
  )

  if (!isTamperedValid) {
    console.log('✅ [INTEROP SUCCESS] Tampered message correctly rejected by Web Crypto API!')
  } else {
    throw new Error('❌ [INTEROP FAILURE] Tampered message was incorrectly accepted!')
  }
}

runInteropTest().catch((err) => {
  console.error(err)
  process.exit(1)
})

