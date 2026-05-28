# [MEDIUM] Authorization codes can be replayed by appending extra dot segments

**File:** [`apps/hyperlocalise-web/src/api/auth/mcp.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/api/auth/mcp.ts#L111-L142) (lines 111, 112, 139, 142)
**Project:** hyperlocalise
**Severity:** MEDIUM  •  **Confidence:** high  •  **Slug:** `jwt-handling`

## Owners

**Suggested assignee:** `206951365+cursor[bot]@users.noreply.github.com` _(via last-committer)_

## Finding

parseAuthorizationCode splits the code with code.split(".") and destructures only the first two segments, so a valid code like payload.signature is still accepted as payload.signature.anything. markAuthorizationCodeUsed then hashes the full submitted string, so each suffixed variant has a different codeHash and bypasses the used_authorization_codes primary key. In the token endpoint, that accepted payload is exchanged for fresh access and refresh tokens, breaking the intended single-use authorization-code guarantee.

## Recommendation

Reject authorization codes unless they contain exactly two dot-separated parts, and hash a canonical code representation for replay protection. Consider validating the decoded payload with a Zod schema before use.

## Recent committers (`git log`)

- cursor[bot] <206951365+cursor[bot]@users.noreply.github.com> (2026-05-25)
- Minh Cung <cungminh2710@gmail.com> (2026-05-24)
