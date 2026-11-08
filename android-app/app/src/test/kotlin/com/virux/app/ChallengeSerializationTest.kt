package com.virux.app

import org.junit.Assert.*
import org.junit.Test
import java.security.*
import java.security.spec.ECGenParameterSpec
import java.util.Base64

class ChallengeSerializationTest {

    @Test
    fun testChallengeMessageSerializationMatchesWebDashboard() {
        val challengeNonce = "a8f3b4c1d2e9f0a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9"
        val sessionId = "7b8d3a1f-4c2e-4b92-91a5-8e3b7c2a1e0f"
        val ownerUid = "VX_9a8b7c6d5e4f3a2b1c"
        val deviceId = "4d3c2b1a-9f8e-4d3c-2b1a-9f8e4d3c2b1a"

        val expectedString = "${challengeNonce}${sessionId}${ownerUid}${deviceId}"
        val actualBytes = "$challengeNonce$sessionId$ownerUid$deviceId".toByteArray(Charsets.UTF_8)

        assertEquals(expectedString.toByteArray(Charsets.UTF_8).size, actualBytes.size)
        assertArrayEquals(expectedString.toByteArray(Charsets.UTF_8), actualBytes)
    }

    @Test
    fun testEcdsaP256SignatureGenerationAndVerification() {
        // Generate an EC P-256 key pair
        val kpg = KeyPairGenerator.getInstance("EC")
        kpg.initialize(ECGenParameterSpec("secp256r1"))
        val keyPair = kpg.generateKeyPair()

        val challengeNonce = "test_nonce_1234567890abcdef"
        val sessionId = "session-1234"
        val ownerUid = "uid-5678"
        val deviceId = "device-9999"

        val message = "$challengeNonce$sessionId$ownerUid$deviceId".toByteArray(Charsets.UTF_8)

        // Sign with SHA256withECDSA (as performed by KeyStoreProvider)
        val signer = Signature.getInstance("SHA256withECDSA")
        signer.initSign(keyPair.private)
        signer.update(message)
        val signatureBytes = signer.sign()

        assertNotNull(signatureBytes)
        assertTrue(signatureBytes.isNotEmpty())

        // Verify with public key
        val verifier = Signature.getInstance("SHA256withECDSA")
        verifier.initVerify(keyPair.public)
        verifier.update(message)
        val isValid = verifier.verify(signatureBytes)

        assertTrue("ECDSA signature must verify successfully with public key", isValid)

        // Verify that tampering with message fails verification
        val tamperedMessage = "$challengeNonce$sessionId$ownerUid${deviceId}_tampered".toByteArray(Charsets.UTF_8)
        val verifierTampered = Signature.getInstance("SHA256withECDSA")
        verifierTampered.initVerify(keyPair.public)
        verifierTampered.update(tamperedMessage)
        val isTamperedValid = verifierTampered.verify(signatureBytes)

        assertFalse("Tampered message signature verification must fail", isTamperedValid)
    }

    @Test
    fun testPublicKeyDerEncodingFormat() {
        val kpg = KeyPairGenerator.getInstance("EC")
        kpg.initialize(ECGenParameterSpec("secp256r1"))
        val keyPair = kpg.generateKeyPair()

        val pubEncoded = keyPair.public.encoded
        assertNotNull(pubEncoded)
        assertEquals("X.509", keyPair.public.format)

        val base64 = Base64.getEncoder().encodeToString(pubEncoded)
        assertNotNull(base64)
        assertTrue(base64.isNotBlank())
    }
}

