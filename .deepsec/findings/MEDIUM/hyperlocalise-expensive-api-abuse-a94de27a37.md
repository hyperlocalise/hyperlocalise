# [MEDIUM] Email intent parsing sends unbounded user-controlled email text to OpenAI

**File:** [`apps/hyperlocalise-web/src/lib/agents/email/intent.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/lib/agents/email/intent.ts#L91-L139) (lines 91, 94, 100, 107, 132, 139)
**Project:** hyperlocalise
**Severity:** MEDIUM  •  **Confidence:** medium  •  **Slug:** `expensive-api-abuse`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

buildIntentPrompt includes the raw email subject and body, and generateText sends that prompt directly to the OpenAI-backed model. The email handler calls this for inbound messages before checking whether the email has supported attachments, and these calls have no local length cap, rate limit, timeout signal, or explicit output bound. A member, or anyone who can pass the email sender check, can submit many or very large emails and clarification replies to drive unnecessary LLM spend or tie up webhook processing.

## Recommendation

Reject unsupported or attachmentless emails before invoking the model where possible, cap or truncate subject/body text, add per-sender and per-organization rate limits or quotas, and pass explicit timeout and output limits to model calls.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-04)
