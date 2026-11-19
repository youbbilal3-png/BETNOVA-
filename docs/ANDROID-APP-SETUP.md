# BETNOVA Android app

BETNOVA is a React + Vite app with a Capacitor 8 Android wrapper. The Android app bundles the existing web build and continues to use Firebase Hosting and Supabase.

## Current Android foundation

- Application ID: `com.betnova.app`
- Display name: `BETNOVA`
- Bundled web assets: `dist/`
- Firebase Android project: `betnova-8daa3`
- Firebase Android configuration: `google-services.json`
- Android build workflow: `.github/workflows/android-apk.yml`
- Current CI artifact: temporary debug APK for device testing only; it is not a production release.

## Push notification implementation

The application code includes:

- Android permission request and FCM device-token registration.
- User-controlled master switch and individual event preferences.
- Match and team follow subscriptions.
- Server-side FCM HTTP v1 delivery with per-user/event idempotency.
- Verified-goal handling that avoids sending alerts for VAR-overturned goals.
- Live-provider integration for confirmed goals, red cards, kickoff and full-time events.
- Automatic removal of FCM tokens that Firebase reports as permanently unregistered.

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

The policy currently has an empty download URL. Do not enable a mandatory update until a signed APK has been built and uploaded to a stable HTTPS download location. Set `minimumSupportedVersion` to the minimum version allowed to continue and `latestVersion` to the newest release.

## Production signing and release

A production APK requires a persistent Android release keystore. Create it once, keep a secure offline backup, and use the same key for every future update. Store the keystore and passwords as GitHub Actions secrets; never commit them to the repository or share them in chat.

The debug APK uses a debug signing identity and must not be treated as a production update path. The release signing workflow and the final update URL still need to be completed after the owner has securely configured the signing credentials.

## Deployment boundaries

- Firebase Hosting remains the only website hosting and deployment target.
- Supabase remains the database and Edge Function backend.
- GitHub Actions builds the Android APK.
- Do not use Vercel for builds, hosting, previews, or deployment.

Before distributing or enabling real-money functionality, verify the applicable local gambling, consumer-protection, privacy, age-verification, and payment requirements.
