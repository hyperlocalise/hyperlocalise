# [MEDIUM] Provider file links are stored without URL scheme validation

**File:** [`apps/hyperlocalise-web/src/lib/providers/organization-external-tms-files.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/lib/providers/organization-external-tms-files.ts#L31-L224) (lines 31, 130, 155, 224)
**Project:** hyperlocalise
**Severity:** MEDIUM  •  **Confidence:** medium  •  **Slug:** `other-unsafe-external-url`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

ExternalTmsFileInput accepts externalUrl and upsertExternalTmsFile persists it unchanged on both insert and update. These records are later returned to project file APIs and rendered as provider links in the authenticated UI. A malicious or compromised provider response, or a tenant-controlled custom TMS endpoint, could persist a scriptable or deceptive URL such as a javascript: or data: URL and present it to other organization users as an Open in provider link.

## Recommendation

Validate externalUrl before storing or returning it. Allow only http and https URLs, preferably scoped to known provider web domains for each provider kind, and store null for invalid values. Keep rel="noopener noreferrer" on external links.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-23)
