# [BUG] Glossary sync ignores configured Smartling base URL

**File:** [`apps/hyperlocalise-web/src/lib/providers/smartling/smartling-glossary-fetcher.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/lib/providers/smartling/smartling-glossary-fetcher.ts#L6-L20) (lines 6, 7, 8, 9, 10, 20)
**Project:** hyperlocalise
**Severity:** BUG  •  **Confidence:** high  •  **Slug:** `other-logic-bug`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

ExternalTmsGlossaryFetcher inputs include the stored credential, but fetchSmartlingGlossaries destructures only secretMaterial, externalProjectId, and project, then creates SmartlingApiClient without passing credential.baseUrl. Organizations using a custom Smartling endpoint can sync projects/files/content through the configured endpoint, but glossary sync will authenticate and fetch against the default public Smartling API instead.

## Recommendation

Destructure credential and pass `authBaseUrl: credential.baseUrl ?? undefined` after applying the same centralized safe-base-url validation used for all Smartling client construction. Thread the validated base URL into resolveSmartlingAccountUid as well.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-24)
