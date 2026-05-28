# [MEDIUM] Existing-user invites bypass WorkOS acceptance and revocation

**File:** [`apps/hyperlocalise-web/src/api/routes/member/member.route.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/api/routes/member/member.route.ts#L104-L473) (lines 104, 118, 136, 289, 450, 473)
**Project:** hyperlocalise
**Severity:** MEDIUM  •  **Confidence:** high  •  **Slug:** `auth-bypass`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

When the invited email already belongs to a local user, inviteOrganizationMember reuses that user's real WorkOS user id instead of creating an invited placeholder, then inserts an organization_memberships row before the WorkOS invitation is accepted. Since API auth is based on local membership rows for the requested organization slug, that existing user can access the workspace immediately without a WorkOS org membership. If the workspace later removes the pending invite, the delete path only revokes WorkOS invitations for placeholder workosUserIds, so an existing user's still-pending WorkOS invitation is left active and can recreate access when accepted.

## Recommendation

Represent invite state separately from active membership, or mark memberships pending and exclude them from auth until WorkOS confirms organization_membership.created. Store the WorkOS invitation id and revoke it for all pending invite removals, including existing local users.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-25)
