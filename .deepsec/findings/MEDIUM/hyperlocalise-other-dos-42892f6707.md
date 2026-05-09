# [MEDIUM] Webhook buffers unauthenticated request bodies before signature rejection

**File:** [`apps/hyperlocalise-web/src/api/routes/workos-webhook.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/api/routes/workos-webhook.ts#L211-L216) (lines 211, 213, 214, 215, 216)
**Project:** hyperlocalise
**Severity:** MEDIUM  •  **Confidence:** medium  •  **Slug:** `other-dos`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

The public WorkOS webhook reads the entire request body with c.req.text() before applying any route-local size limit. Invalidly signed requests still force the server to buffer the body and compute an HMAC over it, so repeated large POSTs can consume memory and CPU without authentication. Signature verification happens before side effects, but it does not mitigate this resource-exhaustion path.

## Recommendation

Add a route-local bodyLimit before reading the body, set the limit to the largest expected WorkOS payload, and consider rate limiting invalid webhook attempts.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-04-06)
