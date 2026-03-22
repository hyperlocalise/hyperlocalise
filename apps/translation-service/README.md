# Translation Service

This service exposes the `hyperlocalise.translation.v1.TranslationService` gRPC API.

The service accepts gRPC requests and stores translation jobs in Postgres. Broker delivery is handled asynchronously by the dedicated dispatcher process.

The async worker uses a process-level LLM profile for `string` jobs. `file` jobs are not implemented yet.

## Cloud overview

The cloud translation path has three runtime components:

- `translation-service`: accepts gRPC requests and persists `translation_jobs` plus `outbox_events`
- `translation-dispatcher-gcp`: polls committed outbox rows and publishes them to the configured broker
- `translation-worker-gcp`: Cloud Run worker-pool process that pulls a Pub/Sub subscription, claims execution ownership, and runs the translation job

`translation-dispatcher-gcp` is a background process, not an HTTP API. If you run it on Google Cloud, treat it like a worker container. A continuously polling deployment fits best as a long-lived worker service. If you want scheduled drain-only execution instead, adapt it to a Cloud Run Job cadence.

The `outbox_events` table stores both:

- delivery state used by the dispatcher
- execution state used by the worker

### 1. Request path

```mermaid
flowchart LR
    Client["Client"] --> Service["translation-service"]

    subgraph DB["Postgres"]
        Jobs[("translation_jobs")]
        Outbox[("outbox_events")]
    end

    Service -->|"store queued job"| Jobs
    Service -->|"store outbox row"| Outbox
    Service -->|"return QUEUED"| Client
```

### 2. Async delivery and execution

```mermaid
flowchart LR
    subgraph DB["Postgres"]
        Jobs[("translation_jobs")]
        Outbox[("outbox_events")]
    end

    Dispatcher["translation-dispatcher-gcp"] -->|"poll + publish"| Outbox
    Dispatcher --> Broker["Pub/Sub"]
    Dispatcher -->|"update delivery state"| Outbox

    Broker --> Worker["translation-worker-gcp"]

    Worker -->|"claim execution"| Outbox
    Worker -->|"run job"| Jobs
    Worker -->|"update execution state"| Outbox
```

### Request and execution flow

1. `translation-service` stores the queued job and outbox row in one transaction.
2. The service returns success as soon as that write commits.
3. `translation-dispatcher-gcp` reads pending outbox rows and publishes them to Pub/Sub.
4. `translation-worker-gcp` pulls the message from Pub/Sub and claims execution ownership.
5. The worker updates the job result and the outbox execution state.

## Required environment variables

Set these variables before you start the service:

- `DATABASE_URL`: PostgreSQL connection string for translation jobs and outbox rows
- `TRANSLATION_QUEUE_DRIVER`: queue provider to use. Use `stub` for local development without GCP credentials; use `gcp-pubsub` in production.

When `TRANSLATION_QUEUE_DRIVER=gcp-pubsub`, also set:

- `TRANSLATION_GCP_PUBSUB_PROJECT_ID`: Google Cloud project that owns the topic
- `TRANSLATION_GCP_PUBSUB_TOPIC`: Pub/Sub topic that receives queued translation jobs
- `GOOGLE_APPLICATION_CREDENTIALS`: path to a service account JSON key when you run the service outside Google Cloud

Optional:

- `LISTEN_ADDR`: gRPC listen address. Defaults to `:8080`.

Worker-only:

- `TRANSLATION_GCP_PUBSUB_SUBSCRIPTION`: Pub/Sub subscription consumed by the worker process
- `TRANSLATION_LLM_PROVIDER`: remote provider used by the async worker. Supported values: `openai`, `azure_openai`, `anthropic`, `gemini`, `bedrock`, `groq`, `mistral`
- `TRANSLATION_LLM_MODEL`: model name passed to the selected provider
- `TRANSLATION_LLM_SYSTEM_PROMPT`: optional system prompt override for worker translations
- `TRANSLATION_LLM_USER_PROMPT`: optional user prompt override for worker translations

Do not use local providers such as `lmstudio` or `ollama` in the worker runtime.

Cloud Run worker notes:

- `translation-worker-gcp` is intended for a Cloud Run worker pool
- it pulls a Pub/Sub subscription directly instead of serving HTTP

For quick local testing, set `TRANSLATION_QUEUE_DRIVER=stub` to use the local no-op queue implementation and skip GCP setup:

```bash
DATABASE_URL=postgres://localhost:5432/hyperlocalise \
TRANSLATION_QUEUE_DRIVER=stub \
bazel run //apps/translation-service:translation-service
```

## Authentication

The Pub/Sub adapter uses Google Application Default Credentials.

Use one of these authentication paths:

- Local development: set `GOOGLE_APPLICATION_CREDENTIALS` to a service account JSON file with publish access to the target topic
- Google Cloud runtime: attach a service account to the workload and grant it publish access to the target topic
- Local user testing: `gcloud auth application-default login` can work, but a service account is better for repeatable service runs

Minimum IAM for the configured topic:

- `roles/pubsub.publisher`

Dispatcher-only optional settings:

- `TRANSLATION_DISPATCHER_POLL_INTERVAL`: polling interval for pending delivery rows. Defaults to `2s`
- `TRANSLATION_DISPATCHER_BATCH_SIZE`: max outbox rows claimed per poll. Defaults to `32`
- `TRANSLATION_DISPATCHER_LEASE_DURATION`: delivery lease duration. Defaults to `30s`
- `TRANSLATION_DISPATCHER_MAX_ATTEMPTS`: max broker publish attempts before delivery dead-letter. Defaults to `5`
- `TRANSLATION_DISPATCHER_INITIAL_BACKOFF`: first publish retry backoff. Defaults to `1s`
- `TRANSLATION_DISPATCHER_MAX_BACKOFF`: max publish retry backoff. Defaults to `30s`

## Run locally

For the fastest local iteration loop, use the stub queue driver:

```bash
DATABASE_URL=postgres://localhost:5432/hyperlocalise \
TRANSLATION_QUEUE_DRIVER=stub \
bazel run //apps/translation-service:translation-service
```

Switch to `gcp-pubsub` only when you want to exercise the real broker integration:

Run the service with Bazel:

```bash
DATABASE_URL=postgres://localhost:5432/hyperlocalise \
TRANSLATION_QUEUE_DRIVER=gcp-pubsub \
TRANSLATION_GCP_PUBSUB_PROJECT_ID=my-gcp-project \
TRANSLATION_GCP_PUBSUB_TOPIC=translation-job-queued \
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
bazel run //apps/translation-service:translation-service
```

By default, the server listens on `:8080`.

To override the listen address:

```bash
DATABASE_URL=postgres://localhost:5432/hyperlocalise \
TRANSLATION_QUEUE_DRIVER=stub \
LISTEN_ADDR=:9090 \
bazel run //apps/translation-service:translation-service
```

Run the dispatcher locally with Bazel:

```bash
DATABASE_URL=postgres://localhost:5432/hyperlocalise \
TRANSLATION_QUEUE_DRIVER=gcp-pubsub \
TRANSLATION_GCP_PUBSUB_PROJECT_ID=my-gcp-project \
TRANSLATION_GCP_PUBSUB_TOPIC=translation-job-queued \
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
bazel run //apps/translation-dispatcher-gcp:translation-dispatcher-gcp
```

To override the listen address while using GCP Pub/Sub:

```bash
DATABASE_URL=postgres://localhost:5432/hyperlocalise \
TRANSLATION_QUEUE_DRIVER=gcp-pubsub \
TRANSLATION_GCP_PUBSUB_PROJECT_ID=my-gcp-project \
TRANSLATION_GCP_PUBSUB_TOPIC=translation-job-queued \
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
LISTEN_ADDR=:9090 \
bazel run //apps/translation-service:translation-service
```

## Build the binary

Build the service binary with Bazel:

```bash
bazel build //apps/translation-service:translation-service
```

The built binary is written to:

```text
bazel-bin/apps/translation-service/translation-service_/translation-service
```

## Build the Docker image

Build the Bazel binary first:

```bash
bazel build //apps/translation-service:translation-service
```

Then build the image from the repository root:

```bash
docker build -f apps/translation-service/Dockerfile -t hyperlocalise/translation-service .
```

Build the dispatcher image:

```bash
bazel build //apps/translation-dispatcher-gcp:translation-dispatcher-gcp
docker build -f apps/translation-dispatcher-gcp/Dockerfile -t hyperlocalise/translation-dispatcher-gcp .
```

Build the worker image:

```bash
bazel build //apps/translation-worker-gcp:translation-worker-gcp
docker build -f apps/translation-worker-gcp/Dockerfile -t hyperlocalise/translation-worker-gcp .
```

## Run the Docker image

Run the container and publish port `8080`:

```bash
docker run --rm \
  -p 8080:8080 \
  -e DATABASE_URL=postgres://host.docker.internal:5432/hyperlocalise \
  -e TRANSLATION_QUEUE_DRIVER=stub \
  hyperlocalise/translation-service
```

To run the container against the real GCP Pub/Sub topic instead:

```bash
docker run --rm \
  -p 8080:8080 \
  -e DATABASE_URL=postgres://host.docker.internal:5432/hyperlocalise \
  -e TRANSLATION_QUEUE_DRIVER=gcp-pubsub \
  -e TRANSLATION_GCP_PUBSUB_PROJECT_ID=my-gcp-project \
  -e TRANSLATION_GCP_PUBSUB_TOPIC=translation-job-queued \
  -e GOOGLE_APPLICATION_CREDENTIALS=/var/secrets/google/service-account.json \
  -v /local/path/service-account.json:/var/secrets/google/service-account.json:ro \
  hyperlocalise/translation-service
```

To override the listen address inside the container:

```bash
docker run --rm \
  -p 9090:9090 \
  -e DATABASE_URL=postgres://host.docker.internal:5432/hyperlocalise \
  -e TRANSLATION_QUEUE_DRIVER=stub \
  -e LISTEN_ADDR=:9090 \
  hyperlocalise/translation-service
```

To override the listen address inside the container while using GCP Pub/Sub:

```bash
docker run --rm \
  -p 9090:9090 \
  -e DATABASE_URL=postgres://host.docker.internal:5432/hyperlocalise \
  -e TRANSLATION_QUEUE_DRIVER=gcp-pubsub \
  -e TRANSLATION_GCP_PUBSUB_PROJECT_ID=my-gcp-project \
  -e TRANSLATION_GCP_PUBSUB_TOPIC=translation-job-queued \
  -e GOOGLE_APPLICATION_CREDENTIALS=/var/secrets/google/service-account.json \
  -v /local/path/service-account.json:/var/secrets/google/service-account.json:ro \
  -e LISTEN_ADDR=:9090 \
  hyperlocalise/translation-service
```

Run the dispatcher container:

```bash
docker run --rm \
  -e DATABASE_URL=postgres://host.docker.internal:5432/hyperlocalise \
  -e TRANSLATION_QUEUE_DRIVER=gcp-pubsub \
  -e TRANSLATION_GCP_PUBSUB_PROJECT_ID=my-gcp-project \
  -e TRANSLATION_GCP_PUBSUB_TOPIC=translation-job-queued \
  -e GOOGLE_APPLICATION_CREDENTIALS=/var/secrets/google/service-account.json \
  -v /local/path/service-account.json:/var/secrets/google/service-account.json:ro \
  hyperlocalise/translation-dispatcher-gcp
```

## Run the local GCP integration stack with Docker Compose

Use `docker-compose.gcp.yml` when you want a repeatable local queue-path environment with Postgres plus a Pub/Sub emulator. The filename is provider-specific on purpose so the repo can add AWS or other provider stacks later without overloading one shared Compose file.

The default stack starts:

- `postgres`
- `pubsub-emulator`
- `pubsub-bootstrap`
- `translation-service`
- `translation-dispatcher-gcp`

The worker is available behind the optional `worker` profile because full job execution still needs extra GCS and LLM configuration that queue-path validation does not require.

Build the Bazel binaries first because the Dockerfiles copy artifacts from `bazel-bin/`:

```bash
bazel build //apps/translation-service:translation-service \
  //apps/translation-dispatcher-gcp:translation-dispatcher-gcp \
  //apps/translation-worker-gcp:translation-worker-gcp
```

Start the default local stack:

```bash
docker compose -f docker-compose.gcp.yml up --build
```

Key local defaults inside the stack:

- Postgres: `postgres://hyperlocalise:hyperlocalise@localhost:5432/hyperlocalise?sslmode=disable`
- Pub/Sub emulator: `localhost:8085`
- gRPC service: `localhost:8080`
- Topic: `translation-job-queued`
- Subscription: `translation-job-queued-local`

The service and dispatcher automatically target the emulator through `PUBSUB_EMULATOR_HOST=pubsub-emulator:8085`.

To include the worker, provide the required GCS and LLM environment variables in your shell first, then start the optional profile:

```bash
export TRANSLATION_GCP_STORAGE_BUCKET=my-local-test-bucket
export TRANSLATION_GCP_STORAGE_SIGNING_ACCOUNT=my-signer@example.com
export TRANSLATION_GCP_STORAGE_SIGNING_PRIVATE_KEY='-----BEGIN PRIVATE KEY-----...-----END PRIVATE KEY-----'
export TRANSLATION_LLM_PROVIDER=openai
export TRANSLATION_LLM_MODEL=gpt-4.1-mini
export OPENAI_API_KEY=your-openai-api-key

docker compose -f docker-compose.gcp.yml --profile worker up --build
```

If you prefer an env file instead of shell exports, use the `.env.worker.example` flow documented in the root `README.md`.

To reset the local database volume and emulator bootstrap state:

```bash
docker compose -f docker-compose.gcp.yml down -v
```
