# [HIGH] Provider glossary URLs are persisted without scheme validation

**File:** [`apps/hyperlocalise-web/src/lib/providers/organization-external-tms-glossaries.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/lib/providers/organization-external-tms-glossaries.ts#L70-L95) (lines 70, 95)
**Project:** hyperlocalise
**Severity:** HIGH  •  **Confidence:** medium  •  **Slug:** `xss`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

The glossary upsert stores `input.externalUrl` directly on insert and update at lines 70 and 95. This value originates from external TMS glossary sync data and later flows through the glossary API/list mapping into an authenticated UI link rendered as `<a href={glossary.externalUrl} target="_blank">`. Without scheme or host validation, a malicious or compromised provider response can persist a `javascript:`, `data:`, or similar unsafe URL that executes when a user opens the provider link.

## Recommendation

Validate and canonicalize `externalUrl` before storing it. Accept only safe schemes such as `https:`/`http:` and, where possible, enforce provider-specific host allowlists. Treat invalid provider URLs as `null` and centralize this check in a shared provider URL sanitizer.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-23)
