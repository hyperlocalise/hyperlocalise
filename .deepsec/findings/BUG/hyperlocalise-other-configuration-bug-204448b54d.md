# [BUG] Configured Smartling base URL is ignored during translation memory sync

**File:** [`apps/hyperlocalise-web/src/lib/providers/adapters/smartling/smartling-translation-memory-fetcher.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/lib/providers/adapters/smartling/smartling-translation-memory-fetcher.ts#L12-L26) (lines 12, 17, 26)
**Project:** hyperlocalise
**Severity:** BUG  •  **Confidence:** high  •  **Slug:** `other-configuration-bug`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

The ExternalTmsTranslationMemoryFetcher input includes the stored credential, but this fetcher does not use it. Account resolution and SmartlingApiClient construction both omit credential.baseUrl, so translation memory sync always targets the default Smartling API host even when the organization configured a custom/region-specific endpoint.

## Recommendation

Destructure credential from the fetcher input and pass authBaseUrl: credential.baseUrl ?? undefined to resolveSmartlingAccountUid and SmartlingApiClient. Cover non-null baseUrl behavior in tests.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-31)
