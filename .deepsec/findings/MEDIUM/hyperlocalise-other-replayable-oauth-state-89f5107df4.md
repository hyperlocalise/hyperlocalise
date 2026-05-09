# [MEDIUM] Reusable GitHub install state can overwrite an organization installation

**File:** [`apps/hyperlocalise-web/src/app/auth/github/callback/page.tsx`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/app/auth/github/callback/page.tsx#L18-L93) (lines 18, 28, 55, 63, 73, 84, 93)
**Project:** hyperlocalise
**Severity:** MEDIUM  •  **Confidence:** medium  •  **Slug:** `other-replayable-oauth-state`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

The callback has no current WorkOS session or admin-role check and relies only on verifyGitHubState(). That state is just slug:timestamp:HMAC, expires after one hour, and is not one-time or bound to the browser/session that requested the install URL. After verification, the handler persists the user-controlled installation_id to githubInstallations. The attempted GitHub getInstallation() validation is swallowed on error, and repository sync errors are also swallowed, so a replayed or leaked state can be used to relink or break the organization's GitHub installation with an attacker-controlled or bogus numeric installation id. This can deny service to the existing integration and creates a stale authorization window after an admin is removed.

## Recommendation

Store GitHub install state server-side as a random nonce with org id, initiating user id, expiry, and consumed-at fields. On callback, require a current authenticated owner/admin session for that org or consume the one-time nonce atomically, then validate installation_id strictly and abort if GitHub getInstallation() fails before writing anything.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-04)
