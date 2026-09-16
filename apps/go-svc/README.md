# go-svc

Go backend service that runs beside the Next.js app on Vercel. It owns spellcheck dictionary CRUD and powers CAT segment validation (format, length, and Hunspell spelling checks) and Domains research through DataForSEO (`internal/dataforseo`). Google Search Console calls `internal/gsc`.

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
| `DATABASE_URL` | _(unset)_ | Postgres URL shared with the web app. Required for dictionary routes and Hyperlab OFREP evaluate routes. |

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

### Google Search Console

Used by `internal/gsc` for search performance and URL inspection. GSC is OAuth-based — there is no API key env var for go-svc. Users connect Search Console through the WorkOS `google-search-console` pipe on the Integrations page; go-svc receives a minted access token (or `oauth2.TokenSource`) per request.

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

The web app reaches go-svc through `GO_SVC_URL` (set automatically on Vercel via the service binding). Domains research is **not** available on the public `/api/go-svc` rewrite: handlers require a service token (`X-Go-Svc-Research-Token`) in addition to the WorkOS session cookie. The Next.js org API computes and sends that header server-side.

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
| `POST` | `/v1/domains/research/market-visibility` | WorkOS session cookie + `X-Go-Svc-Research-Token` | Check one domain market through DataForSEO Labs; one market per request |
| `POST` | `/v1/domains/research/serp` | WorkOS session cookie + `X-Go-Svc-Research-Token` | Fetch a live organic SERP snapshot |
| `POST` | `/v1/domains/research/rank-check` | WorkOS session cookie + `X-Go-Svc-Research-Token` | Live rank check for one keyword against a hostname |
| `POST` | `/v1/domains/research/rank-check/batch` | WorkOS session cookie + `X-Go-Svc-Research-Token` | Live rank check for up to 20 keywords |
| `POST` | `/v1/domains/gsc/sites` | WorkOS session cookie + `X-Go-Svc-Research-Token` | List verified Search Console properties for a minted access token |
| `POST` | `/v1/domains/gsc/performance` | WorkOS session cookie + `X-Go-Svc-Research-Token` | Query Search Analytics clicks, impressions, CTR, and position |
| `POST` | `/v1/domains/gsc/inspect` | WorkOS session cookie + `X-Go-Svc-Research-Token` | Inspect one URL against a Search Console property |
| `POST` | `/ofrep/v1/evaluate/flags/{key}` | Publishable `hlk_...` key | Evaluate one Hyperlab flag (OFREP) |
| `POST` | `/ofrep/v1/evaluate/flags` | Publishable `hlk_...` key | Evaluate all Hyperlab flags (OFREP bulk) |

Authenticated CAT requests must include the `wos-session` cookie from a signed-in Hyperlocalise user. Research routes also require `X-Go-Svc-Research-Token`, an HMAC-SHA256 hex digest of `go-svc-research` keyed by `WORKOS_COOKIE_PASSWORD`. The browser cannot mint that header; only the web app should call these endpoints via `GO_SVC_URL`.

## Object storage and guideline search

The optional storage and guideline routes reuse `serverCallAuthMiddleware` in
`auth.go`: the existing `wos-session` cookie plus the existing Hono-to-Go server-call
proof. The `X-Go-Svc-Research-Token` header and its `go-svc-research` HMAC message
remain unchanged for compatibility with deployed clients. No new authentication
secret is required. Hono must authorize each file, project, and organization before
forwarding a request. These routes are not browser-facing resource APIs. Worker
authentication is not added by this change.

Storage uses explicit environment variables for each named location. This example
enables S3 and R2 together:

```dotenv
# Comma-separated location IDs. This is a list, not JSON.
OBJECT_STORAGE_LOCATIONS=s3-files,r2-bundles
OBJECT_STORAGE_DEFAULT_LOCATION=s3-files

OBJECT_STORAGE_S3_FILES_PROVIDER=s3
OBJECT_STORAGE_S3_FILES_BUCKET=hyperlocalise-files
OBJECT_STORAGE_S3_FILES_REGION=ap-southeast-2
# Optional: omit both to use the AWS SDK credential chain (for example IAM roles).
# OBJECT_STORAGE_S3_FILES_ACCESS_KEY_ID=...
# OBJECT_STORAGE_S3_FILES_SECRET_ACCESS_KEY=...
# OBJECT_STORAGE_S3_FILES_SESSION_TOKEN=...

OBJECT_STORAGE_R2_BUNDLES_PROVIDER=r2
OBJECT_STORAGE_R2_BUNDLES_BUCKET=hyperlocalise-bundles
OBJECT_STORAGE_R2_BUNDLES_ENDPOINT=https://YOUR_ACCOUNT_ID.r2.cloudflarestorage.com
OBJECT_STORAGE_R2_BUNDLES_ACCESS_KEY_ID=YOUR_R2_ACCESS_KEY_ID
OBJECT_STORAGE_R2_BUNDLES_SECRET_ACCESS_KEY=YOUR_R2_SECRET_ACCESS_KEY
```

Set these variables in the Go service's deployment settings or export them in your
shell before starting `go-svc`. The Go executable does not load a `.env` file itself.
Store credential values as deployment secrets.

Each location ID maps to `OBJECT_STORAGE_<ID>_`: uppercase the ID and replace
hyphens with underscores. For example, `r2-bundles` maps to
`OBJECT_STORAGE_R2_BUNDLES_`. IDs start with a lowercase letter and use lowercase
letters, digits and single separating hyphens (up to 64 characters). Duplicate IDs
and incomplete configurations fail at startup.

| Variable suffix | Meaning |
| --- | --- |
| `PROVIDER` | Required: `s3` or `r2` |
| `BUCKET` | Required bucket name |
| `REGION` | S3 region; may also come from the AWS SDK configuration. R2 always uses `auto` |
| `ENDPOINT` | Required HTTPS S3 endpoint for R2, including jurisdiction-specific endpoints when applicable. Optional override for S3 |
| `ACCESS_KEY_ID` / `SECRET_ACCESS_KEY` | Required together for R2; optional together for S3 when using its SDK credential chain |
| `SESSION_TOKEN` | Optional session token with location-specific access keys |
| `USE_PATH_STYLE` | Optional `true` or `false`; defaults to `false` |

Add more locations by listing their IDs and adding their corresponding variables;
multiple locations can use the same provider. Leave both `OBJECT_STORAGE_LOCATIONS`
and `OBJECT_STORAGE_DEFAULT_LOCATION` unset to disable object storage.

The default controls new uploads through `PUT /v1/storage/object`. Reads, deletes,
and signed requests use the recorded `locationId`. Bundle publishers select their
location explicitly. Do not repoint an existing location ID at another bucket;
create a new location instead. The TypeScript Vercel adapter remains unchanged in
this rollout. The previous JSON value for `OBJECT_STORAGE_LOCATIONS` is replaced
by the comma-separated list and individual variables above.

| Route | Input | Result |
| --- | --- | --- |
| `PUT /v1/storage/object` | Bytes, Content-Length, Content-Type, X-Object-Key | `{ref, info}` from the default location; conditional creation; 32 MiB limit |
| `POST /v1/storage/read` | `{locationId, key}` | Streamed bytes |
| `POST /v1/storage/stat` | `{locationId, key}` | Object metadata |
| `POST /v1/storage/delete` | `{locationId, key}` | Idempotent deletion |
| `POST /v1/storage/sign-upload` | `{ref, contentType, expiresInSeconds}` | Signed conditional PUT request |
| `POST /v1/storage/sign-download` | `{ref, expiresInSeconds}` | Signed GET request |

Sign requests expire in 1–3600 seconds. Persist references rather than signed
URLs. Verify direct uploads before creating their final file records. The
`internal/distribution` package can publish verified immutable bundles with a
manifest written last; release-channel APIs and CDN setup are future work.

To enable guideline search, set `DATABASE_URL`, `TURBOPUFFER_API_KEY`,
`TURBOPUFFER_REGION`, and a deployment-specific `TURBOPUFFER_GUIDELINES_PREFIX`.
The prefix keeps development/staging/production indexes separate. The PostgreSQL
source reads the existing workspace/project guideline tables without a migration.

- `POST /v1/guidelines/sync`: `{organizationId, projectId?, locale?}`.
  Reindexes current canonical revisions. Call explicitly during adoption/rebuilds.
- `POST /v1/guidelines/search`: `{scope: {organizationId, projectId?, locale?}, query, limit}`.
  Limit is 1–32. Returns mandatory canonical documents, verified passages, and
  `searchAvailable`. Search is BM25 initially; indexing and retrieval are separate.

The app's existing lexical guideline selection is unchanged. Transactional outbox
integration and deletion-event delivery remain application adoption work. An index
must never be the only retained copy of guideline content.

## Teams

The browser calls `/api/go-svc/v1/orgs/{organizationSlug}/teams` for team
CRUD, membership, and the org member directory. The former Hono team handlers are
removed. Go uses the same session cookie, WorkOS membership verification, and
`DATABASE_URL` as dictionary routes. Admins and localization managers may create,
update, and delete teams; team managers may add or remove members without org
admin rights.

| Method | Path | Operation |
|--------|------|-----------|
| GET, POST | `/teams` | List or create teams |
| GET | `/teams/member-directory` | List org members for team invites |
| GET, PATCH, DELETE | `/teams/{teamId}` | Read, update, or delete a team |
| POST | `/teams/{teamId}/members` | Add or update a team member |
| DELETE | `/teams/{teamId}/members/{workosUserId}` | Remove a team member |

## Spellcheck dictionaries

The browser calls `/api/go-svc/v1/orgs/{organizationSlug}/dictionaries`
and project dictionary routes directly. The former web dictionary handlers are
removed. Go owns reads, mutations, word imports/exports, attachment ordering,
and resolved accepted words. Drizzle remains the schema and migration owner.
PostgreSQL tables are `spellcheck_word_libraries`, `spellcheck_word_library_words`,
and `project_spellcheck_word_libraries` (not the legacy `spellcheck_dictionaries`
names from migration `0124_premium_cerise`, which production often never applied).

Dictionary routes use the existing `wos-session` cookie. Configure
`WORKOS_COOKIE_PASSWORD`, `WORKOS_API_KEY`, and `DATABASE_URL` in go-svc.
Go resolves the local user and active organization, excludes pending/replacing
memberships, and verifies the membership and current role with WorkOS on every
request. Failed membership lookups fail closed with a 503. Admins and localization
managers may write; the other known member roles may read. Project routes enforce
local organization and team visibility. Responses disable caching, and browser
mutations reject cross-origin requests.

All paths below are relative to `/v1/orgs/{organizationSlug}`:

| Method | Path | Operation |
|--------|------|-----------|
| GET, POST | `/dictionaries` | List or create libraries |
| GET, PATCH, DELETE | `/dictionaries/{dictionaryId}` | Read, update, or delete a library |
| GET, POST | `/dictionaries/{dictionaryId}/words` | List or add words |
| DELETE | `/dictionaries/{dictionaryId}/words/{wordId}` | Delete a word |
| POST | `/dictionaries/{dictionaryId}/words/import` | Import newline-delimited words |
| GET | `/dictionaries/{dictionaryId}/words/export` | Export words for a locale |
| GET, POST | `/dictionaries/{dictionaryId}/projects` | List or attach projects |
| DELETE | `/dictionaries/{dictionaryId}/projects/{projectId}` | Detach a project |
| GET, POST | `/projects/{projectId}/dictionaries` | List or attach dictionaries |
| DELETE | `/projects/{projectId}/dictionaries/{dictionaryId}` | Detach a dictionary |
| GET | `/projects/{projectId}/dictionaries/resolved` | Resolve active dictionaries for a locale |

Word mutations serialize with PostgreSQL advisory locks and commit the word change
and version increment together. Imports deduplicate normalized words, insert only
novel words within the 20,000-word library limit, and retain the existing import
response envelope. Resolved lists preserve priority, creation-time and dictionary-ID
tie breaking, with 5,000-word and 256 KiB JSON limits.

### Dictionary tests and benchmarks

These commands do not require Docker or PostgreSQL:

```bash
go test -race ./apps/go-svc -run '^TestDictionary'
go test ./apps/go-svc -run '^$' -bench '^BenchmarkDictionary' -benchmem
```

Benchmarks measure normalization, duplicate-heavy import parsing, and resolved-word
merging at 100, 5,000, and 20,000 unique words. They exclude database/network latency.

To additionally exercise real SQL, foreign-key cascades, and concurrent capacity
limits, set `DICTIONARY_TEST_DATABASE_URL` to an explicit test PostgreSQL database
and run `go test -race ./apps/go-svc -run '^TestDictionaryPostgres'`. The suite creates
and removes a unique schema per test. Without that variable, these integration
tests are skipped; it never starts a database or reads `DATABASE_URL` implicitly.
