# WorkOS emulator for e2e authentication

## Summary

Replace the env-gated fixture-auth bypass in `apps/hyperlocalise-web` with [`workos/emulate`](https://github.com/workos/emulate), a local WorkOS API server. Instead of forging a session cookie and short-circuiting our own auth resolvers, we point the WorkOS SDK at the emulator with `WORKOS_API_HOSTNAME`, `WORKOS_API_HTTPS`, and `WORKOS_API_PORT`. Browser e2e then walks the real AuthKit flow — hosted authorize page, PKCE code exchange, sealed `wos-session` cookie, membership reconcile — against a WorkOS that answers on `localhost`.

The application code that exists only to support the bypass gets deleted rather than reimplemented. Nothing in the request path stays behind to be gated.

## Why replace the bypass

Fixture auth works, and it was the right call before an emulator existed. Three problems justify the change.

**It does not exercise the code that matters most.** `resolveFixtureApiAuthContext` returns an `ApiAuthContext` that was assembled at session-creation time and stored in a module-level `Map`. It returns before `resolveApiAuthContextFromSession` reaches the access gate, so browser e2e never runs `reconcileWorkosMembershipsForUser` or `assertWorkosMembershipReconcileAllowsAccess`. Invariants 1, 2, and 6 in [`AUTH_INVARIANTS.md`](../../apps/hyperlocalise-web/src/api/auth/AUTH_INVARIANTS.md) — WorkOS is authoritative, local membership alone never grants access, reconcile runs before membership load — are precisely the invariants the bypass steps around. The same is true of `handleAuth` in the callback route, session refresh in `authkitProxy`, iron-session cookie sealing, and the `organization_selection_required` path behind `/auth/select-organization`. None of them have browser coverage today.

**It is a parallel implementation with its own maintenance cost.** The bypass reaches into ten application files, and it is not confined to test directories: `provisionWorkspaceInWorkos` returns fake `org_fixture_*` identifiers when fixture auth is on, `src/app/auth/onboarding/actions.ts` calls `attachOrganizationToFixtureSession` to patch the in-memory session after workspace creation, and `src/proxy.ts` skips `authkitProxy` entirely for fixture cookies. Every new auth-adjacent behaviour needs a fixture twin, and each twin is a place where e2e can pass while production is broken.

**It ships in the production bundle.** The gate is sound — `E2E_AUTH_MODE=fixture`, a 32-character secret, and neither `NODE_ENV` nor `VERCEL_ENV` set to `production` — and disabled requests return 404 rather than advertising the endpoint. But `POST /api/e2e/auth/session` is compiled into the deployed application, and the only thing standing between it and a minted admin session is environment configuration. The emulator approach leaves no such endpoint to gate: the sole production-visible artifact is that the SDK base URL is configurable, which is an ordinary SDK feature.

## What the emulator provides

Version 0.5.0 covers the surface we depend on. Each row below was confirmed against a running emulator (see [Verification](#verification)).

| Capability | Relevance |
| --- | --- |
| `GET /user_management/authorize` with `--interactive` | Serves an HTML login form, so a browser can sign in without WorkOS's Test Identity Provider |
| PKCE `code_challenge` / `code_verifier` | AuthKit always uses PKCE; the emulator round-trips the challenge and rejects a wrong verifier |
| `POST /user_management/authenticate` (`authorization_code`, `refresh_token`, organization-selection) | Backs `handleAuth`, `authkitProxy` refresh, and `switchToOrganization` |
| `GET /sso/jwks/:client_id` with a pinned RSA key | AuthKit verifies access tokens against this URL; a pinned key keeps JWKS stable across restarts |
| `org_id`, `role`, `roles`, `permissions`, `sid` claims | The claims `withAuth` decodes and our capability layer reads |
| Organization, user, and membership CRUD | Backs `provisionWorkspaceInWorkos` and `reconcileWorkosMembershipsForUser` |
| Signed webhooks | Lets us drive `POST /api/workos-webhook` from real membership changes |
| Error hooks (`/_emulate/hooks`) | Forces 422/500 responses so provisioning and reconcile failure paths become testable |
| Pinned seed ids | A fixture identity can keep a stable `workos_user_id` / `workos_organization_id` across restarts |

The emulator also refuses a non-local `redirect_uri`, which limits the damage a stray configuration can do.

## Design

### Pointing the application at the emulator

This is the whole mechanism, and it needs almost no application code. `@workos-inc/authkit-nextjs@4.3.1` builds its SDK client from three optional environment variables, and derives the JWKS URL from that same client:

```js
// authkit-nextjs/dist/esm/workos.js
const options = { apiHostname: WORKOS_API_HOSTNAME, https: WORKOS_API_HTTPS === 'true', port: parseInt(WORKOS_API_PORT) };
export const getWorkOS = lazy(() => new WorkOS(WORKOS_API_KEY, options));

// authkit-nextjs/dist/esm/session.js
const JWKS = lazy(() => createRemoteJWKSet(new URL(getWorkOS().userManagement.getJwksUrl(WORKOS_CLIENT_ID))));
```

Setting `WORKOS_API_HOSTNAME=localhost`, `WORKOS_API_HTTPS=false`, and `WORKOS_API_PORT=4100` therefore redirects both AuthKit's API calls and its token verification to the emulator. Sign-in URLs, code exchange, session refresh, and JWKS all follow, with no change to `proxy.ts`, the callback route, or `withAuth`.

Two changes are needed on our side:

1. **`src/lib/env.ts`** — add `WORKOS_API_HOSTNAME`, `WORKOS_API_HTTPS`, and `WORKOS_API_PORT` to the schema so they are validated and documented rather than read ad hoc.
2. **`src/lib/workos/config.ts` and `src/lib/workos/server-client.ts`** — `getWorkosServerClient()` currently calls `new WorkOS(config.apiKey)`, and the SDK reads only `WORKOS_API_KEY` and `WORKOS_CLIENT_ID` from the environment, not the hostname. Extend `WorkosAuthKitConfig` with the host fields and pass them through, so our own client (used by provisioning, reconcile, and webhook handling) lands on the same base URL as AuthKit's.

AuthKit reads these variables at module evaluation time through `process.env[name]`, which Next.js cannot inline. They are genuine runtime values, but they are captured once per server process, so the e2e server must be started with them set. There is no way to flip a running deployment into emulator mode.

### The e2e auth mode

`E2E_AUTH_MODE` is already typed as `z.enum(["fixture", "workos"])` in `src/lib/env.ts`, and `config.test.ts` already asserts that `workos` does not enable fixture auth. The migration finishes that thought: `workos` becomes the only supported value, and `fixture` is removed along with the code it gated.

Unlike `fixture`, `workos` mode needs no runtime branch in application code. It is a label for a set of environment variables — emulator host, port, client id, redirect URI — consumed by the test harness and the dev server, not a feature flag the request path consults.

### Identity seeding and isolation

The emulator becomes the single source of truth for identity. Local rows do not need separate seeding: `reconcileWorkosMembershipsForUser` calls `workos.organizations.getOrganization()` and `syncWorkosOrganization` / `syncWorkosUser` / `syncWorkosIdentity`, so when the emulator reports an active admin membership, the reconcile path materialises the local user, organization, and membership rows itself. That is the same code production runs, and it removes the current duplication where `src/test/auth-seed.ts` writes rows that WorkOS never knew about.

Emulator state lives for the life of the process, so isolation comes from unique identities rather than from resetting the server. Each test provisions its own user with a random email through the SDK (`createUser`, `createOrganization`, `createOrganizationMembership`) and tears it down afterwards. A shared, read-only fixture identity can instead be seeded from `workos-emulate.config.yaml` with pinned ids, which keeps its `workos_user_id` stable across restarts.

Two constraints shape this. Reusing one seeded user across tests that create organizations will eventually give that user several active memberships, at which point login returns `organization_selection_required` and unrelated tests start failing — so tests that provision workspaces must own their identity. And the programmatic `reset()` documented in the emulator README cannot re-register authentication events afterwards, so a fresh process per suite is the reliable way to return to a known state.

### Browser login

`loginAsAdmin(page)` keeps its signature and changes its body. Instead of one privileged `POST`, it provisions an identity in the emulator, then drives the real flow:

1. Create user, organization, and admin membership in the emulator over HTTP.
2. `page.goto('/auth/sign-in')`. The app calls `getSignInUrl()` and redirects to the emulator's authorize endpoint with a PKCE challenge.
3. The emulator serves its login page. Fill `input[name="email"]` with the provisioned address and submit — or pass `login_hint` so the field arrives pre-filled.
4. The emulator redirects to `/auth/callback?code=…&state=…`. `handleAuth` exchanges the code with the verifier from the sealed state cookie and writes a real sealed `wos-session`.
5. Assert the dashboard renders.

Steps 2 through 5 are production code paths. The only test-only surface left is step 1, and it targets the emulator rather than our application, so no privileged endpoint has to exist in the app.

### Onboarding

The onboarding flow becomes real rather than simulated. A user provisioned with no membership authenticates with `organization_id: null`, `provisionWorkspaceInWorkos` creates the organization and membership in the emulator for real, and the next `resolveApiAuthContextFromSession` reconcile finds the new membership because reconcile lists all active memberships for the user rather than trusting the session's organization pointer. The `isFixtureAuthEnabled()` branch in `provisionWorkspaceInWorkos` and the `attachOrganizationToFixtureSession` call in `src/app/auth/onboarding/actions.ts` both disappear.

### Teardown

Cleanup keeps the shape it has now — delete by exact id, never by name or prefix — and gains a second half. `cleanupWorkosTestRecords` still removes local rows using the WorkOS ids the test provisioned, and the test additionally deletes the emulator's user and organization. Where a suite runs against a dedicated emulator process, stopping the process is sufficient for the emulator side.

### Emulator lifecycle and CI

Locally, the emulator runs as a background process alongside Postgres, started from a checked-in `workos-emulate.config.yaml`, a checked-in test signing key, and `--interactive`. A `vp run e2e:emulator` script and a short section in [`apps/hyperlocalise-web/AGENTS.md`](../../apps/hyperlocalise-web/AGENTS.md) cover the local workflow.

Browser e2e stays local for now — `.github/workflows/web.yml` continues to run `vp check`, `vp test`, and `vp run build` only. When we are ready for CI, the emulator makes a job practical: Postgres plus a pinned `workos-emulate` binary, seed and signing key, `GET /health`, then build/serve the app with the emulator environment and `vp run test:e2e`. No WorkOS credentials or egress to `api.workos.com` are required.

Pin the emulator version explicitly (`WORKOS_EMULATE_VERSION` / the start script default) rather than tracking `latest`.

## Delivery phases

**Phase 1 — plumbing.** Add the three host variables to `src/lib/env.ts`, thread them through `getWorkosAuthKitConfig()` and `getWorkosServerClient()`, and add the production guard described below. No behaviour changes; fixture auth still works.

**Phase 2 — emulator harness.** Add `workos-emulate.config.yaml`, the test signing key, `.env.e2e.example` for `workos` mode, and the emulator lifecycle script. Add an emulator-backed identity helper for e2e. Nothing is deleted yet, so the two modes coexist and can be compared.

**Phase 3 — migrate flows.** Convert `auth.e2e.ts`, `dashboard.e2e.ts`, `projects.e2e.ts`, and `onboarding.e2e.ts` to emulator login. Onboarding is the most informative to do first: it is the flow with the most fixture-specific scaffolding, so it is where the real path is most likely to reveal something the bypass was hiding.

**Phase 4 — delete the bypass.** Remove `src/lib/e2e/config.ts`, `src/lib/e2e/fixture-auth.ts`, `src/api/routes/e2e/`, and their tests; remove the `/e2e` mount from `src/api/app.ts`; remove the fixture branches from `src/lib/workos/server-auth.ts`, `src/api/auth/workos-session.ts`, `src/proxy.ts`, `src/lib/workos/provision-workspace-in-workos.ts`, and `src/app/auth/onboarding/actions.ts`; drop `fixture` from the `E2E_AUTH_MODE` enum. Unit and route tests are unaffected — they authenticate through `src/api/test-auth.fixture.ts`, which is a separate mechanism and stays as it is.

**Phase 5 — Local coverage first; CI later.** Run browser e2e locally against the emulator. Defer wiring `test:e2e` into `.github/workflows/web.yml` until the suite is stable. Then add the tests the bypass made impossible: membership revoked in WorkOS loses access on reconcile, `organization_selection_required` drives the organization picker, session refresh after access-token expiry, provisioning failure via an error hook, and webhook-driven membership updates.

## Safety and failure handling

Removing the bypass removes its production risk, and introduces a smaller one: a deployment could in principle be configured to talk to something other than WorkOS. Treat `WORKOS_API_HOSTNAME` as the new sensitive switch and fail fast rather than silently. Add a startup assertion that refuses to boot when `WORKOS_API_HOSTNAME` is set to anything other than `api.workos.com` while `NODE_ENV` or `VERCEL_ENV` is `production`. This is strictly stronger than today's posture, where the equivalent misconfiguration mints sessions instead of refusing to start.

Three further points are worth stating. The checked-in signing key is a test fixture and must never be a key any real environment trusts; the emulator README makes the same point. The emulator binds to `localhost` by default and its `/_emulate/hooks` endpoints are unauthenticated, so it must not be exposed beyond the test host. And the emulator's refusal of non-local `redirect_uri` values means a misconfigured callback fails visibly rather than leaking a code off-host.

## Known gaps

These were found while validating the approach. None blocks the migration; all should be recorded in the tracking issue.

**Feature flags do not load.** `getFeatureFlagsRuntimeClient()` polls `GET /sdk/feature-flags`, which the emulator does not implement — it serves `/feature-flags` instead. The runtime client's `waitUntilReady` therefore rejects, and `src/lib/flags/workos-adapter.ts` catches it and returns `false`, so every flag evaluates as off. That is a safe default but it means flag-on paths cannot be exercised. Options are to pass `bootstrapFlags` when constructing the runtime client in e2e, or to contribute a `/sdk/feature-flags` route upstream. The upstream route is small and benefits every emulator consumer.

**Webhook timestamps are seconds, and the SDK verifier expects milliseconds.** The emulator signs `t=` with `Math.floor(Date.now() / 1000)`, while `SignatureProvider.verifyHeader` in `@workos-inc/node@10.9.0` compares that value against `Date.now()` in milliseconds. A seconds-precision timestamp can never satisfy it at any reasonable tolerance. Our own webhook route is unaffected because `verifyWorkosWebhookSignature` in `workos-webhook.route.ts` multiplies the timestamp by 1000 before comparing, and the HMAC itself is correct — the SDK accepts the same signature once the freshness check is disabled. So webhook e2e works today, but `workos.webhooks.constructEvent` cannot be used against the emulator. This is an upstream one-line fix worth reporting.

**Error hooks interact with SDK retries.** `@workos-inc/node` retries 5xx responses, so a hook declared with `count: 1` is consumed by the first attempt and the retry succeeds. Declare failure hooks without a `count` (or above the retry budget) and clear them explicitly in teardown.

**Emulator state persists for the process lifetime**, and `reset()` cannot restore authentication events. Prefer unique identities per test and a fresh process per suite, as described under isolation.

**No TLS.** The emulator speaks plain HTTP, which is why `WORKOS_API_HTTPS=false` is required. Anything asserting on secure-cookie behaviour needs a proxy in front or should stay a unit test.

## Verification

The mechanism was validated against `workos-emulate` 0.5.0 before writing this design, using the exact dependency versions the app resolves — `@workos-inc/node@10.9.0` and the `jose@5.10.0` that `@workos-inc/authkit-nextjs@4.3.1` verifies tokens with — and reproducing AuthKit's own construction of the SDK client and JWKS set. Thirty-two checks pass, covering: SDK and JWKS URL resolution to the emulator; organization, user, and membership CRUD including `autoPagination`; the interactive login page and its hidden-field round-trip; form submission redirecting to the callback with `code` and `state`; code exchange returning an org-scoped session; RS256 verification of the access token against the emulator's JWKS; `org_id`, `role`, `permissions`, and `sid` claims; refresh-token rotation; pinned seed ids surviving into the session; rejection of unknown users and non-local redirect URIs; typed 422 and 500 responses via error hooks; `organization_selection_required` and the organization-selection grant; and signed webhook delivery accepted by our route's verifier. PKCE was validated separately, including rejection of an incorrect `code_verifier`.

Ongoing verification follows the phases. Phase 1 is covered by `vp test` and `vp check`. Phase 3 is verified by each converted flow passing against the emulator. Phase 4 is verified by `vp test`, `vp check`, and `vp run build` after deletion, plus a grep confirming no `E2E_AUTH_MODE`, `isFixtureAuthEnabled`, or `/api/e2e` references remain. Phase 5 is verified by a green local `vp run test:e2e` against the emulator; CI wiring waits until the suite is stable.

Keep emulator credentials in `.env.e2e`, not `.env`. Placeholder WorkOS keys in `.env` keep `vp test` on the fixture-scoped path; pointing `.env` at the emulator makes reconcile treat WorkOS as live and can revoke fixture memberships.

## Open decisions

Whether to contribute the `/sdk/feature-flags` route and the webhook timestamp fix upstream, or to carry local workarounds. Upstream is preferable for both — they are small and neither is specific to us.

When CI is added later, whether the e2e job blocks merges or runs advisory-only at first. Keep it local until the suite is stable.
