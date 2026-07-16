# Crowdin App agent chat inbox

## Problem

Localization teams work inside Crowdin but must leave the product to use the
Hyperlocalise agent chat inbox. We already connect orgs and users to Crowdin
(TMS credentials + per-user OAuth/PAT). We lack a Crowdin App that embeds the
inbox in a Crowdin project.

## Decision

Host a Crowdin App inside `hyperlocalise-web` that exposes a **project-scoped**
agent chat inbox in a Crowdin `project-menu` iframe.

- Reuse inbox UI and conversation/chat APIs.
- Resolve the Hyperlocalise org from the Crowdin JWT against the org Crowdin
  TMS credential.
- Resolve the Hyperlocalise user from JWT `user_id` via
  `crowdin_user_connections` (existing per-user Crowdin link).
- Resolve the Hyperlocalise project from Crowdin project id via
  `projects.externalProjectId`.
- Authenticate iframe API calls with a short-lived embed session (WorkOS
  cookies are unreliable in a third-party iframe).

Chosen over a separate Crowdin App deploy (extra infra, duplicated UI) and
over a launcher-only tab (does not keep the inbox inside Crowdin).

## Architecture

```
Crowdin project UI
  └─ iframe → /crowdin-app/inbox?jwtToken=…&origin=…
       ├─ verify Crowdin App JWT
       ├─ resolve HL org (Crowdin org → TMS credential)
       ├─ resolve HL user (JWT.user_id → crowdin_user_connections)
       ├─ resolve HL project (Crowdin project id → externalProjectId)
       ├─ mint short-lived embed session cookie
       └─ slim inbox shell (reuse inbox components, no AppShell)
            └─ /api/orgs/:slug/conversations* (embed session → same capabilities)
```

| Concern | Owner |
|---------|--------|
| Crowdin App OAuth (`clientId` / secret) | JWT verify + install/uninstall |
| Org Crowdin TMS credential | Which Hyperlocalise org |
| `crowdin_user_connections` | Which Hyperlocalise user |
| Embed session | API auth inside the iframe |
| User Crowdin token on the connection | Crowdin API tools only (not inbox auth) |

## Auth and identity

### Bootstrap

1. Crowdin opens `/crowdin-app/inbox` with `jwtToken`, `origin`, `clientId`.
2. Server verifies the JWT with the Crowdin App client secret.
3. Read Crowdin `organization_id`, `user_id`, and project id from the JWT.
4. Map Crowdin org → Hyperlocalise org via the Crowdin TMS credential.
   Persist Crowdin org id / domain on the credential if lookup is not already
   deterministic.
5. Map Crowdin user → Hyperlocalise user with
   `findConnectionOwnerByCrowdinUserId({ organizationId, crowdinUserId })`.
6. Map Crowdin project → Hyperlocalise project
   (`providerKind === "crowdin"` and matching `externalProjectId`).
7. Load membership and capabilities for that user/org (same rules as web
   inbox, including `ai_actions:run` for chat).
8. Mint a short-lived, HttpOnly, Secure, `SameSite=None` embed session cookie
   scoped to Crowdin App routes. Payload includes Hyperlocalise user/org/project
   ids, Crowdin ids, and expiry, signed with an app secret.

### API auth

- Inbox UI calls existing conversation and chat routes (or thin Crowdin App
  wrappers that set the same auth variables).
- Middleware accepts the embed session as an alternate to the WorkOS session
  for those routes only. It still loads real membership and capabilities.
- Do not use the user's Crowdin OAuth/PAT token to authorize inbox APIs.

### Install and uninstall

Manifest uses `authentication.type: crowdin_app` and `events.installed` /
`uninstall`. Store Crowdin App install credentials separately from TMS
credentials. v1 inbox needs JWT verification via the App OAuth secret;
install rows are metadata for later Crowdin-as-app API use.

### Failure modes

| Case | UX |
|------|-----|
| Bad or expired JWT | Unauthorized |
| No matching Hyperlocalise org credential | Connect Crowdin for this org in Hyperlocalise |
| No `crowdin_user_connections` row | Link Crowdin account in Integrations (link out) |
| No Hyperlocalise project for Crowdin project | Link this Crowdin project in Hyperlocalise |
| Missing membership or capabilities | Forbidden / read-only as on web |

## UI and components

### Routes

| Route | Role |
|-------|------|
| `/crowdin-app/manifest.json` | Dynamic Crowdin App descriptor |
| `/crowdin-app/inbox` | Embed entry |
| `/api/crowdin-app/events/installed` | Install webhook |
| `/api/crowdin-app/events/uninstall` | Uninstall webhook |
| `/api/crowdin-app/session` | Optional session refresh/exchange |

### Composition

- Reuse inbox list, conversation panel, message list, reply composer, and
  `ChatStreamManager`.
- Thin `CrowdinAppInboxPage` wrapper pins `organizationSlug` and `projectId`
  from the embed session, filters and creates conversations for that project,
  and loads Crowdin `iframe.js` when useful.
- No AppShell, nav, chat dock, or footer. Compact two-pane layout; stack on
  narrow widths.
- Optional “Open in Hyperlocalise” deep link to
  `/org/{slug}/inbox/{conversationId}`.

### Framing

Allow framing only for `/crowdin-app/*` from Crowdin origins
(`*.crowdin.com` and configurable Enterprise domains). Keep restrictive
frame policy elsewhere.

## Data flow

```
User opens Crowdin project → Hyperlocalise tab
  → JWT bootstrap → embed session
  → GET conversations?projectId=<hlProjectId>
  → select or create thread (always with projectId)
  → POST .../chat as Hyperlocalise user
  → agent tools may use crowdin_user_connections for Crowdin API
  → persist on interactions / inbox_items (same as web)
```

New threads use `source: chat_ui` and the mapped Hyperlocalise `projectId`.

## Implementation order

1. Crowdin App skeleton: manifest, install/uninstall, env vars.
2. Org identity persistence: queryable Crowdin org id/domain on TMS credential.
3. Embed auth: JWT verify, user/project resolve, embed session + middleware.
4. Embed UI: `/crowdin-app/inbox`, inbox reuse, frame-ancestors.
5. Hardening: tests, CSP, capability parity, empty states.
6. Manual install from manifest URL and smoke test in a linked project.

## Testing

- Unit: JWT verify, org/user/project resolution, embed session mint/reject.
- Route: list/create/chat with embed session; reject without; reject wrong
  project.
- UI: unlinked user and unmapped project empty states; project filter on create.
- Manual: real Crowdin iframe against staging.

## Risks

| Risk | Mitigation |
|------|------------|
| Ambiguous Crowdin org → Hyperlocalise org | Require a unique match; otherwise error |
| `SameSite=None` cookie blocked | Fallback: bootstrap returns a bearer token used as `Authorization` |
| AUTH_INVARIANTS drift | Document embed session as an explicit exception with the same capability checks |
| Enterprise Crowdin domains | Configurable `frame-ancestors` allowlist |

## Out of scope (v1)

- In-iframe Crowdin account linking (link out to Integrations)
- Organization-level (non-project) Crowdin module
- Full org inbox without project filter
- Separate Crowdin App service deploy
- Agent runtime changes
