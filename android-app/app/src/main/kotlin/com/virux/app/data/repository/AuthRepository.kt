package com.virux.app.data.repository

import com.google.firebase.auth.FirebaseUser
import com.virux.app.data.model.ViruxUser
import kotlinx.coroutines.flow.StateFlow

interface AuthRepository {
    val currentUser: FirebaseUser?
    val authStateFlow: StateFlow<FirebaseUser?>

    fun isUserAuthenticated(): Boolean

    suspend fun signInWithEmail(email: String, pass: String): Result<FirebaseUser>

    suspend fun signInWithGoogle(idToken: String): Result<FirebaseUser>

    suspend fun signUpWithEmail(
        email: String,
        pass: String,
        displayName: String
    ): Result<FirebaseUser>

    suspend fun sendPasswordReset(email: String): Result<Unit>

    suspend fun signOut(): Result<Unit>

    suspend fun fetchUserProfile(uid: String): Result<ViruxUser?>

    suspend fun syncUserProfile(
        user: FirebaseUser,
        displayName: String? = null,
        provider: String = "password"
    ): Result<ViruxUser>
}

