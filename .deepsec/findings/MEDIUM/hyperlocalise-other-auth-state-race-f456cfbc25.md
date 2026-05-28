# [MEDIUM] Stale WorkOS membership events can restore revoked access

**File:** [`apps/hyperlocalise-web/src/api/routes/workos-webhook/workos-webhook.route.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/api/routes/workos-webhook/workos-webhook.route.ts#L143-L229) (lines 143, 180, 215, 225, 229)
**Project:** hyperlocalise
**Severity:** MEDIUM  •  **Confidence:** medium  •  **Slug:** `other-auth-state-race`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

The webhook handler applies organization_membership.deleted by deleting the local membership, but any later-delivered organization_membership.created or organization_membership.updated event blindly calls syncWorkosIdentity and recreates/upserts that membership. There is no provider event id, event created_at, per-membership version, tombstone, or live WorkOS state check before applying the stale create/update path. Since resolveApiAuthContextFromSession authorizes users from these local membership rows, an older WorkOS membership update delivered or retried after a deletion can restore organization access for a removed user. The same ordering issue can also drop legitimate membership creation when the membership event arrives before the local user or organization rows, because the handler returns early and later user/org events do not backfill the membership.

## Recommendation

Make WorkOS membership processing order-aware and idempotent. Preserve and store provider event ids/timestamps, reject stale membership events, and record deletion tombstones or fetch current membership state from WorkOS before recreating a deleted membership. For missing user/org dependencies, retry or fetch/upsert the missing dependency instead of permanently dropping the membership event.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-27)
- Muen Yu <22992947+MuenYu@users.noreply.github.com> (2026-05-19)
