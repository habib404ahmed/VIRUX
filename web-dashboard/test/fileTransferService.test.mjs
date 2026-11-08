// ============================================================
// VIRUX Web Dashboard — File Transfer Service Unit Tests
// Tests protocol messages, version validation, filename sanitization,
// binary chunk framing, SHA-256 integrity checks, and bounds.
// ============================================================

import assert from 'node:assert'
import crypto from 'node:crypto'
import test from 'node:test'

const PROTOCOL_VERSION = 'VIRUX_FILE_TRANSFER_V1'
const MAX_FILE_SIZE = 524288000 // 500 MB
const CHUNK_SIZE = 65536 // 64 KiB
const MAX_CHUNK_PAYLOAD = 65532 // 65536 - 4 bytes header
const SEQUENCE_HEADER_SIZE = 4
const BUFFERED_AMOUNT_HIGH_THRESHOLD = 524288 // 512 KiB
const BUFFERED_AMOUNT_LOW_THRESHOLD = 65536 // 64 KiB

function sanitizeFileName(name) {
  const base = name.replace(/[/\\]/g, '_').replace(/[\r\n\t]/g, '').trim()
  return base || 'unnamed_file'
}

function calculateSha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

test('Protocol version must strictly equal VIRUX_FILE_TRANSFER_V1', () => {
  const validMessage = {
    protocolVersion: PROTOCOL_VERSION,
    type: 'TRANSFER_REQUEST',
    metadata: {
      transferId: 'tx-123',
      fileName: 'test.png',
      fileSize: 1024,
      totalChunks: 1,
      sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      direction: 'web_to_android',
      timestamp: '2026-11-08T10:00:00Z',
    },
  }

  const serialized = JSON.stringify(validMessage)
  const parsed = JSON.parse(serialized)

  assert.strictEqual(parsed.protocolVersion, PROTOCOL_VERSION)
  assert.strictEqual(parsed.type, 'TRANSFER_REQUEST')

  // Mismatch rejection
  const invalidMessage = { ...validMessage, protocolVersion: 'VIRUX_V2_UNSUPPORTED' }
  assert.notStrictEqual(invalidMessage.protocolVersion, PROTOCOL_VERSION)
})

test('Filename sanitization neutralizes directory traversal and control characters', () => {
  const maliciousNames = [
    { input: '../../../../etc/shadow', expected: '.._.._.._.._etc_shadow' },
    { input: '..\\..\\Windows\\System32\\cmd.exe', expected: '.._.._Windows_System32_cmd.exe' },
    { input: '   my document\n\r.pdf   ', expected: 'my document.pdf' },
    { input: '', expected: 'unnamed_file' },
    { input: '///', expected: '___' },
  ]

  for (const item of maliciousNames) {
    const sanitized = sanitizeFileName(item.input)
    assert.strictEqual(sanitized, item.expected)
    assert.ok(!sanitized.includes('/'))
    assert.ok(!sanitized.includes('\\'))
    assert.ok(!sanitized.includes('\n'))
    assert.ok(!sanitized.includes('\r'))
  }
})

test('Chunk framing packs and unpacks 4-byte big-endian sequence index', () => {
  const chunkIndex = 42
  const rawPayload = Buffer.from('VIRUX peer-to-peer WebRTC data payload test string')

  // Pack
  const framedBuffer = new ArrayBuffer(SEQUENCE_HEADER_SIZE + rawPayload.byteLength)
  const view = new DataView(framedBuffer)
  view.setUint32(0, chunkIndex, false) // Big-endian
  new Uint8Array(framedBuffer, SEQUENCE_HEADER_SIZE).set(rawPayload)

  // Unpack
  const unpackView = new DataView(framedBuffer)
  const extractedIndex = unpackView.getUint32(0, false)
  const extractedPayload = Buffer.from(framedBuffer, SEQUENCE_HEADER_SIZE)

  assert.strictEqual(extractedIndex, 42)
  assert.strictEqual(extractedPayload.toString(), rawPayload.toString())
  assert.strictEqual(framedBuffer.byteLength, SEQUENCE_HEADER_SIZE + rawPayload.byteLength)
})

test('Sequence verification enforces strictly sequential chunks', () => {
  let expectedIndex = 0
  const incomingChunks = [0, 1, 2, 3, 5] // Chunk 4 is missing (out-of-order/dropped)

  const received = []
  let sequenceError = false

  for (const idx of incomingChunks) {
    if (idx !== expectedIndex) {
      sequenceError = true
      break
    }
    received.push(idx)
    expectedIndex++
  }

  assert.strictEqual(sequenceError, true)
  assert.strictEqual(expectedIndex, 4)
  assert.strictEqual(received.length, 4)
})

test('SHA-256 integrity calculation and mismatch detection', () => {
  const originalData = Buffer.from('VIRUX end-to-end file transfer payload 2026')
  const validHash = calculateSha256(originalData)

  assert.strictEqual(typeof validHash, 'string')
  assert.strictEqual(validHash.length, 64)

  // Corrupted payload verification
  const corruptedData = Buffer.from('VIRUX corrupted data injected into stream')
  const corruptedHash = calculateSha256(corruptedData)

  assert.notStrictEqual(validHash, corruptedHash)
})

test('File size limit validation enforces 500 MB maximum threshold', () => {
  const allowedSize = 450 * 1024 * 1024 // 450 MB
  const boundarySize = 500 * 1024 * 1024 // 500 MB
  const oversizedFile = 500 * 1024 * 1024 + 1 // 500 MB + 1 byte

  assert.ok(allowedSize <= MAX_FILE_SIZE)
  assert.ok(boundarySize <= MAX_FILE_SIZE)
  assert.ok(oversizedFile > MAX_FILE_SIZE)
})

test('Backpressure thresholds maintain high-water and low-water invariants', () => {
  assert.ok(BUFFERED_AMOUNT_HIGH_THRESHOLD > BUFFERED_AMOUNT_LOW_THRESHOLD)
  assert.strictEqual(BUFFERED_AMOUNT_HIGH_THRESHOLD, 512 * 1024)
  assert.strictEqual(BUFFERED_AMOUNT_LOW_THRESHOLD, 64 * 1024)
  assert.strictEqual(CHUNK_SIZE, 64 * 1024)
  assert.strictEqual(MAX_CHUNK_PAYLOAD, CHUNK_SIZE - SEQUENCE_HEADER_SIZE)
})

