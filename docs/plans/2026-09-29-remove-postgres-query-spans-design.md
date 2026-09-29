# Remove Go service PostgreSQL query spans

## Decision

Remove the Go service's custom `otelpgx` PostgreSQL query-span instrumentation in preparation for using PlanetScale Extensions later.

## Scope

- Keep `internal/postgres.NewPool` as the shared pool-construction boundary.
- Construct pools with the standard `pgxpool` behavior and leave the connection tracer unset.
- Remove the span-specific integration test and the unused `otelpgx` dependency from Go and Bazel metadata.
- Preserve the Go service's existing database error annotation helper because it does not create telemetry spans.

## Verification

Run formatting, linting, and the full Go test suite. The pool test should continue to verify parsed connection settings while asserting that no PostgreSQL tracer is configured.
