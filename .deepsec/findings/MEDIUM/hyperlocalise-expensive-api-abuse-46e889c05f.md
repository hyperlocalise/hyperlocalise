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

## Revalidation

**Verdict:** true-positive

handleSlackImageAttachments obtains all image attachments, calls interpretSlackImageRequest with generateText, and then loops over every attachment. For each attachment, localizeImageAttachment calls getImageAttachmentData, reads the full image buffer, and passes it to regenerateImageFromAttachment, which uses OpenAI image generation. There is no attachment count cap, byte-size check, timeout, quota reservation, or per-user/per-org rate limit in this file or the lower-level image-localization/image-generation helpers. The Slack webhook route has a 1 MB event body limit, but Slack file data is fetched through attachment data/fetchData later, so that body cap does not bound fetched image bytes. The code performs the membership lookup in bot.ts before reaching this image path, so the attacker must map to a Hyperlocalise organization member, but any such member can trigger the work. A member can repeatedly send messages with many image attachments and a target locale, causing one LLM intent extraction and one image generation call per attachment without app-level abuse controls. The finding is therefore exploitable as resource/cost abuse.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-21)
