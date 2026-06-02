# [MEDIUM] Authorization codes can be replayed by appending extra dot segments

**File:** [`apps/hyperlocalise-web/src/api/auth/mcp.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/api/auth/mcp.ts#L111-L142) (lines 111, 112, 139, 142)
**Project:** hyperlocalise
**Severity:** MEDIUM  •  **Confidence:** high  •  **Slug:** `jwt-handling`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

parseAuthorizationCode splits the code with code.split(".") and destructures only the first two segments, so a valid code like payload.signature is still accepted as payload.signature.anything. markAuthorizationCodeUsed then hashes the full submitted string, so each suffixed variant has a different codeHash and bypasses the used_authorization_codes primary key. In the token endpoint, that accepted payload is exchanged for fresh access and refresh tokens, breaking the intended single-use authorization-code guarantee.

## Recommendation

Reject authorization codes unless they contain exactly two dot-separated parts, and hash a canonical code representation for replay protection. Consider validating the decoded payload with a Zod schema before use.

## Revalidation

**Verdict:** true-positive

`parseAuthorizationCode` still destructures `const [encodedPayload, signature] = code.split(".")`, so it ignores any third or later dot-separated segment. Signature verification is performed only over the first encoded payload segment, so `payload.signature.anything` is accepted when `payload.signature` was valid. The `/mcp/token` handler then validates the client ID, redirect URI, and PKCE challenge against that parsed payload. Replay prevention happens in `markAuthorizationCodeUsed`, but that hashes the full submitted code string. The first exchange of `payload.signature` inserts one hash, while a later exchange of `payload.signature.suffix` computes a different hash and bypasses the `used_authorization_codes` primary key. The existing test only rejects an exact second use of the same string; it does not cover suffixed variants. An attacker who has both the authorization code and matching PKCE verifier, such as a malicious registered OAuth client, can mint multiple MCP access and refresh token sessions during the five-minute code lifetime. This breaks the intended single-use authorization-code property.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-06-01)
- cursor[bot] <206951365+cursor[bot]@users.noreply.github.com> (2026-05-25)
