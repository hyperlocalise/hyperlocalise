# Translation Service

This service exposes the `hyperlocalise.translation.v1.TranslationService` gRPC API.

The service accepts gRPC requests, stores translation jobs in Postgres, and publishes queued job events to the configured broker.

The async worker uses a process-level LLM profile for `string` jobs. `file` jobs are not implemented yet.

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

- `TRANSLATION_LLM_PROVIDER`: remote provider used by the async worker. Supported values: `openai`, `azure_openai`, `anthropic`, `gemini`, `bedrock`, `groq`, `mistral`
- `TRANSLATION_LLM_MODEL`: model name passed to the selected provider
- `TRANSLATION_LLM_SYSTEM_PROMPT`: optional system prompt override for worker translations
- `TRANSLATION_LLM_USER_PROMPT`: optional user prompt override for worker translations

Do not use local providers such as `lmstudio` or `ollama` in the worker runtime.

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
