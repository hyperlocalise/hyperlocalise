# GitLab Phase 1 — OAuth connect and sandbox clone

## Problem

Integrations shows GitLab as Coming soon. Agents can only clone GitHub
repos into Vercel sandboxes via GitHub App installation tokens. Customers
on GitLab need the same connect → enable projects → pull code path.

## Decision

Ship Phase 1 only:

1. Org-scoped GitLab OAuth Application connect (Slack-style flow)
2. Encrypted access/refresh token storage (TMS credential crypto)
3. Project sync + enable/disable (GitHub installation UI/API shape)
4. Sandbox clone via HTTPS `oauth2:<token>` credentials
5. Provider-tagged repository context types for GitLab alongside GitHub

Out of scope: MR bot, webhooks, push automations, self-hosted custom
OAuth apps per customer (store `baseUrl` for future; Phase 1 uses
`GITLAB_BASE_URL`, default `https://gitlab.com`).

## Auth model

| Piece | Source |
|-------|--------|
| Connect UX | Slack OAuth (`install-url` + state nonce + code callback) |
| Token storage | AES-256-GCM via `PROVIDER_CREDENTIALS_MASTER_KEY` |
| Project list UI | GitHub installation repositories row |
| Sandbox git source | Existing `GitWorkspaceSource` |

GitLab scopes for Phase 1: `read_api`, `read_repository`, `read_user`.

## Schema

- `gitlab_connections` — one per org; account metadata + encrypted token bundle
- `gitlab_connection_states` — one-time OAuth state nonces
- `gitlab_projects` — synced projects with `enabled` flag

## Runtime

`createGitlabRepositorySandbox` mints/refreshes an access token, then
creates a Vercel sandbox with:

```
url: {baseUrl}/{pathWithNamespace}.git
username: oauth2
password: <access_token>
```

## Env

- `GITLAB_CLIENT_ID`
- `GITLAB_CLIENT_SECRET`
- `GITLAB_OAUTH_STATE_SECRET`
- `GITLAB_REDIRECT_URI` (optional; default `{origin}/api/auth/gitlab/callback`)
- `GITLAB_BASE_URL` (optional; default `https://gitlab.com`)
