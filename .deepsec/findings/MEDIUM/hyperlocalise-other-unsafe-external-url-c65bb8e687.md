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

## Revalidation

**Verdict:** true-positive

The original file has been moved to apps/hyperlocalise-web/src/lib/providers/sync/organization-external-tms-files.ts, but the current implementation still accepts externalUrl on ExternalTmsFileInput and writes input.externalUrl directly on both insert and update. The external_tms_files.external_url column is plain text, and I did not find validation in upsertExternalTmsFile or in syncExternalTmsFileKeys before persistence. A concrete input path exists in the Phrase file fetcher: it stores upload.url from the provider response when present, while Crowdin and other adapters similarly pass provider web URLs through their fetcher outputs. Some read paths mitigate this, for example getProjectFileDetail uses sanitizeExternalUrl before returning provider.externalUrl, and that sanitizer only allows http/https URLs without credentials. However, listProjectFilesForProject still returns provider.externalUrl as file.externalUrl directly, and resolveProviderSourceFiles also returns schema.externalTmsFiles.externalUrl directly. The job detail API enriches provider-backed jobs with those providerSourceFiles, and the authenticated job provider detail UI renders file.externalUrl as a target=_blank provider link. A malicious or compromised provider response can therefore persist a javascript:, data:, or deceptive external URL and have it returned to authenticated users, with at least one UI path rendering it as an Open link. rel="noreferrer" reduces opener abuse but does not validate the scheme or prevent navigation to a malicious/deceptive URL.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-31)
