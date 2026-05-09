# hyperlocalise

## What this codebase does

Hyperlocalise is AI-native localization infrastructure. The repo combines
a Go CLI and GitHub Action for local/CI translation workflows with a Next.js 16
+ Hono web app that manages WorkOS organizations, projects, uploaded translation
files, provider credentials, chat/email/GitHub agents, and queued translation
jobs. Data lives in Postgres through Drizzle; durable files use the
`FileStorageAdapter` abstraction, currently Vercel Blob.

## Auth shape

- `createApp` mounts all Hono routes under `/api`; route modules normally call
  `.use("*", workosAuthMiddleware)` for browser/session APIs.
- `workosAuthMiddleware` reads a WorkOS AuthKit session via
  `resolveApiAuthContextFromSession`, resolves `organizationSlug` from
  path/header/query, and sets `ApiAuthContext`.
- `ApiAuthContext` carries `user`, `organizations`, `organization`,
  `activeOrganization`, `membership`, and `activeTeam`; DB queries should scope
  by `localOrganizationId`.
- Public machine APIs use `apiKeyAuthMiddleware` plus
  `requireApiKeyPermission("jobs:read" | "jobs:write")`; API keys are SHA-256
  hashes in `organizationApiKeys`.
- Role gates are local helpers such as `isProjectMutationAllowed`,
  `assertProviderCredentialAdmin`, and explicit owner/admin checks in
  API-key/provider-credential routes.

## Threat model

Highest impact is cross-organization data access: projects, jobs, stored files,
GitHub installations, provider credentials, teams, conversations, and API keys
must stay scoped to the authenticated WorkOS org or API-key org. Secrets are
valuable: provider API keys are encrypted with `encryptProviderCredential`,
GitHub/WorkOS/Resend webhooks use signed payloads, and public job APIs should
never accept only a project/file id without org scoping. The Go CLI also handles
user config, local translation files, provider API tokens, and external TMS APIs,
so risky behavior is mostly around filesystem writes, env loading, provider
calls, and generated output paths.

## Project-specific patterns to flag

- Hono routes under `/api/orgs/:organizationSlug/*` or `/api/project/*` that
  omit `workosAuthMiddleware`, or read `organizationSlug` but do not use
  `c.var.auth.organization` / `activeOrganization`.
- DB reads/writes for `projects`, `jobs`, `storedFiles`, `githubInstallations`,
  `organizationApiKeys`, or provider credentials that filter by raw ids without
  the authenticated `localOrganizationId`.
- Provider credential code that bypasses `assertProviderCredentialAdmin`,
  returns `apiKey` outside the `/reveal` flow, skips `validateProviderCredential`,
  or stores plaintext instead of `encryptProviderCredential` fields.
- Public job routes under `/api/v1/jobs` that skip `apiKeyAuthMiddleware`, skip
  `requireApiKeyPermission`, or fail to verify that project/file ids belong to
  the API key's organization.
- Webhook handlers for GitHub, WorkOS, or Resend that perform side effects
  before signature/adapter verification, or route test-only handler injection
  into production paths.

## Known false-positives

- `/api/health` is intentionally unauthenticated and only reports database
  availability.
- `/api/webhooks/github`, `/api/webhooks/workos`, and `/api/webhooks/resend`
  intentionally do not use WorkOS session auth; GitHub/WorkOS verify signatures
  here and Resend verification is delegated to the chat adapter.
- `apps/hyperlocalise-web/src/lib/env.ts` supplies fake secrets in Vitest/test
  mode only; these are fixtures, not production defaults.
- `apps/cli/internal/envloader` intentionally reads `.env` and `.env.local` from
  the current project without overriding existing process env vars.
- Storage keys and content-disposition filenames are built with `safePathPart` /
  `encodeURIComponent`; do not flag those sanitized filename uses as direct path
  trust without another issue.
