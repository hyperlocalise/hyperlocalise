# [HIGH] Provider project URLs are stored without URL-scheme sanitization

**File:** [`apps/hyperlocalise-web/src/lib/providers/sync/organization-external-tms-projects.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/lib/providers/sync/organization-external-tms-projects.ts#L36-L55) (lines 36, 55)
**Project:** hyperlocalise
**Severity:** HIGH  •  **Confidence:** medium  •  **Slug:** `xss`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

upsertOrganizationExternalTmsProject stores input.externalProjectUrl directly on insert and update. That value is sourced from external TMS provider data, including Crowdin's project.webUrl, and project UI later renders project.externalProjectUrl directly into anchor href attributes. Other provider asset types use sanitizeExternalUrl before rendering, but project records do not. A malicious or compromised provider response, or a malicious custom provider endpoint configured by an authorized user, could persist a javascript: or otherwise unsafe URL that executes when another user clicks "Open in provider".

## Recommendation

Sanitize externalProjectUrl with the existing sanitizeExternalUrl helper before storing or before exposing project records to the client. Only allow http/https URLs, reject credentials, strip fragments, and add tests covering javascript: and credentialed URLs.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-31)
