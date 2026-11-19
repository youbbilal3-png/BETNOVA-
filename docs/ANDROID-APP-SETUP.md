# BETNOVA Android app foundation

This repository is a React + Vite web app. The Android wrapper uses Capacitor 8 and keeps the existing web build bundled inside the APK.

## Current foundation

- Android application ID: `com.betnova.app`
- Display name: `BETNOVA`
- Web assets: `dist/`
- Android debug APK: built by the GitHub Actions workflow `.github/workflows/android-apk.yml`
- The workflow uploads a temporary debug APK artifact for device testing; it is not a public release.

## Required before production release

1. Register an Android app with application ID `com.betnova.app` in the Firebase project used for BETNOVA.
2. Add the matching `google-services.json` to the generated Android app (do not commit private service-account credentials).
3. Configure Firebase Cloud Messaging and implement notification token registration and server-side event delivery.
4. Implement a server-controlled minimum supported app version and official APK download URL for mandatory updates.
5. Create and securely back up a release signing key. Store signing credentials only as GitHub Actions secrets; never commit them.
6. Verify local gambling, consumer-protection, privacy, age-verification, and payment requirements before distributing or enabling real-money functionality.

## Build

The Android workflow creates the native Android project on the GitHub runner, builds a debug APK, and uploads it as a workflow artifact. A release APK/AAB requires the production Firebase configuration and signing setup above.
