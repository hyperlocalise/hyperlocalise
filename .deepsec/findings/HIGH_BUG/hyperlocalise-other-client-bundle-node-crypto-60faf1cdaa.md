# [HIGH_BUG] Node crypto helper is imported into a client component bundle

**File:** [`apps/hyperlocalise-web/src/lib/providers/provider-job-qa/build-finding-id.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/lib/providers/provider-job-qa/build-finding-id.ts#L1-L15) (lines 1, 15)
**Project:** hyperlocalise
**Severity:** HIGH_BUG  •  **Confidence:** high  •  **Slug:** `other-client-bundle-node-crypto`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

The helper imports createHash from node:crypto and calls it in buildFindingId. This file is imported by job-qa-findings-model.ts, whose attachFindingIds function is imported and executed by job-qa-findings-section.tsx, a "use client" component. next.config.ts does not configure a browser fallback for Node core modules. As a result, the QA findings client bundle can fail to build or fail at runtime when it tries to load node:crypto in the browser. This is not a cryptographic vulnerability, but it can break the QA findings UI or production builds for routes that include it.

## Recommendation

Move finding ID generation to a server-only path and pass IDs to the client, or replace this helper with a browser-safe deterministic SHA-256 implementation shared by server and client. If using Web Crypto, account for its async API; otherwise use a small pure JavaScript hash library and keep Node-only crypto helpers out of client import graphs.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-30)
