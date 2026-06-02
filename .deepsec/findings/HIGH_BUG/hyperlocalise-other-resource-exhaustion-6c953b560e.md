# [HIGH_BUG] Content pull downloads the full provider bundle without a size cap

**File:** [`apps/hyperlocalise-web/src/lib/providers/adapters/lokalise/lokalise-content-puller.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/lib/providers/adapters/lokalise/lokalise-content-puller.ts#L120-L130) (lines 120, 126, 127, 130)
**Project:** hyperlocalise
**Severity:** HIGH_BUG  •  **Confidence:** high  •  **Slug:** `other-resource-exhaustion`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

During a content pull, the code requests a Lokalise export bundle and then downloads the entire `bundleUrl` into memory only to record its `byteLength`. There is no maximum content length, streaming limit, or abort timeout at this call site. A very large provider project or attacker-controlled custom provider endpoint can make this best-effort artifact step allocate excessive memory or hang a worker, even though the downloaded bytes are not otherwise needed for the returned translation units.

## Recommendation

Avoid downloading the bundle when only metadata is needed, use a HEAD/metadata endpoint if available, or stream the response with a strict byte limit and timeout. Treat oversized artifacts as a recoverable best-effort failure.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-31)
