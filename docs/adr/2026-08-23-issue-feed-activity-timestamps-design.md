# Issue feed activity timestamps

## Context

The issue feed orders activities and comments by `created_at`. Activities created with a Node.js
timestamp can sort after a logically later comment whose timestamp comes from PostgreSQL. The two
processes do not necessarily have identical clocks. PostgreSQL's `now()` is not a suitable direct
replacement because it remains fixed for the duration of a transaction, causing sequential activity
inserts to tie.

## Decision

Every issue activity insert supplies PostgreSQL's `clock_timestamp()` as `created_at`. This keeps
activity and comment timestamps on the database clock while allowing sequential statements in one
transaction to receive advancing values. Issue creation and assignment no longer compute timestamps
in Node or add a synthetic millisecond to enforce their order.

This is implemented at each activity insert rather than by changing the column default. Explicit
values make the behavior apply immediately without a schema migration and prevent callers from
silently depending on the existing `now()` default.

## Testing

The existing feed service and route integration tests create an issue, add a comment, add a later
activity, and assert the unified SQL feed order. Creation-with-assignee coverage also verifies that
the two activities retain their statement order. The full web test and static-check suites protect
all activity-producing paths.
