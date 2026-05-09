# [MEDIUM] API key metadata is readable by non-admin organization members

**File:** [`apps/hyperlocalise-web/src/api/routes/api-key/api-key.route.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/api/routes/api-key/api-key.route.ts#L47-L101) (lines 47, 67, 71, 101)
**Project:** hyperlocalise
**Severity:** MEDIUM  •  **Confidence:** high  •  **Slug:** `acl-check`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

The route is protected by WorkOS session auth, but the GET handler does not enforce the owner/admin gate used by create and delete. Any authenticated member of an organization can request /api/orgs/:organizationSlug/api-keys and receive every API key record's id, name, prefix, permissions, lastUsedAt, revokedAt, and createdAt for that organization. The full secret is not returned, but key inventory and usage metadata are sensitive and can aid targeted abuse or rotation timing.

## Recommendation

Apply the same owner/admin role check to GET before selecting key records, or return only a deliberately non-sensitive aggregate to non-admin roles.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-05)
