# [HIGH] Stored files are served inline on the app origin

**File:** [`apps/hyperlocalise-web/src/api/routes/file/file.route.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/api/routes/file/file.route.ts#L60-L66) (lines 60, 61, 62, 65, 66)
**Project:** hyperlocalise
**Severity:** HIGH  •  **Confidence:** high  •  **Slug:** `xss`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

The route streams stored file bytes with the stored content type and sets Content-Disposition to inline. HTML is an accepted translation source format elsewhere in the app, so an authenticated user can upload a malicious .html file and send another org member the /api/orgs/:organizationSlug/files/:fileId URL. When opened, the browser can execute the HTML/JavaScript in the Hyperlocalise origin with the victim's cookies and app privileges.

## Recommendation

Serve untrusted user files from an isolated cookieless domain, or force attachment for active content. Also add X-Content-Type-Options: nosniff and consider a restrictive sandbox/CSP for previewable content.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-04)
