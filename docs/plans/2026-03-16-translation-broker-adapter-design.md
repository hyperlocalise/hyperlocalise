# Translation Broker Adapter Design

## Summary

This change replaces the translation service's logger-backed queue stub with a real broker adapter shape that stays transport-neutral in the shared application layer. Google Pub/Sub is the first real implementation. AWS support remains intentionally deferred, but the package boundaries and config model are designed so SQS can be added without reshaping the application service or worker processor.

## Goals

- keep `internal/translation/app` and `internal/translation/worker` broker-agnostic
- implement a real Google Pub/Sub publisher for `apps/translation-service`
- preserve a clean path for a future AWS SQS adapter
- keep provider-specific event envelope decoding in provider-specific entrypoints

## Non-Goals

- outbox dispatcher work
- SQS implementation
- retry or dead-letter semantics
- schema management changes

## Approaches Considered

### Recommended: neutral queue core with provider packages

Keep the shared `queue` package limited to types, interfaces, and driver constants. Put concrete providers in subpackages such as `queue/gcppubsub` and `queue/stub`, and keep adapter selection in a thin `queue/provider` factory package. This keeps provider SDK imports out of the application layer and makes a future `queue/awssqs` package a narrow addition rather than a refactor.

### Alternative: single queue package with provider switches

Put all adapter logic behind one package-level switch. This is slightly shorter at first, but it turns the shared queue package into a provider-specific dependency hub and makes later AWS support harder to test and review.

### Alternative: normalize everything around CloudEvents now

Use CloudEvents as the shared broker payload contract. This would be premature. The worker entrypoints already need provider-specific envelope handling, and forcing CloudEvents into the core would add abstraction without solving a current problem.

## Package Layout

- `internal/translation/queue`: shared message type, publisher interface, and driver constants
- `internal/translation/queue/provider`: adapter factory used at deployment edges
- `internal/translation/queue/gcppubsub`: real Google Pub/Sub publisher
- `internal/translation/queue/stub`: no-op development and test publisher
- future `internal/translation/queue/awssqs`: reserved target for AWS support

The worker processor remains provider-neutral. `apps/translation-worker-gcp` continues to decode the Pub/Sub event envelope and pass the shared payload to `worker.Processor`.

## Configuration

The service continues to use `TRANSLATION_QUEUE_DRIVER` as the top-level selector. Accepted values are:

- `stub`
- `gcp-pubsub`
- `aws-sqs` reserved for future support

The Google Pub/Sub publisher adds:

- `TRANSLATION_GCP_PUBSUB_PROJECT_ID`
- `TRANSLATION_GCP_PUBSUB_TOPIC`

Unknown drivers and missing provider-specific values fail adapter construction at startup.

## Data Flow

1. `CreateTranslationJob` stores the job and outbox event.
2. `apps/translation-service` resolves the configured publisher through `queue/provider.NewPublisher`.
3. The Pub/Sub adapter publishes the neutral payload bytes to the configured topic.
4. The adapter adds standard message attributes such as the logical event topic and aggregate id.
5. `apps/translation-worker-gcp` receives and decodes the GCP envelope, then hands the shared payload to `worker.Processor`.

## Testing

- factory tests cover supported and unsupported drivers
- stub adapter tests confirm the no-op lifecycle
- Pub/Sub adapter tests verify message attribute mapping, publish behavior, and close delegation through a small mockable client abstraction

## Follow-Up Work

- move publication off the gRPC request path into a dedicated outbox dispatcher
- add an AWS SQS adapter and worker entrypoint
- add retries, idempotency, and dead-letter handling
