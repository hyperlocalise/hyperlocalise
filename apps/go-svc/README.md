# go-svc

Go backend service that runs beside the Next.js app on Vercel. It owns spellcheck dictionary CRUD, native glossary and translation-memory CRUD, project issue-sheet (core + social), org activity-log reads, native CAT editor APIs (parallel to Hono), and powers CAT segment validation (format, length, and Hunspell spelling checks) and Domains lifecycle management and research through DataForSEO (`internal/dataforseo`). Google Search Console calls `internal/gsc`. Autumn entitlement checks and usage tracking live in `internal/autumn`.

Public browser routes are served at `https://api.hyperlocalise.com/v1/...` from `GoSvcClient` callers (Bearer token, CORS). The Next.js server calls `/v1/...` or `/ofrep/...` at the same origin via `GO_SVC_URL` (typically `https://api.hyperlocalise.com` in production).

## Environment variables

### Required

| Variable | Description |
|----------|-------------|
| `WORKOS_COOKIE_PASSWORD` | Secret used to seal and verify WorkOS session cookies. Must match the web app value. At least 32 characters. |

### Required for WorkOS session refresh and access tokens

These must match the web app's WorkOS configuration. Without them, valid sessions that need a token refresh will be rejected.

| Variable | Description |
|----------|-------------|
| `WORKOS_API_KEY` | WorkOS API key (`sk_test_...` or `sk_live_...`). |
| `WORKOS_CLIENT_ID` | WorkOS client ID (`client_...`). Required to verify session access tokens (`aud`) and to refresh sealed sessions. |

### Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8080` | HTTP listen port. |
| `HUNSPELL_DICT_DIR` | `/usr/share/hunspell` | Directory containing Hunspell `.aff` / `.dic` files. The container image bundles dictionaries at the default path. |
| `WORKOS_COOKIE_DOMAIN` | _(unset)_ | Cookie `Domain` attribute when setting a refreshed session cookie. Leave unset for host-only cookies. |
| `WORKOS_API_HOSTNAME` | `api.workos.com` | WorkOS API host used for session refresh and JWKS (`/sso/jwks/{client_id}`). Point at the WorkOS emulator in local e2e. |
| `WORKOS_API_HTTPS` | `true` | Set `false` for the local emulator. |
| `WORKOS_API_PORT` | _(unset)_ | Optional port for a non-default WorkOS API host. |
| `DATABASE_URL` | _(unset)_ | Postgres URL shared with the web app. Required for dictionary, glossary, translation-memory, team, member, issue-sheet, and Hyperlab OFREP evaluate routes. |
| `VALKEY_ENDPOINT` | _(unset)_ | Valkey hostname. When set without `VALKEY_URL`, go-svc builds a URL from this endpoint, `VALKEY_PORT`, and `VALKEY_TLS`. |
| `VALKEY_PORT` | `6379` | Valkey port used with `VALKEY_ENDPOINT`. |
| `VALKEY_TLS` | _(unset)_ | Set to `required`, `true`, or `enabled` to use `rediss://` with `VALKEY_ENDPOINT`; other values use `redis://`. |
| `VALKEY_URL` | _(unset)_ | Explicit Valkey/Redis URL (`redis://`, `rediss://`, `valkey://`, `valkeys://`, or `unix://`). Takes precedence over `VALKEY_ENDPOINT`. When configured, go-svc connects at startup and fails if ping does not succeed. |
| `VALKEY_ADDR` | _(unset)_ | Host:port used when `VALKEY_URL` is empty. Comma-separated addresses are allowed for cluster setups. |
| `VALKEY_USERNAME` | _(unset)_ | Optional username overlaid on `VALKEY_URL` or used with `VALKEY_ADDR`. |
| `VALKEY_PASSWORD` | _(unset)_ | Optional password overlaid on `VALKEY_URL` or used with `VALKEY_ADDR`. |
| `AUTUMN_API_KEY` | _(unset)_ | Autumn secret key. Required for issue-sheet routes (`queries-board` gate). Fail-closed when unset. |
| `GA_MEASUREMENT_PROTOCOL_API_SECRET` | _(unset)_ | GA4 Measurement Protocol secret. When set, new seat creation emits `seat_added` after the membership transaction commits. No-ops when unset. |

Example Go usage:

```go
client, err := valkey.NewClient(valkey.Config{
    URL: os.Getenv("VALKEY_URL"),
})
if err != nil {
    return err
}
defer client.Close()

raw := client.Inner()
err = raw.Do(ctx, raw.B().Set().Key("k").Value("v").Build()).Error()
```

Callers that need commands beyond `Ping` should use `Inner()` and the valkey-go command builder. Do not reuse a built command across `Do` calls unless it is `Pin()`ned.

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

### Datadog tracing

go-svc is instrumented at compile time with Datadog Orchestrion. The build rewrites supported Go libraries to create Datadog spans, while the service's route-safe HTTP middleware remains in place for inbound request spans. The Datadog tracer runtime sends spans directly to the Datadog Agent over port `8126`; this is separate from the optional OpenTelemetry/OTLP receiver exposed by the ECS sidecar.

| Variable | Default | Description |
|----------|---------|-------------|
| `DD_TRACE_AGENT_URL` | `http://127.0.0.1:8126` | Datadog Agent trace intake URL. In ECS this points to the Datadog sidecar. |
| `DD_TRACE_ENABLED` | `true` | Set to `false` to disable Datadog tracing. |
| `DD_SERVICE` | `go-svc` | Datadog service name. |
| `DD_ENV` | _(unset)_ | Datadog deployment environment. |
| `DD_VERSION` | _(unset)_ | Datadog release/image version. The ECS deploy action sets this to the immutable image tag. |

`service.version` and `deployment.environment.name` are represented in Datadog by `DD_VERSION` and `DD_ENV`:

| Resource attribute | Source | Behavior when unset |
|---|---|---|
| `service.name` | `DD_SERVICE` | `go-svc` |
| `service.version` | `DD_VERSION` | Attribute omitted (not sent as `"unknown"`) |
| `deployment.environment.name` | `DD_ENV` | Attribute omitted (not sent as `"unknown"`) |

**Deployment prerequisite**: the ECS task definition must set `DD_VERSION` to the exact immutable image tag and `DD_ENV` to the deployment environment. The ECS deployment workflow updates `DD_VERSION` whenever it replaces the application image.

**Datadog Agent setup**: the ECS task definition must expose the Agent trace intake endpoint to the application container. In the current ECS task this is `http://127.0.0.1:8126`. The application does not need `OTEL_EXPORTER_OTLP_ENDPOINT` or `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` for this tracing path.

What's traced:

- Every inbound request except `GET /health` (and its `/api/go-svc/health` alias), which is excluded entirely rather than sampled down.
- Incoming `traceparent`/`tracestate` (W3C Trace Context) and `baggage` headers are continued, not replaced with a new trace.
- Span name and the `http.route` attribute use the matched `net/http.ServeMux` route template (e.g. `/v1/orgs/{organizationSlug}/dictionaries`), never the concrete organization slug, project ID, or other request-supplied path segment. Requests that match no route are recorded as `unmatched` rather than the raw path.
- `http.request.method`, `http.route`, and `http.response.status_code` are recorded; responses with a 5xx status mark the span as an error.

What's never recorded: request/response bodies, the `Authorization` header, cookies, or any other customer-supplied content. The middleware only ever reads the method, matched route, and response status.

### Datadog log correlation

Every log record written while a request span is active carries five top-level string attributes, so a Datadog trace can be navigated to its logs and back:

| Field | Source | Present when |
|---|---|---|
| `dd.trace_id` | Active span's `SpanContext.TraceID()` (32-char lowercase hex) | A valid span is active in the logging call's context |
| `dd.span_id` | Active span's `SpanContext.SpanID()` (16-char lowercase hex) | Same as above |
| `dd.service` | `DD_SERVICE`, falling back to `"go-svc"` — the same value as `service.name` above | Always |
| `dd.env` | `DD_ENV` — the same source as `deployment.environment.name` above | `DD_ENV` is set |
| `dd.version` | `DD_VERSION` — the same source as `service.version` above | `DD_VERSION` is set |

Enrichment happens in one `slog.Handler` wrapper (`telemetry_log_handler.go`) installed as the default logger in `main.go`. It reads `dd.service`/`dd.env`/`dd.version` from the same `loadServiceResourceInfo()` helper `initTelemetry` uses for the trace Resource (`telemetry.go`), so the log fields and the trace's resource attributes can never diverge. `dd.trace_id`/`dd.span_id` are added only when the log call's `context.Context` carries a valid span — startup/background logs never get fabricated IDs, and the existing JSON shape, redaction-by-omission behavior, and bounded-route (`requestLogPath`) handling are unchanged; the handler only adds fields, never removes or rewrites existing ones.

IDs are emitted using Datadog's native trace context and are available to both Orchestrion-created spans and the route middleware through the Datadog/OpenTelemetry bridge. See [`DATADOG.md`](./DATADOG.md) for the Datadog-side setup and post-deploy verification checklist.

## Local development

From the repository root:

```bash
# Build check (requires libhunspell-dev for spelling support)
make check-build-go-svc-cgo

# Run locally
export WORKOS_COOKIE_PASSWORD='this-is-a-test-cookie-password-at-least-32-characters'
export WORKOS_API_KEY='sk_test_...'
export WORKOS_CLIENT_ID='client_...'
# Optional: publishes glossary activity events and checks the queue in /health.
export ACTIVITY_LOG_QUEUE_URL='https://sqs.us-east-1.amazonaws.com/.../activity-log'
# Optional: enables asynchronous glossary import/export publishing and checks the queue in /health.
export GLOSSARY_INTERCHANGE_QUEUE_URL='https://sqs.us-east-1.amazonaws.com/.../glossary-interchange'
go run ./apps/go-svc
```

Health check:

```bash
curl http://localhost:8080/health
# {"status":"ok","activity_log":{"status":"disabled"},"glossary_interchange":{"status":"disabled"},"valkey":{"status":"disabled"},"postgres":{"status":"disabled"}}
```

When configured, Valkey and PostgreSQL health objects report `status` as
`ok` or `unavailable` and include the small probe's `roundtrip_ms`. When a
dependency is not configured, its status is `disabled` and no timing is
reported. The endpoint remains an HTTP 200 liveness check.

The web app reaches go-svc through `GO_SVC_URL`. Domains research handlers require a service token (`X-Go-Svc-Research-Token`) in addition to the WorkOS session cookie. The Next.js server computes and sends that header. In production, ECS injects queue URLs from infrastructure outputs; the service does not resolve SSM parameters itself. A configured queue publisher reports `ok` or `unavailable` in `/health`; a missing queue URL is reported as `disabled`.

Application deploys use the infra-owned task-definition ARN in
`/hyperlocalise/prod/ecs/go-svc/task_definition_arn` as their base revision.
This preserves every infra-managed environment variable, secret, sidecar, and
resource setting while replacing only the application image and release
metadata. Do not add production environment variables only to a live ECS task:
add them through OpenTofu so the handoff revision contains them. If an infra
apply changes the handoff during an application deploy, the deploy stops with
the two observed revisions; rerun it after the infra apply settles.

## Docker / ECS

Production ECS builds use `apps/go-svc/Dockerfile.ecs`. The image:

- Compiles with `cgo_hunspell` for spelling checks
- Bundles Hunspell dictionaries under `/usr/share/hunspell`
- Listens on `PORT` (default `8080`)

Set the required WorkOS variables in the ECS task's runtime secret. Use the same `WORKOS_COOKIE_PASSWORD` as `hyperlocalise-web`.

For tracing, the ECS task definition sets `DD_TRACE_AGENT_URL`, `DD_TRACE_ENABLED`, `DD_SERVICE`, `DD_VERSION`, and `DD_ENV`. The ECS deployment workflow updates `DD_VERSION` to the exact immutable image tag for each release (see [Datadog tracing](#datadog-tracing) above).

## API

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/health` | No | Liveness probe with activity-log queue, Valkey, and PostgreSQL connectivity status and round-trip times |
| `POST` | `/v1/validate/segment` | WorkOS session cookie or Bearer access token | Validate a CAT segment (format, length, spelling) |
| `POST` | `/v1/domains/research/keywords` | WorkOS session cookie or Bearer access token + `X-Go-Svc-Research-Token` | Expand a seed keyword + market through DataForSEO Labs |
| `POST` | `/v1/domains/research/market-visibility` | WorkOS session cookie or Bearer access token + `X-Go-Svc-Research-Token` | Check one domain market through DataForSEO Labs; one market per request |
| `POST` | `/v1/domains/research/serp` | WorkOS session cookie or Bearer access token + `X-Go-Svc-Research-Token` | Fetch a live organic SERP snapshot |
| `POST` | `/v1/domains/research/rank-check` | WorkOS session cookie or Bearer access token + `X-Go-Svc-Research-Token` | Live rank check for one keyword against a hostname |
| `POST` | `/v1/domains/research/rank-check/batch` | WorkOS session cookie or Bearer access token + `X-Go-Svc-Research-Token` | Live rank check for up to 20 keywords |
| `POST` | `/v1/domains/gsc/sites` | WorkOS session cookie or Bearer access token + `X-Go-Svc-Research-Token` | List verified Search Console properties for a minted access token |
| `POST` | `/v1/domains/gsc/performance` | WorkOS session cookie or Bearer access token + `X-Go-Svc-Research-Token` | Query Search Analytics clicks, impressions, CTR, and position |
| `POST` | `/v1/domains/gsc/inspect` | WorkOS session cookie or Bearer access token + `X-Go-Svc-Research-Token` | Inspect one URL against a Search Console property |
| `POST` | `/ofrep/v1/evaluate/flags/{key}` | Publishable `hlk_...` key | Evaluate one Hyperlab flag (OFREP) |
| `POST` | `/ofrep/v1/evaluate/flags` | Publishable `hlk_...` key | Evaluate all Hyperlab flags (OFREP bulk) |

## Projects

The Go service exposes native project reads and mutations under
`/v1/orgs/{organizationSlug}/...` (typically on `https://api.hyperlocalise.com`;
the same paths also work under `/api/go-svc/...` on the web host). Go accepts
the WorkOS session access token or `wos-session` cookie and performs live
WorkOS membership verification using the existing membership cache.

Any organization member with team visibility into a project may read it.
Creating, updating, and deleting a project requires `admin`,
`localization_manager`, or `developer`. Updating the content-editor grouping
setting requires `admin` or `localization_manager` only, matching its
read-side preview.

| Method | Path | Operation |
|--------|------|-----------|
| GET | `/projects` | List accessible native projects with open job counts |
| POST | `/projects` | Create a native project (`admin`/`localization_manager`/`developer`) |
| GET | `/projects/{projectId}` | Project detail with open job count |
| PATCH | `/projects/{projectId}` | Update project settings (`admin`/`localization_manager`/`developer`) |
| DELETE | `/projects/{projectId}` | Delete a native project (`admin`/`localization_manager`/`developer`) |
| GET | `/projects/{projectId}/locale-progress` | Per-locale word/phrase translation and approval progress |
| GET | `/projects/{projectId}/open-job-count` | Open job count only |
| GET | `/projects/{projectId}/content-editor-behavior` | Identical-string grouping setting |
| PATCH | `/projects/{projectId}/content-editor-behavior` | Toggle identical-string grouping (`admin`/`localization_manager` only) |
| GET | `/projects/{projectId}/content-editor-behavior/preview` | Preview of identical-string grouping (`admin`/`localization_manager` only) |
| GET | `/projects/{projectId}/files` | Native repository files for one project |
| GET | `/workspace-files` | Native repository files across every accessible project |

**Native projects only.** Every route above filters to `projects.source = 'native'`
and returns `project_not_found` for anything else, including a materialized
`external_tms` project reached by its plain (non-`ext:`-prefixed) id. These
go-svc routes never load or decrypt provider credentials; encoded/live provider
project ids (`ext:{provider}:{id}`), connected-TMS projects, and all
provider-backed project mutation remain on Hono.

**Mutation semantics.** Creation enforces the per-organization project limit,
allocates a unique issue prefix, and creates a default native translation
memory. Settings updates preserve identifier uniqueness and guard source-locale
changes against incompatible attached glossaries. Deletion refuses to remove a
project that is the last native project attached to a team-controlled glossary.
Content-editor grouping updates increment the grouping revision only when the
value changes, use no client-supplied revision/CAS field, and publish no
activity-log event. Project creation, settings updates, and deletion publish
`project_created`, `project_settings_changed`, and `project_deleted`
respectively.

**Locale-progress word counts are approximate.** `locale-progress` uses a small,
dependency-free Go word counter. It preserves literal text from common ICU
plural/select messages, but segmentation varies by source language. Chinese,
Japanese, and Korean text is approximated per character, while Thai, Lao,
Khmer, and Myanmar text may be under-counted. As a result,
`translationProgress` and `approvalProgress` should be treated as approximate
for these source locales.

## Content editor (CAT)

Parallel native CAT API. Hono routes under `/api/orgs/{organizationSlug}/projects/{projectId}/files/detail/cat` remain the live browser path. go-svc exposes the same JSON contracts at `/api/go-svc/v1/orgs/{organizationSlug}/projects/{projectId}/files/detail/cat` for a later cutover. Auth matches dictionary routes. Native projects only; connected TMS CAT stays on Hono (`501 provider_cat_deferred`).

All paths below are relative to `/v1/orgs/{organizationSlug}/projects/{projectId}`:

| Method | Path | Operation |
|--------|------|-----------|
| GET | `/files/detail/cat/queue` | Paginated native CAT queue |
| GET | `/files/detail/cat` | Same payload as queue (`contentEditorFile`) |
| GET | `/files/detail/cat/activity-logs` | File-segment activity for a source path |
| GET | `/files/detail/cat/segments/{id}/target` | Segment translation |
| GET | `/files/detail/cat/segments/{id}/comments` | Segment comments |
| POST | `/files/detail/cat/translations` | Save draft or approved translation |
| POST, PATCH | `/files/detail/cat/translations/status` | Update translation status |
| POST | `/files/detail/cat/comments` | Add a comment |
| PATCH | `/files/detail/cat/comments/{id}/resolve` | Resolve a legacy native issue comment |
| POST | `/files/detail/cat/concordance` | Native glossary + TM lookup |
| POST | `/files/detail/cat/strings/hidden` | Hide or unhide keys |
| POST | `/files/detail/cat/strings/locked` | Lock or unlock segments |
| POST | `/files/detail/cat/segments/{id}/max-length` | Set key max length |
| PATCH | `/files/detail/cat/images/status` | Update image/video variant status |
| POST | `/files/detail/cat/segments/{id}/treat-as-image` | Toggle image-URL content kind |
| POST | `/files/detail/cat/segments/{id}/treat-as-video` | Toggle video-URL content kind |
| POST | `/files/string-context` | Cached repository context only (`cachedOnly: true`) |

### Deferred CAT routes (Hono remains canonical)

These return `501` with a stable error code. Browser clients keep calling Hono.

| Method | Path | Error | Why it stays on Hono |
|--------|------|-------|----------------------|
| POST | `/files/detail/cat/images/regenerate` | `image_regenerate_deferred` | Vercel Workflow + Blob-backed stored files |
| POST | `/files/detail/cat/images/upload` | `image_upload_deferred` | Vercel Blob file adapter |
| POST | `/files/detail/cat/recommendation` | `ai_recommendation_deferred` | Vercel AI Gateway / AI SDK |
| POST | `/files/detail/cat/visual-context` | `visual_context_deferred` | Live TMS screenshot adapters |
| POST | `/files/string-context` without `cachedOnly` | `string_context_deferred` | Vercel Workflow repository agent |
| * | Provider/TMS CAT (`projects.source != native`) | `provider_cat_deferred` | TypeScript TMS provider adapters |

Authenticated CAT requests use the same WorkOS session cookie or Bearer access token as dictionary routes. They do not need `X-Go-Svc-Research-Token`.

Authenticated requests must include either the `wos-session` cookie from a signed-in Hyperlocalise user or `Authorization: Bearer` with that session's WorkOS access-token JWT. go-svc verifies Bearer tokens against the WorkOS JWKS for `WORKOS_CLIENT_ID` (`sub` is the user, `sid` is required). Agent JWTs are not accepted. If both a cookie and a Bearer token are present, the cookie wins. Research routes also require `X-Go-Svc-Research-Token`, an HMAC-SHA256 hex digest of `go-svc-research` keyed by `WORKOS_COOKIE_PASSWORD`. The browser cannot mint that header; only the web app should call these endpoints via `GO_SVC_URL`.

Browser callers from `https://hyperlocalise.com` and `https://hyperlocalize.com` (and `www`) may call session-auth `/v1` routes on `https://api.hyperlocalise.com`. Those origins receive CORS headers; mutating requests from other origins are rejected. Same-host `/api/go-svc` rewrites still pass the origin guard. Extra origins can be listed in `GO_SVC_CORS_ORIGINS`. CORS does not allow credentials: the web `GoSvcClient` sends a Bearer token and omits cookies.

## Object storage and guideline search

The optional storage and guideline routes reuse `serverCallAuthMiddleware` in
`auth.go`: the existing `wos-session` cookie or WorkOS session Bearer token, plus the existing Hono-to-Go server-call
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
The prefix keeps development/staging/production indexes separate and must
change if the embedding model or vector size changes. Use a US region;
`google/gemini-embedding-2` inference is US-only. The PostgreSQL source reads
the existing workspace/project guideline tables without a migration.

- `POST /v1/guidelines/sync`: `{organizationId, projectId?, locale?}`.
  Reindexes current canonical revisions. Call explicitly during adoption/rebuilds.
- `POST /v1/guidelines/search`: `{scope: {organizationId, projectId?, locale?}, query, limit}`.
  Limit is 1–32. Returns mandatory canonical documents, verified passages, and
  `searchAvailable`. Search is hybrid BM25 plus native Gemini Embedding 2; indexing and retrieval are separate.

The app's existing lexical guideline selection is unchanged. Transactional outbox
integration and deletion-event delivery remain application adoption work. An index
must never be the only retained copy of guideline content.

## Activity logs

Read API for the workspace settings activity log at
`/v1/orgs/{organizationSlug}/activity-logs`. Requires `activity_logs:read` (`admin` or
`localization_manager`), WorkOS session auth, and `DATABASE_URL`.

| Method | Path | Operation |
|--------|------|-----------|
| GET | `/activity-logs` | List organization activity events |

Query parameters match Hono: `actor`, `cursor`, `eventTypes`, `limit` (1–100,
default 50), `range` (`24h` \| `7d` \| `30d` \| `all`). Response:
`{ activityLogs, actors, nextCursor }`.

## Members

The browser calls `/v1/orgs/{organizationSlug}/members` on the Go service origin
(typically `https://api.hyperlocalise.com` via `GoSvcClient`; the same paths also
work under `/api/go-svc/...` on the web host). The former Hono member handlers
are removed. Go accepts the WorkOS session access token or `wos-session` cookie,
live WorkOS membership verification, and `DATABASE_URL` as dictionary routes.
Listing requires `workspace:read`. Invites, role updates, and removals require
`members:invite` (`admin` or `localization_manager`). Localization managers
cannot assign or manage the `admin` role. New invites check Autumn `seats` when
`AUTUMN_API_KEY` is set, otherwise the local fallback of 1 seat.

| Method | Path | Operation |
|--------|------|-----------|
| GET, POST | `/members` | List members or invite a member |
| PATCH, DELETE | `/members/{workosUserId}` | Update a member role or remove a member |

Invite and pending-role updates send WorkOS invitations. Active memberships
sync role and removal through WorkOS organization memberships. Successful
mutations write `member_invited`, `member_invite_resent`, `member_role_changed`,
and `member_removed` events to `organization_activity_events`.

## Teams

The browser calls `/v1/orgs/{organizationSlug}/teams` on the Go service origin
(typically `https://api.hyperlocalise.com` via `GoSvcClient`; the same paths also
work under `/api/go-svc/...` on the web host). The former Hono team handlers are
removed. Go accepts the WorkOS session access token or `wos-session` cookie, WorkOS membership verification, and
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

The browser calls `/v1/orgs/{organizationSlug}/dictionaries` and project
dictionary routes on the Go service origin (via `GoSvcClient`). The former web
dictionary handlers are removed. Go owns reads, mutations, word imports/exports, attachment ordering,
and resolved accepted words. Drizzle remains the schema and migration owner.
PostgreSQL tables are `spellcheck_word_libraries`, `spellcheck_word_library_words`,
and `project_spellcheck_word_libraries` (not the legacy `spellcheck_dictionaries`
names from migration `0124_premium_cerise`, which production often never applied).

Dictionary routes use the existing `wos-session` cookie or a WorkOS session
access token. Configure `WORKOS_COOKIE_PASSWORD`, `WORKOS_API_KEY`,
`WORKOS_CLIENT_ID`, and `DATABASE_URL` in go-svc.
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

### Tests

HTTP, SQL, and cache suites share `internal/testenv`. That harness seeds a unique
org/user/membership (and optional project) into the same Drizzle-migrated Postgres
schema the web app uses, then talks to live Valkey. Cleanup deletes the seeded org
(cascades) and user.

Required for integration tests:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Postgres URL after `vp run db:migrate` from `apps/hyperlocalise-web`. |
| `VALKEY_URL` | Valkey/Redis URL (`redis://127.0.0.1:6379` locally). |
| `GO_SVC_INTEGRATION` | Set to `1` in CI / `make test-go-svc` so missing deps fail instead of skip. |

Local loop with Compose:

```bash
docker compose up -d
(cd apps/hyperlocalise-web && vp run db:migrate)
export DATABASE_URL='postgres://hyperlocalise:hyperlocalise@127.0.0.1:5432/hyperlocalise?sslmode=disable'
export VALKEY_URL='redis://127.0.0.1:6379'
make test-go-svc
```

Without those URLs, `go test ./apps/go-svc/...` still runs unit tests and skips
the live suites. CI's `go-test` job starts Postgres 18 and Valkey 8, migrates,
then runs `make test-workspace` with `GO_SVC_INTEGRATION=1`.

Benchmarks stay in-process (no Docker):

```bash
go test ./apps/go-svc -run '^$' -bench '^BenchmarkDictionary' -benchmem
```

They measure normalization, duplicate-heavy import parsing, and resolved-word
merging at 100, 5,000, and 20,000 unique words.

## Glossaries and translation memories

### Knowledge memory

go-svc mirrors the workspace and project knowledge-memory APIs with direct
Postgres reads and writes. Every route requires an authenticated organization
member and the WorkOS `workspace-knowledge` feature flag. Writes require the
`workspace:update` capability; project routes also enforce organization and
team access using persisted project rows. The Go service does not resolve live
provider projects or decrypt credentials.

Updates and restores require an `If-Match` ETag from the current read (for an
empty memory, use `"0"`). A stale ETag returns `412` with the current memory and
ETag. Content is normalized and versioned in Postgres, no-op updates retain the
current revision, and revision history supports cursor pagination and restore.
Preview uses the Go retrieval implementation and applies the same payload and
selected-context size limits as the web API.

All paths below are relative to `/v1/orgs/{organizationSlug}`:

| Method | Path | Operation |
|--------|------|-----------|
| GET, PUT | `/knowledge-memory` | Read or update workspace memory |
| POST | `/knowledge-memory/preview` | Preview selected workspace context |
| GET | `/knowledge-memory/revisions` | List workspace revisions |
| GET | `/knowledge-memory/revisions/{revisionId}` | Read a revision and its predecessor |
| POST | `/knowledge-memory/revisions/{revisionId}/restore` | Restore a workspace revision |
| GET, PUT | `/projects/{projectId}/knowledge-memory` | Read or update project memory |
| POST | `/projects/{projectId}/knowledge-memory/preview` | Preview selected project context |
| GET | `/projects/{projectId}/knowledge-memory/revisions` | List project revisions |
| GET | `/projects/{projectId}/knowledge-memory/revisions/{revisionId}` | Read a project revision and its predecessor |
| POST | `/projects/{projectId}/knowledge-memory/revisions/{revisionId}/restore` | Restore a project revision |

These routes are covered by the `knowledge-memory` handler, revision, conflict,
authorization, project-access, and selection tests in `apps/go-svc`.

The browser can call `/api/go-svc/v1/orgs/{organizationSlug}/glossaries` and
`/api/go-svc/v1/orgs/{organizationSlug}/translation-memories` for native library
CRUD, project attachments, glossary concepts/terms, memory entries, and
CSV/TBX/TMX (plus glossary XLSX export) interchange. Glossary import and export
are asynchronous: GoSvc creates a run, signs the upload or download, publishes
an SQS message, and exposes the run report while the existing
`apps/glossary-interchange-lambda` worker processes it. Replace imports retain a
TBX backup reference in `glossary_import_runs`.
Auth matches dictionary routes: WorkOS session cookie, live membership verification,
and role checks (`glossaries:write` / `memories:write` for managers; translators may
contribute to team-controlled native glossaries).

Concept page cursors are opaque base64 of `updatedAt|id` (no HMAC). Treat
`nextCursor` as opaque.

### Glossary / TM tests and benchmarks

Glossary and memory HTTP tests use the same `internal/testenv` harness as
dictionaries (live Postgres + Valkey). Interchange parse/serialize benchmarks
stay in-process:

```bash
go test ./apps/go-svc -run '^$' -bench 'BenchmarkGlossary|BenchmarkMemory|BenchmarkNormalizeMemory' -benchmem
```

They cover CSV/TBX/XLSX serialize and parse, TMX/CSV memory interchange,
source-text normalization, and page-cursor decode at 100–5,000 units.

All paths below are relative to `/v1/orgs/{organizationSlug}`:

| Method | Path | Operation |
|--------|------|-----------|
| GET, POST | `/glossaries` | List or create native glossaries |
| GET, PATCH, DELETE | `/glossaries/{glossaryId}` | Read, update, or delete |
| GET, POST | `/glossaries/{glossaryId}/projects` | List or attach projects |
| DELETE | `/glossaries/{glossaryId}/projects/{projectId}` | Detach a project |
| POST | `/glossaries/{glossaryId}/export` | Queue an asynchronous CSV, TBX, or XLSX export |
| GET | `/glossaries/{glossaryId}/import-reports` | List import/export runs (`limit`, `cursor`, optional `operation`, `status`) |
| GET | `/glossaries/{glossaryId}/import-reports/{reportId}` | Import report JSON |
| GET | `/glossaries/{glossaryId}/import-reports/{reportId}/backup` | Download a completed replace-import backup |
| GET, POST | `/glossaries/{glossaryId}/concepts` | List or create concepts |
| GET | `/glossaries/{glossaryId}/concepts/page` | Cursor-paginated concepts |
| GET | `/glossaries/{glossaryId}/concepts/authors` | Distinct concept/term authors |
| GET | `/glossaries/{glossaryId}/concepts/history` | Glossary history events |
| POST | `/glossaries/{glossaryId}/concepts/import/uploads` | Create a signed import upload |
| POST | `/glossaries/{glossaryId}/concepts/import` | Finalize and queue an asynchronous CSV/TBX/XLSX import |
| GET | `/glossaries/{glossaryId}/import-reports/{reportId}/download` | Get a signed export download URL |
| GET, PATCH, DELETE | `/glossaries/{glossaryId}/concepts/{conceptId}` | Concept CRUD |
| GET, POST | `/glossaries/{glossaryId}/concepts/{conceptId}/terms` | List or create terms |
| GET | `.../concepts/{conceptId}/terms/page` | Cursor-paginated terms |
| PATCH, DELETE | `.../terms/{termId}` | Term update or delete |
| GET, POST | `/translation-memories` | List or create memories |
| GET, PATCH, DELETE | `/translation-memories/{memoryId}` | Read, update, or delete |
| GET, POST | `/translation-memories/{memoryId}/projects` | List or attach projects |
| DELETE | `/translation-memories/{memoryId}/projects/{projectId}` | Detach a project |
| GET, POST | `/translation-memories/{memoryId}/entries` | List or create entries |
| GET | `/translation-memories/{memoryId}/entries/export` | Export CSV or TMX |
| POST | `/translation-memories/{memoryId}/entries/import` | Import CSV/TMX (supports dryRun) |
| POST | `/translation-memories/{memoryId}/entries/promote-from-project` | Promote approved project translations |
| GET | `/translation-memories/{memoryId}/import-attempts` | List import attempts |
| GET | `/translation-memories/{memoryId}/import-attempts/{attemptId}` | Attempt + diagnostics |
| GET | `.../import-attempts/{attemptId}/report` | JSON report download |
| GET, PATCH, DELETE | `/translation-memories/{memoryId}/entries/{entryId}` | Entry CRUD (PATCH requires `expectedVersion`) |

## Org inbox: issues, bulk actions, notifications, and mentions

Provides organization-scoped Queries inbox APIs for issues, issue-sheet,
notifications, notification preferences, and mention suggestions.

Issue and issue-sheet routes use the `queries-board` Autumn gate and existing
issue-sheet capability model. Notifications, notification preferences, and
mentions are authenticated organization APIs without an Autumn gate.

Project-backed data is scoped by organization and team membership. Notification
ownership is enforced in SQL so missing, inaccessible, and other users'
notifications uniformly return `404 notification_not_found` without leaking
existence. `POST /notifications/read-all` uses snapshot semantics so
notifications created during the request remain unread.

`GET /mentions` provides `@`-mention autocomplete for users and issues.
Issue suggestions are ordered by `updated_at` ascending.

`POST /issues/bulk-actions` processes items independently with per-item outcomes
and retries transactions on PostgreSQL deadlock or serialization failures
(`40P01`/`40001`) using bounded jittered backoff.

All paths below are relative to `/v1/orgs/{organizationSlug}`:

| Method | Path | Operation |
|--------|------|-----------|
| GET | `/issues` | Cross-project issue list (`view`, `status`, `issueType`, `priority`, `locale`, `assignee`, `projectId`, `qaCheckType`, `search`, `sort`, `sortDir`, `limit`, `offset`) with a status summary |
| POST | `/issues/bulk-actions` | Bulk `assign` / `unassign` / `set_status` / `set_priority` / `set_issue_type` across up to 100 deduplicated issues |
| GET | `/issue-sheet/search` | Title/external-ref picker search, no offset, newest-touched first |
| GET | `/issue-sheet/{issueId}` | Full issue detail by UUID or `PREFIX-N` identifier, with project name |
| GET | `/notifications` | Own notifications (`unreadOnly`, `limit`, `offset`), newest first |
| GET | `/notifications/unread-count` | Live unread count (no persisted counter) |
| POST | `/notifications/read-all` | Mark all currently-unread, accessible notifications read |
| GET | `/notifications/{notificationId}` | One owned notification |
| POST | `/notifications/{notificationId}/read` | Mark one owned notification read (idempotent) |
| GET, PUT | `/notification-preferences` | Read (app default if unset) or fully replace the caller's email preferences |
| GET | `/mentions` | `@`-mention autocomplete: org members and issues matching `q` |
