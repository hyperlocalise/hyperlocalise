# Go service health-check logging

## Status

Accepted

## Context

The go-svc `/health` endpoint probes configured dependencies. Its activity-log
publisher emitted start, success, and failure log entries for each probe. The
endpoint already suppresses its HTTP access log and tracing span, so these
dependency messages were the remaining routine health-check noise.

## Decision

Remove the activity-log publisher's health-probe log entries. Keep the SQS
queue-attribute probe, its timeout, and its wrapped error unchanged so the
health response continues to report dependency availability.

Add regression coverage for successful and failed probes to ensure neither
path emits a log entry.

## Consequences

Routine activity-log health probes no longer produce logs. Probe failures remain
visible through the `/health` response and its `unavailable` status.
