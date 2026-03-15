# Translation Service

This service exposes the `hyperlocalise.translation.v1.TranslationService` gRPC API.

The service accepts gRPC requests, stores translation jobs in Postgres, and publishes queued job events to the configured broker.

## Required environment variables

Set these variables before you start the service:

- `DATABASE_URL`: PostgreSQL connection string for translation jobs and outbox rows
- `TRANSLATION_QUEUE_DRIVER`: queue provider to use. The current production option is `gcp-pubsub`.

When `TRANSLATION_QUEUE_DRIVER=gcp-pubsub`, also set:

- `TRANSLATION_GCP_PUBSUB_PROJECT_ID`: Google Cloud project that owns the topic
- `TRANSLATION_GCP_PUBSUB_TOPIC`: Pub/Sub topic that receives queued translation jobs
- `GOOGLE_APPLICATION_CREDENTIALS`: path to a service account JSON key when you run the service outside Google Cloud

Optional:

- `LISTEN_ADDR`: gRPC listen address. Defaults to `:8080`.

## Authentication

The Pub/Sub adapter uses Google Application Default Credentials.

Use one of these authentication paths:

- Local development: set `GOOGLE_APPLICATION_CREDENTIALS` to a service account JSON file with publish access to the target topic
- Google Cloud runtime: attach a service account to the workload and grant it publish access to the target topic
- Local user testing: `gcloud auth application-default login` can work, but a service account is better for repeatable service runs

Minimum IAM for the configured topic:

- `roles/pubsub.publisher`

## Run locally

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
  -e TRANSLATION_QUEUE_DRIVER=gcp-pubsub \
  -e TRANSLATION_GCP_PUBSUB_PROJECT_ID=my-gcp-project \
  -e TRANSLATION_GCP_PUBSUB_TOPIC=translation-job-queued \
  -e GOOGLE_APPLICATION_CREDENTIALS=/var/secrets/google/service-account.json \
  -v /local/path/service-account.json:/var/secrets/google/service-account.json:ro \
  -e LISTEN_ADDR=:9090 \
  hyperlocalise/translation-service
```
