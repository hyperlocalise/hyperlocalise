# Mac app MVP design

## Goal

Ship a native macOS client under `apps/mac-app` (BSL 1.1) that lets a signed-in
user chat with the Hyperlocalise agent to find context and do localization work.

## Approaches considered

1. **Electron / Tauri shell around the web chat dock** — fastest UI reuse, weak
   native fit, larger runtime, still needs a native-friendly auth story.
2. **SwiftUI client + new Bearer token channel (`hlmac_`)** — clean native API,
   but invents a second org-auth channel beside WorkOS cookies and Crowdin
   embed tokens.
3. **SwiftUI client + WorkOS AuthKit PKCE → sealed `wos-session` (chosen)** —
   Mac opens AuthKit via `ASWebAuthenticationSession`, exchanges the code
   through a thin API bridge, stores the same sealed session the web app uses,
   and calls existing conversation APIs with `Cookie: wos-session=…`.

Option 3 keeps AUTH_INVARIANTS intact (WorkOS session remains the primary org
API channel) and reuses chat, membership reconcile, and streaming unchanged.

## Architecture

```
┌──────────────────────────── apps/mac-app ────────────────────────────┐
│  SwiftUI                                                             │
│  LoginView ──ASWebAuthenticationSession──► WorkOS AuthKit (PKCE)     │
│       │                                                              │
│       ▼                                                              │
│  AuthService ──POST /api/auth/native/token──► sealedSession          │
│       │                                      (Keychain)              │
│       ▼                                                              │
│  APIClient (Cookie: wos-session)                                     │
│       ├── GET  /api/auth/context                                     │
│       ├── GET/POST /api/orgs/{slug}/conversations[…]                 │
│       └── POST /api/orgs/{slug}/conversations/{id}/chat (SSE)        │
└──────────────────────────────────────────────────────────────────────┘
```

### Native auth bridge (`hyperlocalise-web`)

| Route | Auth | Purpose |
|-------|------|---------|
| `GET /api/auth/native/authorize` | public | Build AuthKit authorize URL for a client PKCE challenge + allowlisted redirect |
| `POST /api/auth/native/token` | public | Exchange `code` + `code_verifier` for sealed session + user profile |
| `POST /api/auth/native/logout` | session cookie | Best-effort revoke / clear guidance |

Redirect allowlist (MVP):

- `hyperlocalise://auth/callback` (production custom URL scheme)
- optional env override `WORKOS_NATIVE_REDIRECT_URIS` (comma-separated)

The bridge calls `workos.userManagement.authenticateWithCode` with
`session: { sealSession: true, cookiePassword }` so the Mac receives the same
sealed payload AuthKit would write into the browser cookie.

### Chat client

Mirror the web chat dock pipeline:

1. Bootstrap orgs via `GET /api/auth/context`.
2. Create conversation: `POST …/conversations` (multipart `text`).
3. Reply: `POST …/conversations/{id}/messages`.
4. Stream: `POST …/conversations/{id}/chat` with AI SDK UIMessage JSON whose
   last user message id matches the persisted row.
5. Parse SSE for text parts; show tool/status lines when present.

Optional `repositoryFullName` on create enables find-context / repo sandbox,
matching the web dock.

## Mac app layout

- **Login**: brand + short promise + Sign in with WorkOS.
- **Shell**: sidebar (org picker, conversation list, sign out) + chat column
  (transcript + composer).
- **MVP out of scope**: attachments UI, full tool-card parity, CAT workspace,
  billing, inbox triage.

## Licensing

`apps/mac-app/LICENSE` uses Business Source License 1.1 with the same Change
Date / Additional Use Grant as `apps/hyperlocalise-web` and `apps/canva-app`.
Root `LICENSE` notice updated to list the Mac app.

## Testing

- Web: unit tests for authorize allowlist + token exchange happy/error paths.
- Mac: XCTest for PKCE generation and UIMessage stream text extraction.
- Full Xcode build requires macOS; Linux CI validates web bridge tests and
  source layout.

## Risks

- WorkOS dashboard must register the custom scheme redirect URI.
- Sealed sessions follow AuthKit cookie lifetime/refresh rules; Mac must treat
  401 as sign-out and re-auth.
- AI SDK stream schema may evolve; keep a thin parser that extracts text first.
