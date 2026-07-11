# New Request chat dock unification

## Goal

Make **New Request** open the floating chat dock on the current page. Retire the dedicated `/chat` page and use one chat icon for every entry point.

## Decisions

- Sidebar **New Request**, dashboard CTAs, and the footer control all call `ChatDockStore.openNewTab()`.
- Footer empty-state and tab-bar new-request actions use `Chat01Icon` (same as the sidebar).
- Remove the `/chat` page. Redirect `/org/:slug/chat` to `/org/:slug/dashboard?newRequest=1`.
- After dock hydrate, `?newRequest=1` opens one pending tab once, then the query param is stripped with `router.replace`.

## Navigation

- Extend `NavigationItem` with optional `action: "open-chat-dock"`.
- Keep a stable non-route `href` (or id) for React keys only.
- In `AppShellNavigation`, action items render a button that opens the dock. They are never route-active.
- Dashboard CTAs take `onNewRequest` instead of `newRequestHref`.

## Cleanup

- Delete chat page content modules.
- Drop app-shell title/breadcrumb special cases for `/chat` and `/new-request`.
- Update tests and stories that still point at `/chat`.

## Testing

- Sidebar New Request opens a pending dock tab without navigation.
- Footer control uses the chat icon and opens a tab.
- `?newRequest=1` opens one tab and clears the param.
- Dashboard CTAs invoke the callback path.
- Manual: sidebar, footer, and dashboard CTA share the same dock; `/chat` bookmarks land on dashboard with the dock open.

## Out of scope

- Changing inbox full-page chat behavior
- Syncing dock tabs with inbox selection
- Cross-device open-tab sync
