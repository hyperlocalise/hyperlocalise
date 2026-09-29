# ECS deployed-image verification

## Status

Accepted

## Context

The ECS deployment action waits for service stability, then verifies the
deployed image by reading the task definition currently reported by the
service. ECS can briefly return the previous task definition while the new
deployment becomes primary. The existing failure message also did not include
enough state to distinguish propagation delay from rollback or image mismatch.

## Decision

Use the task-definition ARN returned by the ECS deploy action as the expected
revision. Poll the service for up to 60 seconds, in 5-second intervals, until
that revision is primary and its rollout is complete. Inspect the named
container in that exact revision and require its image URI to match the
requested image.

Fail immediately on a terminal failed rollout, missing container, or image
mismatch. Include the expected and observed task-definition ARNs, rollout state,
service counts, and image values in failures.

## Consequences

The verification tolerates short ECS control-plane propagation delays while
continuing to detect rollbacks. Deploy failures provide enough context to
diagnose the observed service state without querying ECS manually.
