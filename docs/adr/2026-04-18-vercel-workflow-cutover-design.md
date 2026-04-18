# Vercel workflow cutover design

## Context

You want a full cutover from Inngest to a Vercel-oriented workflow path to reduce dependencies and simplify the backend queue flow.

## Decision

Use a direct rewrite. Remove Inngest integrations, endpoints, env variables, and test engine coupling. Keep the translation job state machine logic and DB semantics unchanged.

## Implementation plan

1. Remove Inngest client module and replace it with a workflow queue module.
2. Convert the translation job queued function into a direct async executor.
3. Trigger execution from the queue abstraction and keep event id generation deterministic.
4. Remove `/api/inngest` route mounting.
5. Replace Inngest-backed tests with direct workflow executor tests.
6. Remove Inngest dependencies and local docker service configuration.

## Risks and mitigations

- **Risk:** Loss of Inngest durability/retry semantics.
  - **Mitigation:** Preserve idempotent DB run-claim guards and job status transitions.
- **Risk:** Package registry limitations for new dependencies.
  - **Mitigation:** Implement the cutover without introducing new package dependencies.

## Validation

Run formatting, linting, and tests through the repository make targets before finalizing.
