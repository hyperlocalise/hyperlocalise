# [BUG] Configured Smartling base URL is ignored during live glossary search

**File:** [`apps/hyperlocalise-web/src/lib/providers/adapters/smartling/smartling-glossary-matcher.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/lib/providers/adapters/smartling/smartling-glossary-matcher.ts#L11-L33) (lines 11, 20, 33)
**Project:** hyperlocalise
**Severity:** BUG  •  **Confidence:** high  •  **Slug:** `other-configuration-bug`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

The matcher receives the provider credential through the ExternalTmsGlossaryMatcher contract, but this implementation does not destructure or use it. resolveSmartlingAccountUid is called without authBaseUrl, and SmartlingApiClient is constructed with only secretMaterial, so live glossary search always uses the default Smartling API host. Other Smartling sync paths pass credential.baseUrl through, so organizations configured with a custom/region-specific Smartling endpoint can have glossary live search fail or contact the wrong Smartling endpoint.

## Recommendation

Destructure credential from the matcher input and pass authBaseUrl: credential.baseUrl ?? undefined to both resolveSmartlingAccountUid and SmartlingApiClient. Add a regression test with a non-null Smartling baseUrl.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-31)
