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

## Revalidation

**Verdict:** true-positive

The route performs authentication, verifies the conversation belongs to the active organization, requires `source === 'chat_ui'`, and now requires translation attachments before streaming. Those checks prevent cross-tenant access, but they do not limit how often a valid user can invoke the model. Every accepted POST loads the interaction messages, creates a new conversation agent, calls `agent.stream`, and persists the model output in `onFinish`. I found no per-user or per-org rate limiter, no quota check, no idempotency token or latest-message binding, and no usage reservation for chat model calls. A regular authenticated member can create or use a chat conversation with attachments and repeatedly POST to the stream endpoint to trigger new OpenAI generations. Admin-only tool gating limits some side effects, but it does not prevent repeated model-cost consumption.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-27)
