# CAT queue lazy-data boundary

## Decision

Keep the CAT queue response limited to segment-list data. Queue segments omit target translations, comment bodies, comment summaries, and repository context.

The CAT integration container receives the project's source locale and applies it while mapping queue segments into workspace state. The client sends that locale to concordance and recommendation endpoints without placeholders or provider-specific recovery.

## State model

The MobX workspace store keeps lazy comment bodies separately from queue-owned segment metadata. An absent comment entry means comments have not loaded; an empty entry means they loaded and none exist. Queue hydration preserves loaded comments when later queue snapshots omit them.

Target translations, comments, and repository context continue to load through their segment endpoints. Queue refreshes preserve lazy-loaded target and comment values. Provider filters that require per-segment comment probes are unavailable.

## Verification

Tests cover the queue schema, queue builders, CAT mapping, locale forwarding, and MobX hydration. Run `vp test` and `vp check --fix` from `apps/hyperlocalise-web`.
