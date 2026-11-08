package com.virux.app

import android.app.Application
import androidx.lifecycle.ViewModelProvider
import com.google.firebase.auth.FirebaseUser
import com.virux.app.data.model.ViruxUser
import com.virux.app.data.repository.AuthRepository
import com.virux.app.ui.screens.auth.AuthUiState
import com.virux.app.ui.screens.auth.AuthViewModel
import com.virux.app.ui.screens.home.HomeViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import org.junit.Assert.*
import org.junit.Test
import java.lang.reflect.Proxy

class AuthViewModelTest {

    private class FakeAuthRepository(
        var googleSignInResult: Result<FirebaseUser> = Result.failure(Exception("Not set"))
    ) : AuthRepository {
        override val currentUser: FirebaseUser? = null
        override val authStateFlow: StateFlow<FirebaseUser?> = MutableStateFlow(null)
        override fun isUserAuthenticated(): Boolean = false
        override suspend fun signInWithEmail(email: String, pass: String): Result<FirebaseUser> =
            Result.failure(Exception("Not implemented"))
        override suspend fun signInWithGoogle(idToken: String): Result<FirebaseUser> =
            googleSignInResult
        override suspend fun signUpWithEmail(email: String, pass: String, displayName: String): Result<FirebaseUser> =
            Result.failure(Exception("Not implemented"))
        override suspend fun sendPasswordReset(email: String): Result<Unit> = Result.success(Unit)
        override suspend fun signOut(): Result<Unit> = Result.success(Unit)
        override suspend fun fetchUserProfile(uid: String): Result<ViruxUser?> = Result.success(null)
        override suspend fun syncUserProfile(user: FirebaseUser, displayName: String?, provider: String): Result<ViruxUser> =
            Result.failure(Exception("Not implemented"))
    }

    @Test
    fun testHomeViewModelConstructorsExist() {
        // Verify that HomeViewModel has both 1-arg constructor for AndroidViewModelFactory reflection
        // and 2-arg constructor for DI/testing
        val constructors = HomeViewModel::class.java.constructors
        val hasAppConstructor = constructors.any { c ->
            c.parameterTypes.size == 1 && c.parameterTypes[0] == Application::class.java
        }
        assertTrue("HomeViewModel must have a 1-arg constructor taking Application", hasAppConstructor)
    }

    @Test
    fun testHomeViewModelFactoryContract() {
        // Create mock or dummy Application
        val app = Proxy.newProxyInstance(
            Application::class.java.classLoader,
            arrayOf()
        ) { _, _, _ -> null }

        // Test factory creation helper
        val dummyApp = Application()
        val factory = HomeViewModel.provideFactory(dummyApp)
        assertNotNull("Factory should be created", factory)
    }

    @Test
    fun testAuthViewModelSetAuthErrorAndResetState() {
        val fakeRepo = FakeAuthRepository()
        val viewModel = AuthViewModel(fakeRepo)

        assertEquals(AuthUiState.Idle, viewModel.uiState.value)

        viewModel.setAuthError("Sample test error")
        assertTrue(viewModel.uiState.value is AuthUiState.Error)
        assertEquals("Sample test error", (viewModel.uiState.value as AuthUiState.Error).message)

        viewModel.resetState()
        assertEquals(AuthUiState.Idle, viewModel.uiState.value)
    }
}

