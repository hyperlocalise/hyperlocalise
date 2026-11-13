# CAT filtered export and search preserve

## Problem

1. Changing target locale remounts the CAT workspace (key includes locale), which resets local `queueFilter` and segment `search` state.
2. Job CAT already puts `queueFilter` in the URL for the initial load, but UI changes do not write back to the URL, and `search` is never URL-backed.
3. Users need to download the current filtered queue as CSV, TMX, XLF, or XLIFF.

## Decision

### Preserve filter and search in the URL

- Treat `queueFilter` and `search` as first-class CAT query params (same idea as `locale` / `targetLocale`).
- Sync UI changes into the URL with `router.replace`.
- When changing locale (or file), clone the current search params and only update the locale (or file) fields so filter and search survive navigation and remount.
- Pass `initialSearch` and `initialQueueFilter` from the page into `useCatSegmentQuery`.

### Download filtered view

- Add a **Download** button (dropdown) on the queue toolbar.
- Browser collects filtered queue rows via `GET .../files/detail/cat/queue` and per-segment targets, then `POST /api/go-svc/v1/editor-export/filtered/serialize` (`csv|tmx|xlf|xliff|xlsx`).
- No dedicated Hono export route; serialization runs in go-svc with the user session cookie via `/api/go-svc/...`.
- Cap export size (5_000 segments) consistent with other project translation exports.
- `xlf` and `xliff` share XLIFF 1.2 content; only the filename extension differs.

## Verification

- Unit tests for URL helpers, client row collection, Go serializers, and go-svc handler.
- User-facing behavior documented in `docs/platform/cat.mdx` (Download filtered view).
- `vp test` and `vp check --fix` in `apps/hyperlocalise-web`.
