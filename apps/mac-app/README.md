# Hyperlocalise Mac App

Native macOS client for Hyperlocalise. Sign in with WorkOS AuthKit, then chat
with the agent to find repository context and run localization work.

Licensed under the Business Source License 1.1 — see [LICENSE](./LICENSE).

## MVP features

- WorkOS AuthKit login via `ASWebAuthenticationSession` + PKCE
- Sealed session stored in Keychain (`wos-session`, same channel as the web app)
- Organization context bootstrap
- Conversation list, create, reply, and AI SDK UIMessage streaming

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

Override in the Xcode scheme environment if you point at a preview deployment.

## Architecture

```
Hyperlocalise/
  App/          # SwiftUI shell, app model
  Auth/         # PKCE, ASWebAuthenticationSession, Keychain
  API/          # HTTP client, conversation + chat stream parsers
  Chat/         # Chat UI + view model
  Design/       # Colors, typography tokens
```

Auth bridge (server):

- `GET  /api/auth/native/authorize`
- `POST /api/auth/native/token`

Chat APIs (existing org routes, cookie session):

- `GET  /api/auth/context`
- `GET|POST /api/orgs/{slug}/conversations…`
- `POST /api/orgs/{slug}/conversations/{id}/chat`

Design notes: [`docs/plans/2026-07-18-mac-app-mvp-design.md`](../../docs/plans/2026-07-18-mac-app-mvp-design.md).

## Delivery and auto-update

The intended distribution path is **outside the Mac App Store**: a Developer
ID–signed, notarized DMG (or ZIP) from GitHub Releases or
`https://hyperlocalise.com`, with in-app updates via
[Sparkle](https://sparkle-project.org/).

### How users get the app

1. Download a notarized `Hyperlocalise.app` archive (DMG/ZIP).
2. Open it under Gatekeeper (Developer ID + notarization).
3. Optional later: Homebrew Cask (`brew install --cask …`) for engineer installs.

Mac App Store is a separate path (Apple-hosted updates, sandbox/review tradeoffs)
and is not the MVP delivery plan.

### How “Check for Updates” works (Sparkle)

1. CI archives the app, signs with **Developer ID Application**, notarizes, and
   uploads the DMG/ZIP to a release.
2. CI publishes an **appcast** (XML) at a stable URL, for example
   `https://updates.hyperlocalise.com/mac/appcast.xml`, with version, download
   URL, and an **EdDSA signature** of the archive.
3. The app embeds Sparkle. On launch or when the user chooses **Check for
   Updates…**, Sparkle fetches the appcast, compares
   `CFBundleShortVersionString` / build number, downloads the new archive,
   verifies the EdDSA signature, replaces the app bundle, and relaunches.

Trust model: Apple code signature + notarization for first install; Sparkle
EdDSA so a tampered appcast cannot ship a fake binary.

### What release automation needs

- Apple Developer Program (Developer ID Application certificate)
- Notarization credentials (App Store Connect API key)
- Sparkle EdDSA keypair (private key in CI secrets; public key embedded in the app)
- Stable appcast URL that stays fixed across versions
- A Mac CI runner for `xcodebuild archive` → notarize → upload → sign appcast

Sparkle is not wired into the MVP sources yet; add it when the first public
binary ships.

## Tests

```bash
xcodebuild test -scheme Hyperlocalise -destination 'platform=macOS'
```

Linux CI does not build this target (requires Xcode). Server-side native auth
tests live under `apps/hyperlocalise-web`.
