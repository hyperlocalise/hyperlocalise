# go-svc

Go container service for CPU-heavy work that runs beside the Next.js app on Vercel. Today it powers CAT segment validation (format, length, and Hunspell spelling checks) and Domains research through DataForSEO (`internal/dataforseo`). Google Search Console will call `internal/gsc`.

Public routes are served at `/api/go-svc/...` in production (Vercel rewrite) and at `/v1/...` or `/ofrep/...` when called directly via the `GO_SVC_URL` binding.

## Environment variables

### Required

| Variable | Description |
|----------|-------------|
| `WORKOS_COOKIE_PASSWORD` | Secret used to seal and verify WorkOS session cookies. Must match the web app value. At least 32 characters. |

### Required for session refresh

These must match the web app's WorkOS configuration. Without them, valid sessions that need a token refresh will be rejected.

| Variable | Description |
|----------|-------------|
| `WORKOS_API_KEY` | WorkOS API key (`sk_test_...` or `sk_live_...`). |
| `WORKOS_CLIENT_ID` | WorkOS client ID (`client_...`). |

### Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8080` | HTTP listen port. |
| `HUNSPELL_DICT_DIR` | `/usr/share/hunspell` | Directory containing Hunspell `.aff` / `.dic` files. The container image bundles dictionaries at the default path. |
| `WORKOS_COOKIE_DOMAIN` | _(unset)_ | Cookie `Domain` attribute when setting a refreshed session cookie. Leave unset for host-only cookies. |
| `DATABASE_URL` | _(unset)_ | Postgres URL shared with the web app. Required to serve Hyperlab OFREP evaluate routes. |

### DataForSEO (Domains research)

Used by `internal/dataforseo` for keyword research, live SERPs, and rank tracking. Required for `/v1/domains/research/*`. Not required for segment validation.

| Variable | Description |
|----------|-------------|
| `DATAFORSEO_API_KEY` | Base64-encoded `email:api_password` from [DataForSEO API Access](https://app.dataforseo.com/api-access). This is **not** the short dashboard API key — use the **Base64** credentials DataForSEO emails you, or generate one with:<br><br>`echo -n 'your@email.com:your_api_password' \| base64` |

Example Go usage:

```go
client, err := dataforseo.NewClient(dataforseo.Config{
    APIKey: os.Getenv("DATAFORSEO_API_KEY"),
})
```

Do **not** set separate `DATAFORSEO_LOGIN` / `DATAFORSEO_PASSWORD` env vars. Pass the single base64 API key.

### Google Search Console (upcoming SEO features)

Used by `internal/gsc` for search performance and URL inspection. GSC is OAuth-based — there is no API key env var for go-svc. Users connect Search Console in the web app; go-svc receives a minted access token (or `oauth2.TokenSource`) per request.

The web app needs these OAuth variables to enable the connection flow:

| Variable | Description |
|----------|-------------|
| `GOOGLE_CLIENT_ID` | Google OAuth client ID for the Search Console connection. |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret. |

Example Go usage once a token is available:

```go
client, err := gsc.NewClient(gsc.Config{
    TokenSource: oauth2.StaticTokenSource(&oauth2.Token{
        AccessToken: accessToken,
    }),
})
```

GSC API calls are free and do not consume DataForSEO credits.

### Machine translation client

`internal/mt` defines the shared machine-translation client contract for
go-svc, including the `Engine` interface, request and response types,
configuration, and typed errors. Vendor MT integrations use this package as
library clients; it does not expose an HTTP route.

## Local development

From the repository root:

```bash
# Build check (requires libhunspell-dev for spelling support)
make check-build-go-svc-cgo

# Run locally
export WORKOS_COOKIE_PASSWORD='this-is-a-test-cookie-password-at-least-32-characters'
export WORKOS_API_KEY='sk_test_...'
export WORKOS_CLIENT_ID='client_...'
go run ./apps/go-svc
```

Health check:

```bash
curl http://localhost:8080/health
# {"status":"ok"}
```

The web app reaches go-svc through `GO_SVC_URL` (set automatically on Vercel via the service binding). Domains research is **not** available on the public `/api/go-svc` rewrite: handlers require a service token derived from `WORKOS_COOKIE_PASSWORD` (`X-Go-Svc-Research-Token`) in addition to the WorkOS session cookie. The Next.js org API computes and sends that header server-side.

## Docker / Vercel

Production builds use `Dockerfile.vercel` at the repository root. The image:

- Compiles with `cgo_hunspell` for spelling checks
- Bundles Hunspell dictionaries under `/usr/share/hunspell`
- Listens on `PORT` (default `8080`)

Set the required WorkOS variables in the Vercel `go_svc` service environment. Use the same `WORKOS_COOKIE_PASSWORD` as `hyperlocalise-web`.

## API

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/health` | No | Liveness probe |
| `POST` | `/v1/validate/segment` | WorkOS session cookie | Validate a CAT segment (format, length, spelling) |
| `POST` | `/v1/domains/research/keywords` | WorkOS session cookie + `X-Go-Svc-Research-Token` | Expand a seed keyword + market through DataForSEO Labs |
| `POST` | `/v1/domains/research/serp` | WorkOS session cookie + `X-Go-Svc-Research-Token` | Fetch a live organic SERP snapshot |
| `POST` | `/v1/domains/research/rank-check` | WorkOS session cookie + `X-Go-Svc-Research-Token` | Live rank check for one keyword against a hostname |
| `POST` | `/v1/domains/research/rank-check/batch` | WorkOS session cookie + `X-Go-Svc-Research-Token` | Live rank check for up to 20 keywords |
| `POST` | `/ofrep/v1/evaluate/flags/{key}` | Publishable `hlk_...` key | Evaluate one Hyperlab flag (OFREP) |
| `POST` | `/ofrep/v1/evaluate/flags` | Publishable `hlk_...` key | Evaluate all Hyperlab flags (OFREP bulk) |

Authenticated CAT requests must include the `wos-session` cookie from a signed-in Hyperlocalise user. Research routes also require `X-Go-Svc-Research-Token`, a SHA-256 hex digest of `go-svc-research:` plus `WORKOS_COOKIE_PASSWORD`. The browser cannot mint that header; only the web app should call these endpoints via `GO_SVC_URL`.
