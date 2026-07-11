# Chat dock footer

## Goal

Keep active chats available across org pages through a docked panel and tab bar in the app shell. State lives in MobX and survives navigation and refresh.

## Decisions

- Docked panel on the current page (no forced navigation to inbox).
- Persist tabs, panel open/collapsed, drafts, and best-effort stream snapshots in versioned `localStorage`.
- Keep `/inbox` unchanged as a separate full-page experience.
- Background tabs keep streaming (cap of 3 concurrent streams).

## Architecture

`ChatDockStore` hangs off `AppShellStore` and owns open tabs, the active tab, panel visibility, drafts, and stream UI snapshots. A shell-lifetime `ChatStreamManager` runs SSE streams keyed by conversation id. React Query still loads conversation metadata and message history from existing APIs.

```
AppShellStore
  └── ChatDockStore
        ├── tabs[]
        ├── activeTabId
        ├── panelOpen
        └── persistence (localStorage)

AppShellClient
  └── AppShellFooter
        ├── ChatDockPanel (when open)
        └── status row (chat tabs left / plan / support right)
```

Persistence key: `chat-dock:v1:${organizationSlug}`.

## UI

The chat dock is part of the fixed app shell footer:

1. Expandable conversation panel (when open)
2. Status row: chat tabs / New chat on the **left**, plan usage, support on the **right**

Tabs sit in the same footer row as support. Dynamic `--app-shell-dock-height` only grows for the open panel.

## Data flow

1. **+** creates a pending tab; first send calls `POST /conversations` and replaces the pending id.
2. Replies use the existing message + chat stream endpoints.
3. Stream deltas update the tab snapshot in MobX; on finish, React Query refetches messages.
4. On shell mount, hydrate from storage, refetch messages, and attempt stream reconnect when a tab was marked streaming.

## Error handling

- Stream failure keeps a partial snapshot and offers retry.
- Create/send failures keep the draft and show an inline or toast error.
- Corrupt or unavailable `localStorage` falls back to in-memory state.
- A fourth concurrent stream is refused with a toast.

## Testing

- Unit tests for store actions, persistence versioning, and stream concurrency.
- Component coverage for tab select/close/new and panel open/collapse.
- Manual checks: navigate away mid-stream, refresh, and confirm inbox still works independently.

## Out of scope

- Syncing dock tabs with inbox selection
- Drag-reorder tabs
- Pop-out / full-screen dock
- Cross-device open-tab sync
