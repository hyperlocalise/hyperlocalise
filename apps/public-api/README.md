# Public API

Standalone Go service for external consumers using Hyperlocalise personal access tokens.
The web frontend continues to use its existing APIs. It does not call this service.
The API reports the token's effective identity, reads Projects, Queries, Jobs,
Glossaries, and Translation memories, creates native projects (optionally from a
project template) and manages project templates, manages the strings, translations,
screenshots, and settings of native projects, round-trips bilingual files, updates jobs, exports
glossaries, imports and exports glossaries and translation memories, and registers job-change
webhook endpoints. Job creation and file uploads continue to use the existing platform API.

## Run locally

From the repository root:

```sh
export PORT=8081
export DATABASE_URL=postgresql://hyperlocalise:hyperlocalise@localhost:5432/hyperlocalise
# Optional. Required to expose Queries resources for entitled workspaces.
# export AUTUMN_API_KEY=am_sk_test_...
# Required to create or rotate webhook endpoints. Same values as go-svc.
# export HYPERLOCALISE_WEB_INTERNAL_URL=http://localhost:3000
# export WORKOS_COOKIE_PASSWORD=this-is-a-test-cookie-password-at-least-32-characters
go run ./apps/public-api
```

`PORT` defaults to 8081. `DATABASE_URL` is required. Creating or rotating a webhook
endpoint asks the web app to mint and encrypt the signing secret, so it also needs
`WORKOS_COOKIE_PASSWORD` and `HYPERLOCALISE_WEB_INTERNAL_URL` (or
`HYPERLOCALISE_PUBLIC_APP_URL`). The service does not hold
`PROVIDER_CREDENTIALS_MASTER_KEY`. PAT validation still uses PostgreSQL only.

```sh
curl http://localhost:8081/health
curl -H "x-api-key: $HYPERLOCALISE_API_KEY" http://localhost:8081/v1/me
curl -H "x-api-key: $HYPERLOCALISE_API_KEY" http://localhost:8081/v1/projects
curl -H "x-api-key: $HYPERLOCALISE_API_KEY" http://localhost:8081/v1/project-templates
curl -X POST -H "x-api-key: $HYPERLOCALISE_API_KEY" -H 'Content-Type: application/json' \
    -d '{"name":"REQ-1042 Futures page","templateId":"'$TEMPLATE_ID'"}' \
    http://localhost:8081/v1/projects
curl -H "x-api-key: $HYPERLOCALISE_API_KEY" 'http://localhost:8081/v1/queries?status=open'
curl -H "x-api-key: $HYPERLOCALISE_API_KEY" http://localhost:8081/v1/projects/$PROJECT_ID/locales
curl -H "x-api-key: $HYPERLOCALISE_API_KEY" 'http://localhost:8081/v1/projects/'$PROJECT_ID'/translations?locale=fr'
curl -X PUT -H "x-api-key: $HYPERLOCALISE_API_KEY" -H 'Content-Type: application/json' \
    -d '{"text":"Bonjour","status":"approved"}' \
    http://localhost:8081/v1/projects/$PROJECT_ID/strings/$STRING_ID/translations/fr
curl -X POST -H "x-api-key: $HYPERLOCALISE_API_KEY" -H 'Content-Type: application/json' \
    -d '{"url":"https://hooks.example.com/hyperlocalise","eventTypes":["job.status_changed"]}' \
    http://localhost:8081/v1/webhook-endpoints
```

A successful authenticated response has this shape:

```json
{
    "principal": {
        "tokenId": "token-id",
        "userId": "owner-id",
        "organizationId": "workspace-id",
        "permissions": [
            "jobs:read",
            "files:read",
            "projects:read",
            "queries:read",
            "strings:read",
            "glossaries:read",
            "translation-memories:read"
        ],
        "entitlements": { "queries": true }
    }
}
```

Each request looks up the presented token hash in `organization_api_keys`,
checks revocation, workspace lifecycle, and the owner's current organization
membership role. Effective permissions are the intersection of stored token
scopes and the owner's role. `files:read` also grants `projects:read`,
`queries:read`, `strings:read`, `glossaries:read`, and
`translation-memories:read`. `files:write`, which members cannot hold, also
grants `strings:write`, `projects:write` for admins, localization managers,
and developers, and `translations:approve` for admins, localization managers, and
reviewers. `memories:read` grants `translation-memories:read`, and
`memories:write` (admins and localization managers) grants
`translation-memories:write`. `files:write` grants `glossaries:write` to admins,
localization managers, and translators; translators can import only into
team-controlled glossaries of their teams. `jobs:read` and `jobs:write` grant
`webhooks:read` and `webhooks:write` to admins and localization managers, the
same roles that can open **Settings** → **Webhooks**. Queries additionally require the Queries plan
entitlement from Autumn when `AUTUMN_API_KEY` is configured. Authentication
results are not cached. Resource queries apply organization and team access
rules directly in PostgreSQL.

Invalid PATs receive 401, denied workspace access receives 403, and database or
entitlement service failures receive 503. Responses are not cacheable. The health
endpoint reports process liveness, not database availability.

## API reference

The OpenAPI 3.1 document lives in [`openapi.yaml`](./openapi.yaml) and is embedded
in the service binary. A running service exposes the document at
`GET /openapi.yaml` and interactive documentation at `GET /docs`.

Projects use `projects:read` (including via `files:read`). Queries use
`queries:read` (including via `files:read`) and require the Queries workspace
entitlement. Collection endpoints accept `limit` and `offset`; Query lists also
accept project, status, type, priority, locale, assignee, search, and sort
filters. Missing and inaccessible records both return `404`.

| Resource | Endpoints | Permission |
| --- | --- | --- |
| Project settings | `PATCH /v1/projects/{projectId}` (name, description, translation context, target locales) | `projects:write` |
| Jobs | `GET /v1/jobs`, `GET, PATCH /v1/jobs/{jobId}` | `jobs:read` / `jobs:write` |
| Key job strings and languages | `GET, POST, DELETE /v1/jobs/{jobId}/strings`, `GET, POST /v1/jobs/{jobId}/locales`, `DELETE .../locales/{locale}` | `jobs:read` (and `strings:read` to list strings) / `jobs:write` |
| Locale progress | `GET /v1/projects/{projectId}/locales` | `strings:read` |
| Strings | `GET, POST /v1/projects/{projectId}/strings`, `POST .../strings/batch`, `GET, PATCH, DELETE /v1/projects/{projectId}/strings/{stringId}` | `strings:read` / `strings:write` |
| Tags and design links | `POST /v1/projects/{projectId}/strings/bulk-update` | `strings:write`, for admins, localization managers and developers |
| Screenshots | `GET, POST /v1/projects/{projectId}/screenshots`, `GET, DELETE .../screenshots/{screenshotId}`, `POST .../finalize`, `POST .../markers`, `DELETE .../markers/{markerId}` | `strings:read` / `strings:write` |
| Batch review | `POST /v1/projects/{projectId}/translations/approve`, `POST .../translations/send-to-review` | `translations:approve` / `strings:write` |
| Bilingual files | `GET, POST /v1/projects/{projectId}/bilingual-file` (CSV, TMX, XLF, XLIFF, XLSX) | `strings:read` / `translations:approve` |
| Translations | `GET /v1/projects/{projectId}/translations`, `GET /v1/projects/{projectId}/strings/{stringId}/translations`, `GET, PUT .../translations/{locale}` | `strings:read` / `strings:write`; `translations:approve` to approve or reject |
| Glossaries | `GET /v1/glossaries`, `GET /v1/glossaries/{glossaryId}`, `GET .../terms`, `GET .../export` (TBX, CSV, XLSX) | `glossaries:read` |
| Translation memories | `GET /v1/translation-memories`, `GET /v1/translation-memories/{memoryId}`, `GET .../entries`, `GET .../export` (TMX, CSV) | `translation-memories:read` |
| Glossary import | `POST /v1/glossaries/{glossaryId}/import` (TBX, CSV, XLSX; returns `202`), `GET .../import-reports/{reportId}` | `glossaries:write` / `glossaries:read` |
| Translation memory import | `POST /v1/translation-memories/{memoryId}/import` (TMX, CSV) | `translation-memories:write` |
| Webhook endpoints | `GET, POST /v1/webhook-endpoints`, `PATCH, DELETE /v1/webhook-endpoints/{endpointId}`, `POST .../rotate-secret`, `GET .../deliveries` | `webhooks:read` / `webhooks:write` |

Project lists and nested string routes treat unassigned projects as belonging to
the workspace default team, matching go-svc. String, translation, and screenshot
writes apply to native projects only; external TMS projects return
`409 project_not_native`. String and translation writes take the same key row
lock as the web app and go-svc editors, skip locked segments with
`409 segment_locked` (including delete and source-text edits), and record a
`project_translation_revisions` row attributed to the token owner with actor
kind `api_key`. Translation lists omit hidden strings unless
`includeHidden=true`. Glossary and memory visibility follows go-svc: operators
see everything, members see organization libraries plus those their teams'
projects use.

Screenshot create returns a time-limited PUT URL. PUT the PNG, JPEG, or WebP
bytes, then finalize. Markers are percent boxes that bind a screenshot to a
string (`stringId`, or `key` and `filePath` when the key exists in more than one
file). Object storage must be configured or screenshot writes return
`503 screenshot_storage_unavailable`. Figma-synced frames appear on the list
with `figmaUrl`; this API does not create them.

Bilingual imports, string batches, and memory imports apply in one transaction.
Bilingual imports save approved translations with provenance `import` and skip
locked or over-length segments. Job updates port the web app's
`updateNativeJob`.

Every new write records a workspace activity-log event in the same transaction
as the change, attributed to the token (`api_key` actor, the token id as the
credential, its owner as the user): `file_translations_imported` per file a
bilingual import changed, `job_updated`, `project_settings_changed`,
`project_strings_updated`, and `translation_memory_imported`. Screenshot and
marker writes record none yet. Memory and glossary exports record
`translation_memory_exported` and `glossary_exported`, best effort, as go-svc
does. Translations of strings that belong to no file
have no file to target and record no event.

Glossary imports reuse the web app's pipeline: the file is stored in object
storage (`OBJECT_STORAGE_LOCATIONS`, the same variables go-svc reads), a
`glossary_import_runs` row is queued, and `GLOSSARY_INTERCHANGE_QUEUE_URL`
hands it to the glossary interchange lambda, which records `glossary_imported`
for the token. Without both, the import endpoint returns `503`. The lambda
bumps the glossary's `updated_at`, which go-svc includes in its cache keys, so
the app does not serve stale glossary data after an import.

Database-backed tests run when `DATABASE_URL` points at a migrated database
and are skipped otherwise.

## Build and test

```sh
go test -race ./apps/public-api
make check-build-public-api
docker build -f apps/public-api/Dockerfile -t hyperlocalise-public-api .
```

Deploy this service behind a TLS ingress with request rate limits. Configure
`DATABASE_URL`, `WORKOS_COOKIE_PASSWORD`, `HYPERLOCALISE_WEB_INTERNAL_URL` (or
`HYPERLOCALISE_PUBLIC_APP_URL`), and optional `AUTUMN_API_KEY` through
deployment secrets, not build arguments. No DNS or existing API routes change
automatically.

## Adding resource endpoints

Require the relevant effective token scope and enforce workspace and project/team
access for each resource. A validated principal alone does not grant access to
every project in a workspace. Never log tokens or secrets.
