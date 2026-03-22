# GCP Pulumi stack

This stack provisions the GCP topology discussed for the cloud translation path:

- a shared VPC and subnet for all runtime components
- a private Cloud SQL Postgres instance on private service networking
- a Pub/Sub topic and subscription for queued translation jobs
- a Cloud Storage bucket for translation file artifacts
- a private `translation-service` Cloud Run service for gRPC traffic
- a private `translation-dispatcher-gcp` Cloud Run worker pool
- a private `translation-worker-gcp` Cloud Run worker pool
- a public `api-service` Cloud Run service for REST traffic

## What this stack assumes

This stack expects you to provide container images for four workloads:

- `apiServiceImage`
- `translationServiceImage`
- `dispatcherImage`
- `workerImage`

The runtime wiring matches the existing application contracts in `apps/translation-service/README.md` and `internal/translation/config/config.go`.

## Layout

```text
Public internet
  -> api-service (Cloud Run, public)
     -> translation-service (Cloud Run, private gRPC)
        -> Cloud SQL (private IP)
        -> Pub/Sub topic

dispatcher worker pool (private)
  -> Cloud SQL outbox polling
  -> Pub/Sub publish

translation worker pool (private)
  -> Pub/Sub subscription pull
  -> Cloud SQL job updates
  -> Cloud Storage artifacts
```

## Required Pulumi config

```bash
pulumi config set gcp:project <gcp-project-id>
pulumi config set gcp:region us-central1
pulumi config set hyperlocalise-gcp:project <gcp-project-id>
pulumi config set hyperlocalise-gcp:apiServiceImage us-docker.pkg.dev/<project>/<repo>/api-service:latest
pulumi config set hyperlocalise-gcp:translationServiceImage us-docker.pkg.dev/<project>/<repo>/translation-service:latest
pulumi config set hyperlocalise-gcp:dispatcherImage us-docker.pkg.dev/<project>/<repo>/translation-dispatcher-gcp:latest
pulumi config set hyperlocalise-gcp:workerImage us-docker.pkg.dev/<project>/<repo>/translation-worker-gcp:latest
pulumi config set --secret hyperlocalise-gcp:databasePassword '<strong-password>'
```

## Optional follow-up work

This stack is intentionally the infrastructure baseline. You will likely want to extend it with:

- Secret Manager-backed API keys for the worker pool's LLM provider
- Cloud Run IAM auth between `api-service` and `translation-service`
- external HTTPS load balancing, custom domains, or API Gateway in front of `api-service`
- monitoring, alerting, dashboards, and SLOs
- migration automation for the Cloud SQL schema
