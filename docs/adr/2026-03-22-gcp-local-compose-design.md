# GCP local Docker Compose design

## Summary

This design adds a provider-specific local integration stack in `docker-compose.gcp.yml`.

The stack keeps the filename GCP-specific so the repository can add AWS or other provider-specific Compose files later without overloading one default file.

## Scope

The GCP stack provisions four required parts for local queue-path testing:

- Postgres with the current translation schema loaded on first startup.
- A Pub/Sub emulator that listens on `:8085`.
- A bootstrap container that creates the local topic and subscription automatically.
- App containers for `translation-service` and `translation-dispatcher-gcp`.

The worker is included behind the optional `worker` Compose profile because full execution needs extra runtime configuration that queue-path validation does not need:

- GCS signing configuration.
- A real bucket.
- A supported remote LLM provider and model.

## Why this shape

Three alternatives were considered:

1. Put every provider into one `docker-compose.yml` file.
   - Rejected because it would make future AWS or mixed-provider local stacks harder to reason about.
2. Compose only the emulator and database, then run the Go binaries manually.
   - Rejected because it would leave the local loop too manual.
3. Add a GCP-specific Compose file with automatic emulator bootstrap.
   - Chosen because it gives one repeatable command for the current GCP path and leaves room for later provider-specific files.

## Data flow

1. `postgres` starts and applies the SQL migration from `migrations/translation/202603220001_translation_outbox_delivery.sql` on first boot.
2. `pubsub-emulator` starts the local Pub/Sub process.
3. `pubsub-bootstrap` waits for the emulator, then creates the topic and subscription if they do not exist.
4. `translation-service` writes jobs and outbox rows into Postgres.
5. `translation-dispatcher-gcp` publishes queued outbox rows to the emulator topic.
6. If you enable the `worker` profile and provide the required env vars, `translation-worker-gcp` can consume the local subscription.

## Verification

The local workflow should support these checks:

- `docker compose -f docker-compose.gcp.yml config`
- `docker compose -f docker-compose.gcp.yml up --build`
- `docker compose -f docker-compose.gcp.yml --profile worker up --build` when worker-only secrets are supplied.
