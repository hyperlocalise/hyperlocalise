# [MEDIUM] Streaming LLM endpoint has no abuse controls

**File:** [`apps/hyperlocalise-web/src/api/routes/conversation/chat-stream.route.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/api/routes/conversation/chat-stream.route.ts#L129-L149) (lines 129, 134, 149)
**Project:** hyperlocalise
**Severity:** MEDIUM  •  **Confidence:** high  •  **Slug:** `expensive-api-abuse`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

Any authenticated org member can repeatedly POST to the chat stream endpoint, causing a fresh OpenAI stream and possible tool execution each time. There is no route-local rate limit, quota, idempotency check against the last user message, or abort/budget control around streamText, and onFinish persists every response. A compromised or low-privilege account can drive unbounded model and tool costs.

## Recommendation

Add per-user and per-organization rate limits/quotas, bind generation to a specific latest user message id so duplicate requests are idempotent, and pass cancellation/time-budget controls to the LLM call and long-running tools.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-05)
