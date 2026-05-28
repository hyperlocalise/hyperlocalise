# [MEDIUM] Slack image localization lacks rate, size, and count limits before OpenAI calls

**File:** [`apps/hyperlocalise-web/src/lib/agents/slack/image-attachments.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/lib/agents/slack/image-attachments.ts#L162-L176) (lines 162, 173, 176)
**Project:** hyperlocalise
**Severity:** MEDIUM  •  **Confidence:** high  •  **Slug:** `expensive-api-abuse`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

handleSlackImageAttachments interprets every image request with generateText and then loops over all image attachments, calling localizeImageAttachment for each one. That path sends image data to the OpenAI image generation pipeline, but this file does not enforce an attachment count limit, image byte-size limit, per-user/org rate limit, quota reservation, or timeout. Any authorized Slack member can repeatedly send image attachments to consume expensive image-generation capacity and memory.

## Recommendation

Enforce per-message image count and byte-size caps before reading attachment data, add per-user/org rate limits and billing/quota reservation before OpenAI calls, and fail closed when limits are exceeded.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-21)
