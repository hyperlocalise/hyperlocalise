# [BUG] Organization selector can loop on stale active-organization cookie

**File:** [`apps/hyperlocalise-web/src/app/auth/select-organization/page.tsx`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/app/auth/select-organization/page.tsx#L8) (lines 8)
**Project:** hyperlocalise
**Severity:** BUG  •  **Confidence:** high  •  **Slug:** `other-auth-flow-lockout`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

The selector calls requireAppAuthContext() without telling it to ignore the stored active organization. Tracing that helper shows it reads hl_active_org_slug and redirects to /auth/access-denied on organization_access_denied. If a user is removed from their previously active organization but still belongs to another, this page redirects before listing the remaining organizations; the access-denied page links back here, creating a lockout loop until the cookie is cleared.

## Recommendation

Make the selector resolve the signed-in user's memberships without applying the stored active-organization slug, or clear/ignore the stale cookie when organization_access_denied occurs on this page.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-04-20)
