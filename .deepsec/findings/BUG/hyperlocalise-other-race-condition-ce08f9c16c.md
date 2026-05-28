# [BUG] Placeholder user cleanup can race with concurrent invites

**File:** [`apps/hyperlocalise-web/src/api/routes/member/member.route.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/api/routes/member/member.route.ts#L168-L495) (lines 168, 175, 176, 217, 495)
**Project:** hyperlocalise
**Severity:** BUG  •  **Confidence:** medium  •  **Slug:** `other-race-condition`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

cleanupInvitedPlaceholderUser checks for remaining memberships and then deletes the user in a separate operation. If another invite for the same placeholder user is created after the empty check but before the delete, the users delete can cascade and remove the newly inserted membership, losing a valid pending invite.

## Recommendation

Perform cleanup in a transaction with an appropriate user-row lock and recheck, or use a single conditional DELETE with NOT EXISTS so the user is only deleted if no memberships exist at delete time.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-25)
