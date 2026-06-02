# [MEDIUM] Stale WorkOS reconcile can restore a revoked membership

**File:** [`apps/hyperlocalise-web/src/api/auth/workos-membership-reconcile.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/api/auth/workos-membership-reconcile.ts#L170-L335) (lines 170, 200, 244, 301, 321, 335)
**Project:** hyperlocalise
**Severity:** MEDIUM  •  **Confidence:** medium  •  **Slug:** `other-auth-race`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

Membership reconciliation reads the authoritative WorkOS membership list, then later upserts each listed membership into the local database and only afterwards revokes local memberships missing from that earlier snapshot. This sequence is not serialized with WorkOS webhook revocation. If an organization_membership.deleted webhook deletes a local membership after the reconcile has fetched the remote list but before the reconcile reaches syncWorkosIdentity, the stale reconcile can reinsert the just-revoked membership and then mark reconciliation fresh. The user can retain local access until the next successful full reconcile, because session auth may skip reconciliation while the fresh timestamp is within WORKOS_MEMBERSHIP_RECONCILE_TTL_MS. A user being removed could increase the race likelihood by repeatedly triggering session bootstrap/reconcile around the time of removal.

## Recommendation

Serialize membership sync and revocation per WorkOS user/organization, for example with a database advisory lock also used by webhook deletion handling, held before fetching and applying the remote membership snapshot. Alternatively store webhook event timestamps/tombstones and reject stale upserts older than the latest deletion, or re-fetch each membership before upserting when a concurrent deletion may have occurred.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-31)
- cursor[bot] <206951365+cursor[bot]@users.noreply.github.com> (2026-05-31)
