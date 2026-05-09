# [HIGH] Extension-only file format allowlist enables same-origin stored XSS

**File:** [`apps/hyperlocalise-web/src/lib/translation/file-formats.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/lib/translation/file-formats.ts#L7-L95) (lines 7, 9, 76, 84, 87, 95)
**Project:** hyperlocalise
**Severity:** HIGH  •  **Confidence:** high  •  **Slug:** `xss`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

The format helpers accept files solely by filename extension, including active formats such as html and mdx. These helpers are used by upload/job routes as the acceptance gate, while stored files preserve the multipart Content-Type and the file download route serves stored content inline. An authenticated attacker can upload a filename that passes this allowlist, such as an .html file or a .json filename with text/html content type, then get same-origin script execution when another organization user opens the stored file URL.

## Recommendation

Do not use extension inference as a content-safety decision. Serve stored uploads as attachment or application/octet-stream with X-Content-Type-Options: nosniff, validate/normalize MIME types, and either remove active HTML/MDX from uploadable translation sources or sanitize and serve them from an isolated origin.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-05)
