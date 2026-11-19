# BETNOVA Android app

BETNOVA is a React + Vite app with a Capacitor 8 Android wrapper. The Android app bundles the existing web build and continues to use Firebase Hosting and Supabase.

## Current Android foundation

- Application ID: `com.betnova.app`
- Display name: `BETNOVA`
- Bundled web assets: `dist/`
- Firebase Android project: `betnova-8daa3`
- Firebase Android configuration: `google-services.json` (package ID verified against `com.betnova.app`)
- Android build workflow configures the Google Services Gradle plugin after Capacitor sync so FCM can consume the Firebase Android configuration.
- Android build workflow: `.github/workflows/android-apk.yml`
- Current CI artifact: temporary debug APK for device testing only; it is not a production release.

## Push notification implementation

The application code includes:

- Android permission request and FCM device-token registration.
- User-controlled master switch and individual event preferences.
- Match and team follow subscriptions.
- Server-side FCM HTTP v1 delivery with per-user/event idempotency.
- Verified-goal handling that avoids sending alerts for VAR-overturned goals.
- Live-provider integration for confirmed goals, red cards, kickoff, half-time and full-time events.
- Automatic token refresh/registration across Android app launches and cleanup of permanently unregistered FCM tokens.
- Match/team follows that route alerts only to opted-in users following the relevant fixture or team.

Bet-settlement and account-activity preferences are visibly marked as coming soon; their separate secure event pipeline is not implemented yet.

Push delivery is not live until the Edge Functions are deployed and the following secrets are configured securely in Supabase:

| Secret | Required by |
|---|---|
| `FIREBASE_PROJECT_ID` | `dispatch-push-notifications` |
| `FIREBASE_CLIENT_EMAIL` | `dispatch-push-notifications` |
| `FIREBASE_PRIVATE_KEY` | `dispatch-push-notifications` |

Use the Firebase service-account credentials for the BETNOVA project and grant only the Firebase Cloud Messaging permission needed to send messages. Store the private key only in Supabase Edge Function secrets. Never paste it into chat, commit it to GitHub, or place it in the Android app.

Internal dispatch calls are authenticated with the existing server-only Supabase service-role credential. Keep JWT verification enabled on `dispatch-push-notifications`; the service-role key must never be exposed to the Android or web client.

## Mandatory app updates

The native app checks the HTTPS policy at:

`https://betnova-8daa3.web.app/app-version.json`

The policy currently has an empty download URL. Do not enable a mandatory update until a signed APK has been built and uploaded to a stable HTTPS download location. Set `minimumSupportedVersion` to the minimum version allowed to continue and `latestVersion` to the newest release. The Android workflow reads `latestVersion` to set the APK version name and a monotonically increasing Android version code, so increment it for every release.

## Production signing and release

A production APK requires a persistent Android release keystore. Create it once, keep a secure offline backup, and use the same key for every future update. Store these values as GitHub Actions repository secrets:

- `ANDROID_KEYSTORE_BASE64`: base64-encoded keystore file.
- `ANDROID_KEYSTORE_PASSWORD`: keystore password.
- `ANDROID_KEY_ALIAS`: the alias created in the keystore.
- `ANDROID_KEY_PASSWORD`: password for that alias.

Never commit the keystore or passwords to the repository or share them in chat. Generate the keystore once with a trusted JDK using `keytool -genkeypair -v -keystore betnova-release.jks -alias betnova -keyalg RSA -keysize 2048 -validity 10000`. Convert that file to a single-line base64 value for `ANDROID_KEYSTORE_BASE64` (on Linux/Termux: `base64 -w 0 betnova-release.jks`) and keep the original keystore in a secure offline backup.

Add the four values under GitHub repository **Settings → Secrets and variables → Actions**. The optional signed-release job is prepared in `.github/workflows/android-apk.yml`: select the **main** branch in GitHub Actions, run **BETNOVA Android APK**, and set **Build a signed release APK** to true after all four secrets are configured. Signed production builds are blocked on feature branches. The normal workflow continues to build the debug APK without requiring signing secrets.

The debug APK uses a debug signing identity and must not be treated as a production update path. The release workflow is ready for owner-supplied signing credentials, but no production-signed APK exists yet and the forced-update download URL must remain empty until one is uploaded to a stable HTTPS location.

## Deployment boundaries

- Firebase Hosting remains the only website hosting and deployment target.
- Supabase remains the database and Edge Function backend.
- GitHub Actions builds the Android APK.
- Do not use Vercel for builds, hosting, previews, or deployment.

Before distributing or enabling real-money functionality, verify the applicable local gambling, consumer-protection, privacy, age-verification, and payment requirements.
