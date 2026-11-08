package com.virux.app.data.provider

import android.content.Context
import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyInfo
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.*
import java.security.spec.ECGenParameterSpec
import java.security.spec.PKCS8EncodedKeySpec
import java.security.spec.X509EncodedKeySpec

enum class KeySecurityLevel(val label: String, val isHardwareBacked: Boolean) {
    STRONGBOX("Hardware StrongBox", true),
    TEE("Hardware TEE (Trusted Execution Environment)", true),
    HARDWARE_LEGACY("Hardware Secure Silicon (API < 31)", true),
    SOFTWARE_KEYSTORE("Android Keystore (Software Emulated)", false),
    SOFTWARE_FALLBACK("Software Fallback (Private Storage)", false),
    UNKNOWN("Unknown Security Level", false)
}

data class KeyStoreIdentity(
    val publicKeyBase64: String,
    val securityLevel: KeySecurityLevel
)

interface KeyStoreProvider {
    fun getOrCreateIdentity(): KeyStoreIdentity
    fun getPublicKeyBase64(): String
    fun getSecurityLevel(): KeySecurityLevel
    fun signChallenge(
        challengeNonce: String,
        sessionId: String,
        ownerUid: String,
        deviceId: String
    ): String
}

class KeyStoreProviderImpl(
    private val context: Context
) : KeyStoreProvider {

    companion object {
        private const val ANDROID_KEYSTORE = "AndroidKeyStore"
        private const val KEY_ALIAS = "virux_device_ec_identity"
        private const val EC_CURVE = "secp256r1"
        private const val SIGNATURE_ALGORITHM = "SHA256withECDSA"

        private const val FALLBACK_PREFS = "virux_keystore_fallback_prefs"
        private const val KEY_FALLBACK_PRIV = "fallback_ec_priv_b64"
        private const val KEY_FALLBACK_PUB = "fallback_ec_pub_b64"
    }

    private val keyStore: KeyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply {
        load(null)
    }

    private var cachedIdentity: KeyStoreIdentity? = null

    @Synchronized
    override fun getOrCreateIdentity(): KeyStoreIdentity {
        cachedIdentity?.let { return it }

        val identity = try {
            getOrCreateKeystoreIdentity()
        } catch (e: Exception) {
            android.util.Log.w("VIRUX_KeyStore", "Hardware Keystore unavailable; using software fallback: ${e.message}")
            getOrCreateSoftwareFallbackIdentity()
        }

        cachedIdentity = identity
        return identity
    }

    override fun getPublicKeyBase64(): String = getOrCreateIdentity().publicKeyBase64

    override fun getSecurityLevel(): KeySecurityLevel = getOrCreateIdentity().securityLevel

    @Synchronized
    override fun signChallenge(
        challengeNonce: String,
        sessionId: String,
        ownerUid: String,
        deviceId: String
    ): String {
        // Construct canonical message buffer exactly matching Web Dashboard:
        // messageString = "${challengeNonce}${sessionId}${ownerUid}${deviceId}"
        val message = "$challengeNonce$sessionId$ownerUid$deviceId".toByteArray(Charsets.UTF_8)

        val privateKey = getPrivateKey()
        val signature = Signature.getInstance(SIGNATURE_ALGORITHM).apply {
            initSign(privateKey)
            update(message)
        }
        val sigBytes = signature.sign()
        return Base64.encodeToString(sigBytes, Base64.NO_WRAP)
    }

    private fun getPrivateKey(): PrivateKey {
        return if (keyStore.containsAlias(KEY_ALIAS)) {
            val entry = keyStore.getEntry(KEY_ALIAS, null) as? KeyStore.PrivateKeyEntry
                ?: throw IllegalStateException("KeyStore entry for $KEY_ALIAS is not a PrivateKeyEntry")
            entry.privateKey
        } else {
            getSoftwareFallbackPrivateKey()
        }
    }

    private fun getOrCreateKeystoreIdentity(): KeyStoreIdentity {
        if (!keyStore.containsAlias(KEY_ALIAS)) {
            generateKeystoreKeyPair()
        }

        val certificate = keyStore.getCertificate(KEY_ALIAS)
            ?: throw IllegalStateException("Certificate for $KEY_ALIAS missing")
        val publicKey = certificate.publicKey
        val pubKeyBase64 = Base64.encodeToString(publicKey.encoded, Base64.NO_WRAP)

        val privateKey = (keyStore.getEntry(KEY_ALIAS, null) as KeyStore.PrivateKeyEntry).privateKey
        val securityLevel = inspectKeySecurityLevel(privateKey)

        return KeyStoreIdentity(pubKeyBase64, securityLevel)
    }

    private fun generateKeystoreKeyPair() {
        val kpg = KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, ANDROID_KEYSTORE)
        val specBuilder = KeyGenParameterSpec.Builder(
            KEY_ALIAS,
            KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY
        )
            .setAlgorithmParameterSpec(ECGenParameterSpec(EC_CURVE))
            .setDigests(KeyProperties.DIGEST_SHA256)

        kpg.initialize(specBuilder.build())
        kpg.generateKeyPair()
    }

    private fun inspectKeySecurityLevel(privateKey: PrivateKey): KeySecurityLevel {
        return try {
            val factory = KeyFactory.getInstance(privateKey.algorithm, ANDROID_KEYSTORE)
            val keyInfo = factory.getKeySpec(privateKey, KeyInfo::class.java)

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                when (keyInfo.securityLevel) {
                    KeyProperties.SECURITY_LEVEL_STRONGBOX -> KeySecurityLevel.STRONGBOX
                    KeyProperties.SECURITY_LEVEL_TRUSTED_ENVIRONMENT -> KeySecurityLevel.TEE
                    KeyProperties.SECURITY_LEVEL_SOFTWARE -> KeySecurityLevel.SOFTWARE_KEYSTORE
                    else -> KeySecurityLevel.UNKNOWN
                }
            } else {
                @Suppress("DEPRECATION")
                if (keyInfo.isInsideSecureHardware) {
                    KeySecurityLevel.HARDWARE_LEGACY
                } else {
                    KeySecurityLevel.SOFTWARE_KEYSTORE
                }
            }
        } catch (e: Exception) {
            KeySecurityLevel.UNKNOWN
        }
    }

    // ─── Non-Hardware Software Fallback ──────────────────────────
    // Used exclusively if the Android Keystore throws on non-standard ROMs or broken emulators.
    private fun getOrCreateSoftwareFallbackIdentity(): KeyStoreIdentity {
        val prefs = context.getSharedPreferences(FALLBACK_PREFS, Context.MODE_PRIVATE)
        val pubB64 = prefs.getString(KEY_FALLBACK_PUB, null)
        val privB64 = prefs.getString(KEY_FALLBACK_PRIV, null)

        if (pubB64 != null && privB64 != null) {
            return KeyStoreIdentity(pubB64, KeySecurityLevel.SOFTWARE_FALLBACK)
        }

        val kpg = KeyPairGenerator.getInstance("EC")
        kpg.initialize(ECGenParameterSpec(EC_CURVE))
        val keyPair = kpg.generateKeyPair()

        val newPubB64 = Base64.encodeToString(keyPair.public.encoded, Base64.NO_WRAP)
        val newPrivB64 = Base64.encodeToString(keyPair.private.encoded, Base64.NO_WRAP)

        prefs.edit()
            .putString(KEY_FALLBACK_PUB, newPubB64)
            .putString(KEY_FALLBACK_PRIV, newPrivB64)
            .apply()

        return KeyStoreIdentity(newPubB64, KeySecurityLevel.SOFTWARE_FALLBACK)
    }

    private fun getSoftwareFallbackPrivateKey(): PrivateKey {
        val prefs = context.getSharedPreferences(FALLBACK_PREFS, Context.MODE_PRIVATE)
        val privB64 = prefs.getString(KEY_FALLBACK_PRIV, null)
            ?: throw IllegalStateException("Software fallback private key missing")
        val bytes = Base64.decode(privB64, Base64.NO_WRAP)
        val spec = PKCS8EncodedKeySpec(bytes)
        return KeyFactory.getInstance("EC").generatePrivate(spec)
    }
}

