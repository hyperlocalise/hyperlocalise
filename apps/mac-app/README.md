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

## Setup

```bash
cd apps/mac-app
./Scripts/generate-project.sh
open Hyperlocalise.xcodeproj
```

In Xcode scheme environment variables (or `Config/Debug.xcconfig`):

```
HYPERLOCALISE_API_BASE_URL = https://app.hyperlocalise.com
```

For local API development:

```
HYPERLOCALISE_API_BASE_URL = http://localhost:3000
```

Optional loopback redirects for debugging can be allowlisted on the server with
`WORKOS_NATIVE_REDIRECT_URIS`.

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

## Tests

```bash
xcodebuild test -scheme Hyperlocalise -destination 'platform=macOS'
```

Linux CI does not build this target (requires Xcode). Server-side native auth
tests live under `apps/hyperlocalise-web`.
