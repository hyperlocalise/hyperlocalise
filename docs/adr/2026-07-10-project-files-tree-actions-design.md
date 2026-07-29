# Project files tree search and row actions

## Decision

Use the Pierre Trees built-in search field, themed with host CSS variables so it
matches the app. Put file actions only in each row's context menu. Portal that
menu and lock window scroll while it is open so it stays visible and anchored.

## Search

Remove the external `components/ui` search input above the tree. Keep
`search: true` and theme the built-in field with `--trees-search-*` and related
host overrides (`--trees-bg-*`, `--trees-border-*`, `--trees-fg-*`).

## Actions

Remove header and selection-dependent action buttons (View strings, Translate
with agent, Import translations, Download). Open those commands from the row
`⋯` menu only. Compute enablement from the clicked file. Own translate, import,
and download dialogs at page level for that file; do not select a row first to
open a dialog.

## Context menu

Keep `composition.contextMenu` with a button trigger. Render menu content
through a portal to `document.body`, position it from the trees
`anchorRect` / `anchorElement`, mark the root with
`data-file-tree-context-menu-root="true"`, and lock window scroll for the menu
lifetime per the Trees docs.

## Verification

Update project files page and tree tests/stories for menu-only actions and the
built-in search field. Run `vp test` and `vp check --fix` from
`apps/hyperlocalise-web`.
