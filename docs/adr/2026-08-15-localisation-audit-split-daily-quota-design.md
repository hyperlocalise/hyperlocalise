# Localisation audit split daily quota

## Date

2026-08-15

## Context

Public localisation audits share one rolling 24h system-wide cap of 10
runs. Scheduled audits (leaderboard seeding and similar internal starts)
compete with visitor form submissions for the same slots, so a busy
seed day can block users and a busy visitor day can block the schedule.

## Decision

Keep a shared per-bucket size via `LOCALISATION_AUDIT_DAILY_RUN_LIMIT`,
but count **user** and **scheduled** runs separately.

| Bucket | Cap | Who consumes it |
|--------|-----|-----------------|
| `user` | `LOCALISATION_AUDIT_DAILY_RUN_LIMIT` | `POST /api/localisation-audit` and other visitor starts |
| `scheduled` | `LOCALISATION_AUDIT_DAILY_RUN_LIMIT` | Cron / internal starts that pass `runSource: "scheduled"` |

Rules:

1. Persist `run_source` on `localisation_audits` (`user` \| `scheduled`).
2. A claim that consumes a daily slot asserts and counts only against its
   own `runSource`.
3. Same-day failed/stale retries still do not consume a slot and keep the
   prior `run_source`.
4. A 24h re-run consumes the initiator’s bucket and updates `run_source`.
5. Existing rows default to `user`.

## Alternatives

1. **Raise the shared cap to 20** — simpler, but one path can still starve
   the other.
2. **Separate Redis counters without a column** — avoids a migration, but
   reclaim / same-day retry rules stay tied to audit rows, so the column
   stays the source of truth for “what counted today.”

## Testing

- User quota exhaustion still returns 429 for the public start route.
- Exhausting the user bucket does not block a scheduled claim, and the
  reverse.
- Same-day retry after a failed user run still skips another user slot.

## Update

2026-08-16: raised `LOCALISATION_AUDIT_DAILY_RUN_LIMIT` from 10 to 20.
User and scheduled buckets still split; each now allows 20 quota-consuming
runs per rolling 24h.
