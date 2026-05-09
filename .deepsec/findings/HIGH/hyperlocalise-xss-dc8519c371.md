# [HIGH] Uploaded translation files can be served as same-origin HTML

**File:** [`apps/hyperlocalise-web/src/api/routes/chat-request/chat-request.route.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/api/routes/chat-request/chat-request.route.ts#L95-L145) (lines 95, 96, 97, 120, 121, 122, 143, 144, 145)
**Project:** hyperlocalise
**Severity:** HIGH  •  **Confidence:** high  •  **Slug:** `xss`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

The upload route validates only the filename format, then stores the client-controlled file.type as the stored content type and creates same-origin attachment URLs. Because HTML is a supported translation source format, an authenticated org member can upload an .html file with Content-Type text/html; the file download route later serves stored files inline with that content type. If another org member opens the attachment URL, attacker-controlled script can execute on the app origin.

## Recommendation

Do not serve user uploads inline from the app origin. Force attachment disposition or serve from an isolated origin, add X-Content-Type-Options: nosniff, and normalize risky source formats such as HTML/MDX/SVG/XML to text/plain or application/octet-stream unless they are sanitized.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-05)
