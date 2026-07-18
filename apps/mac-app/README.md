# Hyperlocalise Mac App

Native macOS client for Hyperlocalise. Sign in with WorkOS AuthKit, then chat
with the agent to find repository context and run localization work.

Licensed under the Business Source License 1.1 — see [LICENSE](./LICENSE).

## MVP features

- WorkOS AuthKit login via `ASWebAuthenticationSession` + PKCE
- Sealed session stored in Keychain (`wos-session`, same channel as the web app)
- Organization context bootstrap
- Conversation list, create, reply, and AI SDK UIMessage streaming
- Sparkle 2 in-app updates (**Hyperlocalise → Check for Updates…**)

## Requirements

- macOS 14+
- Xcode 16+
- [XcodeGen](https://github.com/yonaskolb/XcodeGen) (`brew install xcodegen`)
- A Hyperlocalise web deployment with WorkOS configured
- WorkOS redirect URI registered: `hyperlocalise://auth/callback`

## Development workflow

1. Run the web API locally (see [`apps/hyperlocalise-web/AGENTS.md`](../hyperlocalise-web/AGENTS.md)) so auth and chat routes are available at `http://localhost:3000`.
2. In the WorkOS dashboard, add the native redirect URI `hyperlocalise://auth/callback`.
3. Generate and open the Xcode project:

```bash
cd apps/mac-app
./Scripts/generate-project.sh
open Hyperlocalise.xcodeproj
```

4. Confirm Debug uses the local API (default in `Config/Debug.xcconfig`):

```
HYPERLOCALISE_API_BASE_URL = http://localhost:3000
```

5. Build and run the **Hyperlocalise** scheme from Xcode (`⌘R`).
6. Sign in with WorkOS, pick an organization, and send a chat message.
7. After changing Swift sources or `project.yml`, regenerate if needed and re-run tests:

```bash
./Scripts/generate-project.sh
xcodebuild test -scheme Hyperlocalise -destination 'platform=macOS'
```

Server-side native auth changes live under `apps/hyperlocalise-web` (`/api/auth/native/*`). Validate those with `vp test` and `vp check --fix` in that app.

Optional loopback redirects for debugging can be allowlisted on the server with
`WORKOS_NATIVE_REDIRECT_URIS`.

Do not commit `Hyperlocalise.xcodeproj` or DerivedData; regenerate with
`./Scripts/generate-project.sh`.

## Configuration

| Build | `HYPERLOCALISE_API_BASE_URL` |
|-------|------------------------------|
| Debug (local) | `http://localhost:3000` |
| Release | `https://hyperlocalise.com` |

| Sparkle key | Default |
|-------------|---------|
| `SU_FEED_URL` | `https://updates.hyperlocalise.com/mac/appcast.xml` |
| `SU_PUBLIC_ED_KEY` | `REPLACE_WITH_SPARKLE_PUBLIC_ED_KEY` until keys are generated |

Override in the Xcode scheme environment if you point at a preview deployment.

## Architecture

```
Hyperlocalise/
  App/          # SwiftUI shell, app model, Sparkle updater
  Auth/         # PKCE, ASWebAuthenticationSession, Keychain
  API/          # HTTP client, conversation + chat stream parsers
  Chat/         # Chat UI + view model
  Design/       # Colors, typography tokens
Updates/        # Example appcast for Sparkle releases
```

Auth bridge (server):

- `GET  /api/auth/native/authorize`
- `POST /api/auth/native/token`

Chat APIs (existing org routes, cookie session):

- `GET  /api/auth/context`
- `GET|POST /api/orgs/{slug}/conversations…`
- `POST /api/orgs/{slug}/conversations/{id}/chat`

Design notes: [`docs/plans/2026-07-18-mac-app-mvp-design.md`](../../docs/plans/2026-07-18-mac-app-mvp-design.md).

## Delivery and auto-update (Sparkle)

Distribution is **outside the Mac App Store**: Developer ID–signed, notarized
DMG/ZIP, with in-app updates via [Sparkle 2](https://sparkle-project.org/).

The app already embeds Sparkle (`project.yml` SPM dependency) and exposes
**Hyperlocalise → Check for Updates…** through `SPUStandardUpdaterController`.
Sandbox support uses `SUEnableInstallerLauncherService` plus the
`mach-lookup` temporary exceptions in `Hyperlocalise.entitlements`.

Until `SU_PUBLIC_ED_KEY` is a real EdDSA public key, the updater does **not**
start automatic checks (see `SparkleUpdater.makeForCurrentBundle()`), so local
Debug builds stay quiet.

### One-time key setup

On a Mac, download a Sparkle release that includes `bin/generate_keys`, then:

```bash
cd apps/mac-app
GENERATE_KEYS=/path/to/Sparkle/bin/generate_keys ./Scripts/generate-sparkle-keys.sh
```

1. Paste the **public** key into `SU_PUBLIC_ED_KEY` in `Config/Debug.xcconfig`
   and `Config/Release.xcconfig` (or Release-only if you prefer).
2. Store the **private** key in CI secrets. Never commit
   `apps/mac-app/.sparkle-keys/`.
3. Keep `SU_FEED_URL` pointed at the hosted appcast (default
   `https://updates.hyperlocalise.com/mac/appcast.xml`).

### How users get the app

1. Download a notarized `Hyperlocalise.app` archive (DMG/ZIP).
2. Open it under Gatekeeper (Developer ID + notarization).
3. Optional later: Homebrew Cask for engineer installs.

### Release an update

1. Bump `MARKETING_VERSION` and `CURRENT_PROJECT_VERSION` in `project.yml`.
2. Archive, sign with **Developer ID Application**, notarize, and upload the
   DMG/ZIP (GitHub Releases or `https://hyperlocalise.com`).
3. Sign the archive with Sparkle:

```bash
/path/to/Sparkle/bin/sign_update Hyperlocalise-0.2.0.dmg
```

4. Publish `appcast.xml` from `Updates/appcast.example.xml`: set
   `sparkle:version`, `sparkle:shortVersionString`, `enclosure url`,
   `length`, and `sparkle:edSignature` from `sign_update`.
5. Host the appcast at `SU_FEED_URL`.

Users choose **Check for Updates…**, or Sparkle checks in the background
(about once per day when configured). Sparkle compares versions, downloads the
archive, verifies the EdDSA signature, replaces the app, and relaunches.

### What release automation needs

- Apple Developer Program (Developer ID Application certificate)
- Notarization credentials (App Store Connect API key)
- Sparkle EdDSA keypair (private in CI; public in `SU_PUBLIC_ED_KEY`)
- Stable appcast URL
- A Mac CI runner for `xcodebuild archive` → notarize → upload → `sign_update`

### Testing updates locally

1. Set a real `SU_PUBLIC_ED_KEY` and point `SU_FEED_URL` at a local or staging
   appcast (HTTPS, or temporarily allow the host under ATS if needed).
2. Install an older build, then serve a newer signed build via the appcast.
3. Clear the last check time if needed:

```bash
defaults delete com.hyperlocalise.mac SULastCheckTime
```

4. Run **Check for Updates…**. If Xcode cannot attach to Sparkle XPC services,
   disable **Debug XPC services used by app** in the scheme, or test a
   notarized build outside the debugger.

## Tests

```bash
xcodebuild test -scheme Hyperlocalise -destination 'platform=macOS'
```

Linux CI does not build this target (requires Xcode). Server-side native auth
tests live under `apps/hyperlocalise-web`.
