# Translation Async Stub Design

## Context

The translation gRPC API already exposes async job contracts, but the service implementation was still an `Unimplemented` stub. The first backend cut needs to:

- persist translation jobs in Postgres
- store outbox events in Postgres
- keep the async transport cloud-agnostic
- support a separate worker process
- leave clear TODOs for real broker delivery, migrations, and translation execution

The initial queue target is Google Pub/Sub, but SQS may be added later.

## Decision

<<<<<<< HEAD
We split the deployment into a service binary and a GCP Cloud Function:

- `apps/translation-service` handles gRPC requests, validates input, stores queued jobs, and records outbox events.
- `apps/translation-worker-gcp` is a Google Cloud Pub/Sub-triggered function that handles one queued job event per invocation, advances job state, and writes stub results.
=======
We split the deployment into two binaries:

- `apps/translation-service` handles gRPC requests, validates input, stores queued jobs, and records outbox events.
- `apps/translation-worker` runs independently, polls pending outbox records as a temporary fallback, advances job state, and writes stub results.
>>>>>>> 486e714 (.)

Shared behavior lives under `internal/translation`:

- `app` contains the application service and protobuf-to-storage conversions.
- `store` contains Bun models and Postgres repositories, using pgx as the PostgreSQL driver.
- `queue` defines a broker-agnostic publisher interface and a stub adapter.
- `worker` contains the async processing loop.
- `config` contains runtime configuration loading.

<<<<<<< HEAD
AWS delivery is intentionally deferred. If AWS support is added later, it should get its own adapter and entrypoint package rather than overloading the GCP deployment path.

=======
>>>>>>> 486e714 (.)
## Data Flow

`CreateTranslationJob` now:

1. validates the request
2. creates a queued job record
3. inserts an outbox event in the same Postgres transaction
4. calls a stub queue publisher
5. returns the queued job resource

<<<<<<< HEAD
The Cloud Function now:

1. receives a Pub/Sub message containing the queued job payload
=======
The worker now:

1. polls pending outbox rows
>>>>>>> 486e714 (.)
2. loads the referenced job
3. transitions the job from `QUEUED` to `RUNNING`
4. writes a placeholder success result
5. marks the outbox row as processed

## Deferred Work

- Add SQL migrations for `translation_jobs` and `outbox_events`.
<<<<<<< HEAD
- Replace the stub queue publisher with a real Pub/Sub adapter and deploy wiring.
- Add an SQS adapter behind the same queue interface.
- Move broker dispatch to a dedicated outbox dispatcher instead of publishing in the gRPC path.
- Add retries, idempotency, dead-letter handling, and delivery semantics for repeated Pub/Sub invocations.
=======
- Replace the stub queue publisher with a real Pub/Sub adapter.
- Add an SQS adapter behind the same queue interface.
- Move broker dispatch to a dedicated outbox dispatcher instead of publishing in the gRPC path.
- Add retries, leasing, idempotency, dead-letter handling, and multi-worker safe claiming.
>>>>>>> 486e714 (.)
- Replace placeholder translation results with real translator execution.
