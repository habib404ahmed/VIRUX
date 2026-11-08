package com.virux.app.data.repository

import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseAuthException
import com.google.firebase.auth.FirebaseUser
import com.google.firebase.auth.GoogleAuthProvider
import com.google.firebase.auth.UserProfileChangeRequest
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.virux.app.data.model.ViruxUser
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext

class AuthRepositoryImpl(
    private val auth: FirebaseAuth = FirebaseAuth.getInstance(),
    private val firestore: FirebaseFirestore = FirebaseFirestore.getInstance()
) : AuthRepository {

    private val _authStateFlow = MutableStateFlow<FirebaseUser?>(auth.currentUser)
    override val authStateFlow: StateFlow<FirebaseUser?> = _authStateFlow.asStateFlow()

    override val currentUser: FirebaseUser?
        get() = auth.currentUser

    init {
        auth.addAuthStateListener { firebaseAuth ->
            _authStateFlow.value = firebaseAuth.currentUser
        }
    }

    override fun isUserAuthenticated(): Boolean {
        return auth.currentUser != null
    }

    override suspend fun signInWithEmail(email: String, pass: String): Result<FirebaseUser> =
        withContext(Dispatchers.IO) {
            try {
                val authResult = auth.signInWithEmailAndPassword(email.trim(), pass).await()
                val user = authResult.user
                    ?: return@withContext Result.failure(Exception("Authentication failed: No user object returned."))

                // Ensure Firestore profile synchronization
                syncUserProfile(user)
                Result.success(user)
            } catch (e: Exception) {
                Result.failure(Exception(mapAuthException(e)))
            }
        }

    override suspend fun signInWithGoogle(idToken: String): Result<FirebaseUser> =
        withContext(Dispatchers.IO) {
            try {
                val credential = GoogleAuthProvider.getCredential(idToken, null)
                val authResult = auth.signInWithCredential(credential).await()
                val user = authResult.user
                    ?: return@withContext Result.failure(Exception("Google authentication failed: No user object returned."))

                syncUserProfile(user, displayName = user.displayName, provider = "google")
                Result.success(user)
            } catch (e: Exception) {
                Result.failure(Exception(mapAuthException(e)))
            }
        }

    override suspend fun signUpWithEmail(
        email: String,
        pass: String,
        displayName: String
    ): Result<FirebaseUser> = withContext(Dispatchers.IO) {
        try {
            val authResult = auth.createUserWithEmailAndPassword(email.trim(), pass).await()
            val user = authResult.user
                ?: return@withContext Result.failure(Exception("Registration failed: User not created."))

            if (displayName.isNotBlank()) {
                val profileUpdates = UserProfileChangeRequest.Builder()
                    .setDisplayName(displayName.trim())
                    .build()
                user.updateProfile(profileUpdates).await()
            }

            syncUserProfile(user, displayName = displayName.trim(), provider = "password")
            Result.success(user)
        } catch (e: Exception) {
            Result.failure(Exception(mapAuthException(e)))
        }
    }

    override suspend fun sendPasswordReset(email: String): Result<Unit> =
        withContext(Dispatchers.IO) {
            try {
                auth.sendPasswordResetEmail(email.trim()).await()
                Result.success(Unit)
            } catch (e: Exception) {
                Result.failure(Exception(mapAuthException(e)))
            }
        }

    override suspend fun signOut(): Result<Unit> = withContext(Dispatchers.IO) {
        try {
            auth.signOut()
            _authStateFlow.value = null
            Result.success(Unit)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    override suspend fun fetchUserProfile(uid: String): Result<ViruxUser?> =
        withContext(Dispatchers.IO) {
            try {
                val doc = firestore.collection("users").document(uid).get().await()
                if (doc.exists()) {
                    Result.success(doc.toObject(ViruxUser::class.java))
                } else {
                    Result.success(null)
                }
            } catch (e: Exception) {
                Result.failure(e)
            }
        }

    override suspend fun syncUserProfile(
        user: FirebaseUser,
        displayName: String?,
        provider: String
    ): Result<ViruxUser> = withContext(Dispatchers.IO) {
        try {
            val docRef = firestore.collection("users").document(user.uid)
            val docSnap = docRef.get().await()

            if (!docSnap.exists()) {
                val effectiveDisplayName = displayName
                    ?: user.displayName
                    ?: user.email?.substringBefore('@')
                    ?: "VIRUX User"

                val profileMap = hashMapOf<String, Any?>(
                    "uid" to user.uid,
                    "displayName" to effectiveDisplayName,
                    "email" to (user.email ?: ""),
                    "photoUrl" to user.photoUrl?.toString(),
                    "provider" to provider,
                    "createdAt" to FieldValue.serverTimestamp(),
                    "updatedAt" to FieldValue.serverTimestamp(),
                    "accountStatus" to "active"
                )
                docRef.set(profileMap).await()
            } else {
                docRef.update("updatedAt", FieldValue.serverTimestamp()).await()
            }

            val updatedDoc = docRef.get().await()
            val viruxUser = updatedDoc.toObject(ViruxUser::class.java)
                ?: ViruxUser(uid = user.uid, email = user.email ?: "")
            Result.success(viruxUser)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    private fun mapAuthException(e: Exception): String {
        val message = e.message ?: ""
        return when {
            message.contains("ERROR_INVALID_EMAIL") || message.contains("invalid-email") ->
                "The email address is improperly formatted."
            message.contains("ERROR_WRONG_PASSWORD") || message.contains("wrong-password") || message.contains("invalid-credential") ->
                "Invalid credentials. Please verify your email and password."
            message.contains("ERROR_USER_NOT_FOUND") || message.contains("user-not-found") ->
                "No registered user found for this email."
            message.contains("ERROR_USER_DISABLED") || message.contains("user-disabled") ->
                "This account has been suspended."
            message.contains("ERROR_TOO_MANY_REQUESTS") || message.contains("too-many-requests") ->
                "Too many failed attempts. Access is temporarily suspended."
            message.contains("ERROR_EMAIL_ALREADY_IN_USE") || message.contains("email-already-in-use") ->
                "This email is already registered. Please sign in instead."
            message.contains("WEAK_PASSWORD") || message.contains("weak-password") ->
                "Password must be at least 6 characters long."
            message.contains("network-request-failed") || message.contains("A network error") ->
                "Network connection failed. Please check your connectivity."
            else -> e.localizedMessage ?: "Authentication operation failed."
        }
    }
}

