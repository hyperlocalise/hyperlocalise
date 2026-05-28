# [BUG] Translation memory key cap is applied after all keys are downloaded

**File:** [`apps/hyperlocalise-web/src/lib/providers/lokalise/lokalise-translation-memory-fetcher.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/lib/providers/lokalise/lokalise-translation-memory-fetcher.ts#L36-L65) (lines 36, 37, 64, 65)
**Project:** hyperlocalise
**Severity:** BUG  •  **Confidence:** high  •  **Slug:** `other-resource-exhaustion`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

`client.listKeys(projectId, { includeTranslations: true })` retrieves every paginated Lokalise key with translations before `keys.slice(0, LOKALISE_TM_SYNC_MAX_KEYS)` is applied. The intended cap therefore does not limit network, memory, or runtime cost for large projects or malicious compatible APIs.

## Recommendation

Add a max-key or max-page option to `LokaliseApiClient.listKeys` and stop pagination once the translation-memory sync cap is reached.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-24)
