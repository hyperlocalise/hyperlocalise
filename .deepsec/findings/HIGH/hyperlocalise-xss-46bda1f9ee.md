# [HIGH] Provider translation-memory URLs are stored without scheme validation

**File:** [`apps/hyperlocalise-web/src/lib/providers/external-tms-tm-sync.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/lib/providers/external-tms-tm-sync.ts#L167) (lines 167)
**Project:** hyperlocalise
**Severity:** HIGH  •  **Confidence:** medium  •  **Slug:** `xss`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

The sync path copies provider-controlled `memory.externalUrl` directly into the translation-memory record at line 167. That value later flows through the memory API/list mapping and is rendered as an `<a href={memory.externalUrl} target="_blank">` link in the authenticated UI. If a malicious or compromised TMS/API endpoint returns a `javascript:`, `data:`, or other unsafe URL, Hyperlocalise will persist it and present it to users as a provider link, enabling stored link-based XSS when clicked. The current code does not constrain the URL to `https?` or to known provider hostnames before persistence.

## Recommendation

Normalize and validate provider URLs before storing or rendering them. Allow only `https:`/`http:` URLs, preferably with provider-specific host allowlists, and drop or replace invalid values. Use a shared safe external-link helper so all provider links enforce the same policy.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-23)
