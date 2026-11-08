# Default ProGuard rules for VIRUX
# Phase 1: Minimal rules — Firebase and Kotlin are handled automatically.
# Expand this file in production phases.

# Keep Firebase classes
-keep class com.google.firebase.** { *; }
-keep class com.google.android.gms.** { *; }

# Keep VIRUX application classes
-keep class com.virux.app.** { *; }

# Kotlin metadata
-keepattributes *Annotation*
-keepattributes SourceFile,LineNumberTable

