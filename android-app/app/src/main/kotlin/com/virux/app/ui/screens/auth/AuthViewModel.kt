package com.virux.app.ui.screens.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.google.firebase.auth.FirebaseUser
import com.virux.app.data.repository.AuthRepository
import com.virux.app.data.repository.AuthRepositoryImpl
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

sealed interface AuthUiState {
    object Idle : AuthUiState
    object Loading : AuthUiState
    data class Success(val user: FirebaseUser) : AuthUiState
    data class ResetEmailSent(val email: String) : AuthUiState
    data class Error(val message: String) : AuthUiState
}

class AuthViewModel(
    private val repository: AuthRepository = AuthRepositoryImpl()
) : ViewModel() {

    private val _uiState = MutableStateFlow<AuthUiState>(AuthUiState.Idle)
    val uiState: StateFlow<AuthUiState> = _uiState.asStateFlow()

    val currentUser: FirebaseUser?
        get() = repository.currentUser

    fun isUserAuthenticated(): Boolean = repository.isUserAuthenticated()

    fun login(email: String, pass: String) {
        if (email.isBlank() || pass.isBlank()) {
            _uiState.value = AuthUiState.Error("Please enter your email and password.")
            return
        }

        _uiState.value = AuthUiState.Loading
        viewModelScope.launch {
            repository.signInWithEmail(email, pass)
                .onSuccess { user ->
                    _uiState.value = AuthUiState.Success(user)
                }
                .onFailure { error ->
                    _uiState.value = AuthUiState.Error(error.message ?: "Login failed.")
                }
        }
    }

    fun signInWithGoogle(idToken: String) {
        _uiState.value = AuthUiState.Loading
        viewModelScope.launch {
            repository.signInWithGoogle(idToken)
                .onSuccess { user ->
                    _uiState.value = AuthUiState.Success(user)
                }
                .onFailure { error ->
                    _uiState.value = AuthUiState.Error(error.message ?: "Google Sign-In failed.")
                }
        }
    }

    fun setAuthError(message: String) {
        _uiState.value = AuthUiState.Error(message)
    }

    fun register(email: String, pass: String, confirmPass: String, displayName: String, acceptTerms: Boolean) {
        if (displayName.isBlank()) {
            _uiState.value = AuthUiState.Error("Please enter your full name.")
            return
        }
        if (email.isBlank()) {
            _uiState.value = AuthUiState.Error("Please enter an email address.")
            return
        }
        if (pass.length < 6) {
            _uiState.value = AuthUiState.Error("Password must be at least 6 characters.")
            return
        }
        if (pass != confirmPass) {
            _uiState.value = AuthUiState.Error("Passwords do not match.")
            return
        }
        if (!acceptTerms) {
            _uiState.value = AuthUiState.Error("Please accept the terms of service.")
            return
        }

        _uiState.value = AuthUiState.Loading
        viewModelScope.launch {
            repository.signUpWithEmail(email, pass, displayName)
                .onSuccess { user ->
                    _uiState.value = AuthUiState.Success(user)
                }
                .onFailure { error ->
                    _uiState.value = AuthUiState.Error(error.message ?: "Registration failed.")
                }
        }
    }

    fun sendPasswordReset(email: String) {
        if (email.isBlank()) {
            _uiState.value = AuthUiState.Error("Please enter your registered email address.")
            return
        }

        _uiState.value = AuthUiState.Loading
        viewModelScope.launch {
            repository.sendPasswordReset(email)
                .onSuccess {
                    _uiState.value = AuthUiState.ResetEmailSent(email)
                }
                .onFailure { error ->
                    _uiState.value = AuthUiState.Error(error.message ?: "Failed to send reset email.")
                }
        }
    }

    fun logout(onComplete: () -> Unit = {}) {
        viewModelScope.launch {
            repository.signOut()
            _uiState.value = AuthUiState.Idle
            onComplete()
        }
    }

    fun resetState() {
        _uiState.value = AuthUiState.Idle
    }
}

