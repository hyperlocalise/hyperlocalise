# Translation Job Routes + Integration Testing Design

## Scope
Implement translation job API operations with Hono routes:
- create
- get by id
- list
- cancel

Testing must use the real API app and real database integration (no route mocking), and include local Inngest integration coverage.

## Chosen approach
Use thin route handlers mounted from `src/api/app.ts` with direct Drizzle DB access and Inngest event publishing through a small shared client module.

## Data flow
1. `POST /api/translation/jobs` validates payload and organization/project access.
2. A job row is inserted in `translation_jobs` with status `queued`.
3. An Inngest event is sent (`translation/job.queued`) and the first event/run id is persisted into `workflow_run_id`.
4. The created job is returned.

`GET /api/translation/jobs/:jobId` and `GET /api/translation/jobs` scope reads by the caller organization.

`POST /api/translation/jobs/:jobId/cancel` checks mutation role and only allows cancellation from `queued`/`running`; it transitions to `failed` with `error` outcome payload metadata (`lastError = canceled_by_user`).

## Testing strategy
- Route integration tests call the real exported app via `hono/testing` `testClient`.
- Tests authenticate using real auth middleware with `x-hyperlocalise-auth` header.
- DB integration is real Drizzle/Postgres, with cleanup by deleting created org/user records.
- Inngest integration uses a local HTTP test server and the real `Inngest` client configured with local `INNGEST_BASE_URL`, asserting the queued event request shape.
