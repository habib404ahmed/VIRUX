package com.virux.app.ui.screens.pairing

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.virux.app.data.model.QRPayload
import com.virux.app.data.model.ViruxDevice
import com.virux.app.data.provider.DeviceIdProviderImpl
import com.virux.app.data.provider.DeviceTelemetryProviderImpl
import com.virux.app.data.provider.KeySecurityLevel
import com.virux.app.data.provider.KeyStoreProviderImpl
import com.virux.app.data.repository.DeviceRepository
import com.virux.app.data.repository.DeviceRepositoryImpl
import com.virux.app.service.ViruxDeviceService
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

sealed interface PairingUiState {
    object Idle : PairingUiState
    object Processing : PairingUiState
    data class Success(val device: ViruxDevice) : PairingUiState
    data class Error(val message: String) : PairingUiState
}

class PairingViewModel(application: Application) : AndroidViewModel(application) {

    private val deviceIdProvider = DeviceIdProviderImpl(application)
    private val keyStoreProvider = KeyStoreProviderImpl(application)
    private val telemetryProvider = DeviceTelemetryProviderImpl(application)

    val deviceRepository: DeviceRepository = DeviceRepositoryImpl(
        context = application,
        deviceIdProvider = deviceIdProvider,
        keyStoreProvider = keyStoreProvider,
        deviceTelemetryProvider = telemetryProvider
    )

    private val _uiState = MutableStateFlow<PairingUiState>(PairingUiState.Idle)
    val uiState: StateFlow<PairingUiState> = _uiState.asStateFlow()

    private val _pinCode = MutableStateFlow("")
    val pinCode: StateFlow<String> = _pinCode.asStateFlow()

    val securityLevel: KeySecurityLevel = keyStoreProvider.getSecurityLevel()
    val deviceId: String = deviceIdProvider.getDeviceId()

    fun onPinChange(newPin: String) {
        val filtered = newPin.filter { it.isDigit() }.take(6)
        _pinCode.value = filtered
    }

    fun submitPin() {
        val currentPin = _pinCode.value.trim()
        if (currentPin.length != 6) {
            _uiState.value = PairingUiState.Error("Please enter all 6 digits of the pairing code.")
            return
        }

        _uiState.value = PairingUiState.Processing
        viewModelScope.launch {
            val result = deviceRepository.claimPairingWithPin(currentPin)
            result.onSuccess { device ->
                ViruxDeviceService.startService(getApplication())
                _uiState.value = PairingUiState.Success(device)
            }.onFailure { err ->
                _uiState.value = PairingUiState.Error(err.message ?: "Failed to pair using PIN code.")
            }
        }
    }

    fun onQrScanned(rawJson: String) {
        if (_uiState.value is PairingUiState.Processing || _uiState.value is PairingUiState.Success) return

        _uiState.value = PairingUiState.Processing
        viewModelScope.launch {
            val parseResult = QRPayload.fromJson(rawJson)
            if (parseResult.isFailure) {
                _uiState.value = PairingUiState.Error(
                    parseResult.exceptionOrNull()?.message ?: "Unrecognized QR code format."
                )
                return@launch
            }

            val payload = parseResult.getOrThrow()
            val claimResult = deviceRepository.claimPairingSession(payload)

            claimResult.onSuccess { device ->
                ViruxDeviceService.startService(getApplication())
                _uiState.value = PairingUiState.Success(device)
            }.onFailure { err ->
                _uiState.value = PairingUiState.Error(
                    err.message ?: "Failed to complete cryptographic pairing."
                )
            }
        }
    }

    fun resetState() {
        _uiState.value = PairingUiState.Idle
        _pinCode.value = ""
    }
}

