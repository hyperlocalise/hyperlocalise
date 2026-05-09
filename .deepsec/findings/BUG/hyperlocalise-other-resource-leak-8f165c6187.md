# [BUG] Embla reInit listener is not removed

**File:** [`apps/hyperlocalise-web/src/components/ui/carousel.tsx`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/components/ui/carousel.tsx#L98-L102) (lines 98, 101, 102)
**Project:** hyperlocalise
**Severity:** BUG  •  **Confidence:** medium  •  **Slug:** `other-resource-leak`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

The carousel effect registers `onSelect` for both `reInit` and `select`, but the cleanup only unregisters the `select` listener. If the Embla API instance changes or the carousel is unmounted while the API remains reachable, the stale `reInit` listener can retain component state setters and cause duplicate state updates or a small memory leak on later reinitializations. This is not a security vulnerability.

## Recommendation

Unregister the `reInit` listener in the cleanup as well: `api.off("reInit", onSelect); api.off("select", onSelect);`.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-04)
