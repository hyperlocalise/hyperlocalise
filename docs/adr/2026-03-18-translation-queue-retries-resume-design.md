# Translation queue retries and resumable execution design

## Context

The hosted translation path already persisted jobs and outbox events, but retries, dead-letter handling, and resumable execution were still deferred. That left large batches vulnerable to wasted work when a worker failed mid-job.

## Decision

The execution layer now treats outbox events as retry-aware queue records and string jobs as resumable units.

- outbox events track attempt count, next-at scheduling, processing claims, and dead-letter state
- string jobs persist checkpoint payloads after each completed locale so resumed workers skip finished work
- workers classify translation-provider failures as retryable and unsupported or malformed jobs as terminal
- a background runner can claim pending events in batches and process them with a worker pool

## Data flow

1. `CreateJob` creates a queued job and an outbox event with retry metadata.
2. A worker runner lists and claims eligible outbox events.
3. `Processor` loads the job, moves it to running, and restores any saved checkpoint.
4. Each completed locale is saved back to the checkpoint immediately.
5. On transient failures, the event is released with exponential backoff.
6. On terminal failures or exhausted retries, the job fails and the event is dead-lettered.
7. On success, the final result is assembled from the checkpoint and the event is marked processed.

## Consequences

- resuming a large batch no longer re-translates already completed locales
- retries stay bounded and observable from persisted queue metadata
- parallel worker drains can scale across many pending events without changing the neutral queue interface
