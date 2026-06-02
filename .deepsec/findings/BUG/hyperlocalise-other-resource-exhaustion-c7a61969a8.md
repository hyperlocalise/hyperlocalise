# [BUG] Unbounded concurrent Crowdin TM segment sync

**File:** [`apps/hyperlocalise-web/src/lib/providers/adapters/crowdin/crowdin-tm-fetcher.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/lib/providers/adapters/crowdin/crowdin-tm-fetcher.ts#L26-L63) (lines 26, 45, 63)
**Project:** hyperlocalise
**Severity:** BUG  •  **Confidence:** medium  •  **Slug:** `other-resource-exhaustion`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

The insecure-crypto scanner finding is a false positive: this file does not perform cryptography, and provider credential crypto elsewhere uses AES-256-GCM. However, `fetchCrowdinTranslationMemories` loads all accessible Crowdin translation memories, filters them, then runs `Promise.all(scoped.map(...))`. Each mapped task calls `listTranslationMemorySegments`, which paginates provider data until enough entries are built. A large Crowdin account or Crowdin-compatible custom endpoint can cause one authenticated sync to start many simultaneous paginated network fetches and entry-building operations, risking worker/socket/memory pressure, provider rate-limit failures, and degraded API availability. The route is authenticated and project-scoped, so this is a reliability bug rather than an unauthenticated security vulnerability.

## Recommendation

Replace the unbounded `Promise.all` with the repo's `mapWithConcurrency` helper using a small concurrency limit. Consider adding a maximum number of memories/pages per sync, request cancellation, and an overlapping-sync guard or rate limit per organization/project.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-31)
