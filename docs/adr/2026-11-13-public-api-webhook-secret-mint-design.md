# Public API webhook signing-secret mint

**Status:** Accepted

## Context

Job webhook endpoints in `apps/public-api` need a Standard Webhooks `whsec_` secret stored as the web app's AES-256-GCM JSON (`algorithm`, `keyVersion`, `ciphertext`, `iv`, `authTag`). The delivery cron decrypts that blob with `PROVIDER_CREDENTIALS_MASTER_KEY`. The public API should not hold that key.

go-svc already mints TMS access tokens from the web app over `X-Go-Svc-Research-Token` (HMAC-SHA256 of `go-svc-research` keyed by `WORKOS_COOKIE_PASSWORD`). Public-api must not import `apps/go-svc/internal/*`.

## Decision

Keep generate-and-encrypt in the web app. Add `POST /api/internal/webhooks/signing-secret` for public-api.

The route:

- requires the existing go-svc service token, not a user session;
- takes no body;
- returns `{ secret, encrypted }`;
- never decrypts stored secrets.

Session create and rotate reuse the same `mintWebhookSigningSecret()` helper.

public-api copies a small HTTP client. `HYPERLOCALISE_WEB_INTERNAL_URL` (else `HYPERLOCALISE_PUBLIC_APP_URL`) plus `WORKOS_COOKIE_PASSWORD` configure it. Missing mint is not a startup failure; create and rotate return `503 webhook_secret_encryption_failed`.

Compromised public-api can mint or rotate a secret, but cannot decrypt secrets already stored.

## Alternatives

Public-api generating plaintext and asking the web app only to encrypt would still keep the master key out of public-api, but "mint" would split across two services.

Proxying the whole create through Hono would drop the public-api CRUD already shipped.

A new public-api service token would duplicate the go-svc HMAC already shared with the web app.

## Consequences

- Webhook create and rotate depend on the web app being reachable.
- public-api runtime needs the cookie password and a web origin, not the credentials master key.
- Test-send stays in the web app.
