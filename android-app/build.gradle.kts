// ============================================================
// VIRUX — Root build.gradle.kts
// Project-level Gradle configuration
// ============================================================

plugins {
    // Android application plugin — applied at the :app module level
    alias(libs.plugins.android.application) apply false

    // Kotlin Android plugin
    alias(libs.plugins.kotlin.android) apply false

    // Kotlin Compose compiler plugin (Kotlin 2.x+)
    alias(libs.plugins.kotlin.compose) apply false

    // Google Services plugin for Firebase (applied in :app)
    alias(libs.plugins.google.services) apply false
}

