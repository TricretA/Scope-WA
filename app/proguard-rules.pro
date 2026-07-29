# Room generates code at compile time; nothing extra needed for its runtime.
# Keep Accessibility Service and Foreground Service classes referenced only from the manifest.
-keep class com.tricreta.scopewa.accessibility.** { *; }
-keep class com.tricreta.scopewa.jobrunner.** { *; }
