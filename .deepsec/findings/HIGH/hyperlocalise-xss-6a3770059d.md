# [HIGH] Arbitrary chat uploads are later served inline as same-origin content

**File:** [`apps/hyperlocalise-web/src/api/routes/conversation/conversation.route.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/api/routes/conversation/conversation.route.ts#L263-L296) (lines 263, 275, 276, 292, 296)
**Project:** hyperlocalise
**Severity:** HIGH  •  **Confidence:** high  •  **Slug:** `xss`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

The reply upload path accepts any non-empty File, trusts the browser-supplied filename and contentType, stores the bytes, and records a same-origin /api/orgs/:slug/files/:id attachment URL. The file download route then returns the stored object with its stored Content-Type and Content-Disposition: inline. An attacker in the organization can upload an HTML/SVG file with script content and share or surface the authenticated file URL; when another member opens it, the script runs on the application origin with that member's session.

## Recommendation

Restrict chat uploads to safe translation/reference formats, validate MIME type by content instead of trusting file.type, and serve user uploads as attachment or application/octet-stream with X-Content-Type-Options: nosniff. Consider serving untrusted files from an isolated download origin.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-05)
