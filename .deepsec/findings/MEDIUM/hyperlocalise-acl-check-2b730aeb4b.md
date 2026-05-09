# [MEDIUM] API key inventory is visible to non-admin organization members

**File:** [`apps/hyperlocalise-web/src/app/(authenticated)/org/[organizationSlug]/settings/_components/api-keys-page-content.tsx`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/app/(authenticated)/org/[organizationSlug]/settings/_components/api-keys-page-content.tsx#L67-L205) (lines 67, 191, 199, 203, 205)
**Project:** hyperlocalise
**Severity:** MEDIUM  •  **Confidence:** medium  •  **Slug:** `acl-check`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

The API keys settings page fetches `/api/orgs/:organizationSlug/api-keys` and renders active key names, prefixes, permissions, creation timestamps, and last-used timestamps. The backing Hono route is protected by WorkOS session auth and organization scoping, but its GET handler has no owner/admin role check, while create and revoke do enforce owner/admin. A low-privilege member of the same organization can therefore enumerate API key metadata that appears intended for API key administrators.

## Recommendation

Require owner/admin membership on the API key list endpoint as well as create/revoke, and gate or hide this settings page for non-admin members. Add a regression test that a member receives 403 for GET `/api/orgs/:organizationSlug/api-keys`.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-09)
