# MobX state patterns

How client state is structured in this app. There are two tiers. Start with the
smallest one that fits, and move up only when the rules below stop holding.

| Tier       | Use when                                                                 | Reference                                                                                                                       |
| ---------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Page store | One screen of UI state: filters, dialogs, form drafts, selection         | [`glossaries-page-store.ts`](<src/app/[lang]/(authenticated)/org/[organizationSlug]/glossaries/store/glossaries-page-store.ts>) |
| Workspace  | Several domains, async workflows, scoped lifecycles (the content editor) | [`content-editor/workspace/`](src/components/content-editor/workspace)                                                          |

Server data belongs to TanStack Query, not MobX. Stores hold UI state, local
drafts, and whatever must survive while a request is in flight. When a store
needs cached server data, read it through an adapter (see
[Reading server data](#reading-server-data)). Never copy whole query results
into observables.

## Tier 1: page store

```text
<feature>/store/
  <feature>-page-store.ts          class + pure helpers
  <feature>-page-store.test.ts     plain unit tests, no React
  <feature>-store-context.tsx      Provider + use<Feature>PageStore()
```

- Use one class per screen, built with
  `makeAutoObservable(this, {}, { autoBind: true })`.
- Constructor arguments are the route identity (`organizationSlug`,
  `projectId`) and are `readonly`.
- The provider creates the store with `useMemo(() => new Store(id), [id])`, so a
  new route identity gets a fresh store. The hook throws outside the provider.
- Components that read the store are wrapped in `observer`.
- Every mutation is a method on the store. Components never assign fields.
- Derived values are getters (`get hasActiveFilters()`), not fields kept in sync
  by hand.
- Name intent-level actions after what they do: `resetCreateDialog()`, not
  three `set*` calls from the component.

## Tier 2: workspace

The content editor splits state into four roles. Each role has one job and a
narrow surface.

```text
workspace/
  store/                       domain stores: state + synchronous actions
  controllers/                 async workflows and side effects
  content-editor-workspace-orchestrator.ts   composes stores, owns lifecycle
  content-editor-workspace-context.tsx       Provider + useContentEditorWorkspace()
  use-content-editor-workspace-runtime.ts    React glue: builds ports, wires controllers
  content-editor-workspace.tsx               observer view
```

### Domain stores (`store/`)

A domain store owns one slice of state and the actions that change it, for
example `SegmentStore`, `QueueStore`, `IntelligenceStore`, `BulkActionStore`,
and `UiStore`.

- Stores are synchronous. No `fetch`, no timers, no React.
- Expose intent actions that keep invariants together. Avoid bare setters that
  let callers half-update state:

  ```ts
  // Good: the store decides what "starting a write" means.
  beginWrite(segmentId: string, kind: WriteKind): boolean // false if already in flight
  endWrite(segmentId: string)

  // Avoid: callers must remember to update both.
  setIsApproving(true); setApprovingSegmentId(id)
  ```

- Removal goes through one method (`evict(id)`) that clears every map keyed by
  that id. Never `delete` from a store's maps elsewhere.
- Any store whose state belongs to an open file implements
  `resetForFileScope()` (see [Lifecycle](#lifecycle)).
- Use `computed({ equals })` for collections that rebuild often but rarely
  change (for example `loadingSegmentIds`), so observers don't re-render on
  every rebuild.
- Mark non-reactive internals with `false` in the `makeAutoObservable`
  overrides: sequence counters, caches, disposers, collaborator references. Use
  the generic form for private keys:
  `makeAutoObservable<this, "hydrator" | "controllers">(this, { hydrator: false, controllers: false })`.

### Orchestrator

The orchestrator composes the stores and is the single object handed to React
through context.

- It owns stores (`readonly queue`, `readonly segments`, ...) and the lifecycle:
  `attachControllers`, `start`, `dispose`, `prepareFileScopeChange`.
- Getters are read-only views over stores. Do not add forwarding setters.
  Writes go through the owning store's action, or through an orchestrator
  command when the change spans several stores.
- Cross-store commands live here (for example `beginWrite` marks the segment
  and updates queue status). Keep each command small. When a group of commands
  forms its own concern, extract a collaborator, as we did with
  `ContentEditorSegmentTargetSync` (server target merge and drafts) and
  `ContentEditorQueueHydrator` (snapshot ingestion and merging).
- Collaborators receive the stores they need through a constructor `deps`
  object. They do not receive the orchestrator.

### Controllers (`controllers/`)

Controllers run async workflows such as review, intelligence, and navigation.
They are plain classes, not observables.

```ts
export type ContentEditorNavigationWorkspace = Pick<
  ContentEditorWorkspaceOrchestrator,
  "selectSegment" | "getFilteredQueueSegments" | /* only what it uses */
>;

export interface ContentEditorNavigationControllerPorts {
  queueFilter: ContentEditorQueueFilter;
  onLoadMoreQueue?: () => void;
}

export class ContentEditorNavigationController implements WorkspaceControllerLifecycle {
  constructor(private readonly workspace: ContentEditorNavigationWorkspace) {}
  configure(ports: ContentEditorNavigationControllerPorts) { /* latest React-owned inputs */ }
  start() { /* reactions */ }
  dispose() { /* disposers, cancel pending work */ }
  invalidateFileScope() { /* drop work tied to the previous file */ }
}
```

- **Narrow dependencies.** The constructor takes a `Pick<Orchestrator, ...>`
  type exported next to the controller. That makes its reach visible in review
  and lets tests pass a small fake.
- **Ports.** Inputs owned by React (props, query results, host callbacks)
  arrive through `configure(ports)`, called from an effect whenever they change.
  Controllers never import hooks or read context.
- **Lifecycle.** Implement `WorkspaceControllerLifecycle`. Every `reaction`,
  timer, or `AbortController` created in `start` is released in `dispose`.
- **Stale-async guards.** Capture a sequence before awaiting and re-check it
  before writing results:

  ```ts
  const generation = this.workspace.fileScopeGeneration;
  const result = await api.run();
  if (!this.workspace.isFileScopeCurrent(generation)) return;
  ```

  Use `fileScopeGeneration` for file changes, and a per-workflow counter (such
  as `reviewSequence` or `validationSequence`) when a newer run of the same
  workflow should win.

- Write results back through store actions or orchestrator commands, never by
  assigning fields.
- Keep pure helpers (`getAdjacentSegmentId`) as exported functions so they can
  be unit-tested without a store.

### Runtime hook

`use-content-editor-workspace-runtime.ts` is the only place where React meets
controllers.

- Create controllers once per store: `useMemo(() => new Controller(store), [store])`.
- Build ports with `useMemo` and pass them through `controller.configure(ports)`
  in an effect.
- Attach controllers with `store.attachControllers(...)`, call `start()` in an
  effect, and `dispose()` in its cleanup.
- Callbacks passed to the view bind controller methods. Logic belongs in the
  controller, not the hook.

### View

- Wrap view components in `observer` and read store state with
  `useContentEditorWorkspace()`. Do not drill store-derived flags through
  props. Props are for things the store does not know: host configuration,
  query-owned paging, capability flags computed from outside data.
- Leaf presentational components (rows, cards, inputs) stay prop-driven and
  store-agnostic, so they can be used in Storybook and tested in isolation. The
  connected parent reads the store and passes plain values down.
- Dereference observables as late as possible. Pass `segment.id` and let the
  child read what it renders, rather than reading ten fields in the parent.
- Don't pass unbound store methods. Wrap them in an arrow function, or rely on
  `autoBind` inside the class only.

## Lifecycle

State has an explicit scope, and every scope has a reset.

| Scope      | Lives until                   | Reset hook                                                                      |
| ---------- | ----------------------------- | ------------------------------------------------------------------------------- |
| Workspace  | Provider unmounts             | `dispose()`                                                                     |
| File scope | File or target locale changes | `resetForFileScope()` on each store, `invalidateFileScope()` on each controller |
| Segment    | Segment leaves the queue      | `segments.evict(id)`, `targets.forget(id)`                                      |

- `prepareFileScopeChange()` loops over the file-scoped stores, bumps
  `fileScopeGeneration`, and invalidates controllers. When you add a store that
  holds per-file data, add it to `fileScopedStores`. That registration is the
  checklist item reviewers should look for.
- Keep loading indicators that describe in-flight requests for the new scope.
  Reset everything else.

## Reading server data

When a store needs TanStack Query data reactively, define a small source
interface in the store layer and implement it next to the query hooks:

```ts
export interface ContentEditorServerTargetSource {
  get(segmentId: string): ServerTarget | undefined;
  subscribe(listener: (segmentId: string, target: ServerTarget) => void): () => void;
}
```

- The adapter (`createSegmentTargetQuerySource`) owns query-key parsing.
  Parsing a key by position happens in exactly one function next to the key
  factory.
- The store attaches the source and returns a disposer:
  `useLayoutEffect(() => store.attachServerTargetSource(source), [...])`.
- Never assign functions onto a store (`store.lookup = ...`) from React.

## Testing

- Domain stores, collaborators, and pure helpers are tested with plain
  `vp test` unit tests, without rendering.
- Controllers are tested against a real orchestrator or a `Pick<>` fake, with
  ports passed to `configure`.
- View tests render inside the real provider and assert on observable-driven
  output.

## Review checklist

- [ ] No component assigns a store field. All writes are actions.
- [ ] No new forwarding setter on the orchestrator.
- [ ] New async work lives in a controller, with a stale-async guard.
- [ ] New controller deps are a `Pick<>` type. React inputs come through ports.
- [ ] Every reaction, timer, and subscription has a disposer called from `dispose`.
- [ ] New per-file state implements `resetForFileScope()` and is registered.
- [ ] Removing an entity goes through `evict`.
- [ ] Store-derived values are read in the `observer` view, not drilled as props.
- [ ] Server data stays in TanStack Query and is read through an adapter.
