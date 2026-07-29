# Composed MobX CAT workspace

## Decision

Replace the monolithic CAT workspace store and React controller hook with a
`CatWorkspaceOrchestrator` composed from three domain stores:

- `CatQueueStore` owns queue metadata, filtering, selection, and checked segment IDs.
- `CatSegmentStore` owns drafts, targets, comments, statuses, and dirty state.
- `CatIntelligenceStore` owns glossary, translation-memory, context, visual context,
  format checks, and AI results.

Async review and intelligence behavior lives in `CatReviewController` and
`CatIntelligenceController`. Controllers depend on narrow ports and domain-store
interfaces. Domain stores never call sibling stores; cross-domain work goes through
the orchestrator.

## Data flow

The provider constructs one orchestrator per workspace mount. Initial state is
hydrated at construction, while `CatQueryBridge` supplies subsequent queue snapshots.
The orchestrator splits each snapshot across the domain stores and preserves
lazy-loaded targets, comments, and intelligence when metadata-only queue snapshots
arrive.

React observes the orchestrator and renders its existing view-facing facade. MobX
actions enforce queue and selection invariants. Disposable MobX reactions run
selection-driven validation and unsaved-change protection. React effects remain only
for orchestrator lifecycle and changing external service ports.

## Compatibility

`CatWorkspaceContainer` and `CatWorkspaceView` retain their existing props and
behavior. Internal consumers migrate from `useCatWorkspaceStore` and
`useCatWorkspaceController` to `useCatWorkspace`. The old monolithic store and hook
are removed after migration.

## Verification

Add focused unit tests for each domain store and controller, plus orchestrator tests
covering hydration, navigation, auto-fill, review, and bulk operations. Retain the
existing container behavior suites. Run `vp test` and `vp check --fix` from
`apps/hyperlocalise-web`.
