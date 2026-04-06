# Translation Job Route Design

## Goal

Add project-scoped HTTP routes for translation job operations in the web app, keep authorization aligned with project ownership, and use Inngest as the queue entrypoint without relying on network mocks in tests.

## Route Shape

The route surface stays nested under projects:

- `POST /api/project/:projectId/jobs`
- `GET /api/project/:projectId/jobs`
- `GET /api/project/:projectId/jobs/:jobId`
- `GET /api/project/:projectId/jobs/:jobId/status`

This matches the current schema because each translation job belongs to a single project and project ownership is already the authorization boundary.

## Queueing

Job creation persists a queued row in Postgres and then enqueues an Inngest event named `translation/job.queued`. The production queue implementation uses `inngest.send()`. The initial function attached to that event records the Inngest `runId` back onto the job row so the app has a workflow reference immediately, while leaving actual execution semantics open for later worker work.

If queue enqueue fails, the route deletes the inserted job and returns `503` so the API does not leave orphaned queued rows behind.

## Testing

Route tests use `hono/testing` against the real app factory and real database tables. They do not mock the route store or database. For queue behavior, the tests inject a queue implementation that executes the real Inngest function through `@inngest/test`, so the route test still exercises the actual queue-side code path without external network dependencies.

Separate Inngest tests use `InngestTestEngine` directly to validate the function behavior and database side effects.
