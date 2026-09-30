# Bounded content editor loading

The side-by-side and multilingual editors will share a translation cache and a bounded batch read API. The user approved this design on 2026-09-25.

## Decisions

- Fetch bounded segment identities across visible locales in one request. Native translations use set-based SQL in go-svc. Connected providers retain their existing Hono transport and are outside this change.
- Include initial translations in source page responses. Prefetch neighboring rows and locale columns and cancel obsolete reads.
- Retain a small source-page window and enforce a byte budget on clean cached content. Reload evicted pages in either direction without changing the user's scroll anchor.
- Keep server translations in one cache. MobX contains UI state and local edits. Dirty, saving, and failed edits survive eviction.
- A successful save updates the shared cache. Reads started before a write cannot overwrite that write.

Valkey is not introduced: live indexed reads avoid invalidation across existing write paths. A PostgreSQL materialized view is unnecessary for this change: native translations already have a key/locale index. A provider mirror is a separate future architecture if grouped provider reads remain too slow.

## Validation

Test batch limits and tenant scoping, provider call grouping, cancellation and stale-read protection, cache eviction with pinned edits, backward pagination, and scroll anchoring. Run the web app's complete test and check commands. Runtime latency and heap improvements require representative browser profiling; request-count and retention tests establish deterministic bounds.
