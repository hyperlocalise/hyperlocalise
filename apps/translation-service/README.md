# Translation Service

This service exposes the `hyperlocalise.translation.v1.TranslationService` gRPC API.

The current implementation is a stub server. All RPCs return `Unimplemented`.

## Run locally

Run the service with Bazel:

```bash
bazel run //apps/translation-service:translation-service
```

By default, the server listens on `:8080`.

To override the listen address:

```bash
LISTEN_ADDR=:9090 bazel run //apps/translation-service:translation-service
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
docker run --rm -p 8080:8080 hyperlocalise/translation-service
```

To override the listen address inside the container:

```bash
docker run --rm -p 9090:9090 -e LISTEN_ADDR=:9090 hyperlocalise/translation-service
```
