package com.virux.app

import android.app.Application
import android.util.Log
import com.google.firebase.FirebaseApp

/**
 * VIRUX Application class.
 *
 * Responsible for:
 * - Initializing Firebase SDK on application start.
 * - Providing application-scoped dependencies in future phases.
 *
 * Future phases will add:
 * - Dependency injection container (Hilt).
 * - Crash reporting initialization.
 * - Analytics initialization.
 */
class ViruxApplication : Application() {

    override fun onCreate() {
        super.onCreate()
        initializeFirebase()
    }

    private fun initializeFirebase() {
        try {
            FirebaseApp.initializeApp(this)
            Log.i(TAG, "Firebase initialized successfully.")
        } catch (e: Exception) {
            Log.e(TAG, "Firebase initialization failed: ${e.message}", e)
        }
    }

    companion object {
        private const val TAG = "ViruxApplication"
    }
}

