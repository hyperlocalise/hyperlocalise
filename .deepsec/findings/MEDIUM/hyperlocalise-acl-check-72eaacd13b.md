# [MEDIUM] GitHub integration metadata is exposed without integration read authorization

**File:** [`apps/hyperlocalise-web/src/app/(authenticated)/org/[organizationSlug]/integrations/_components/github-integration-row.tsx`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/app/(authenticated)/org/[organizationSlug]/integrations/_components/github-integration-row.tsx#L70-L271) (lines 70, 88, 271)
**Project:** hyperlocalise
**Severity:** MEDIUM  •  **Confidence:** high  •  **Slug:** `acl-check`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

The row fetches the GitHub installation on mount and then fetches repositories whenever an installation exists, without checking whether the current user has integration-read access. Tracing the Hono route shows the GET handlers are protected only by WorkOS session auth and organization scoping; they do not enforce an integrations:read capability. The repositories response includes private repository names, repository IDs, default branches, and enabled state, so a low-privileged organization member can enumerate GitHub integration metadata via this component or direct API calls.

## Recommendation

Gate the GitHub installation GET routes with an integrations:read check, return only sanitized fields needed by authorized readers, and disable these client queries unless the caller has read access.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-06-01)
