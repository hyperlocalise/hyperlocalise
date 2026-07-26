# Knowledge upload page

## Problem

The Knowledge page is a markdown memory editor with a Retrieval preview
panel. Teams need a clearer empty-state path to add knowledge, Storybook
coverage, and a TipTap editor instead of a plain textarea.

## Decision

Use a presentational page view with a thin data container.

- Empty (no saved content): show **Upload knowledge** (dropzone + mock
  source buttons).
- With memory, or after Markdown/Text / Blank table: show the TipTap
  editor (reuse `MarkdownDescriptionEditor`).
- Remove **Retrieval preview** from the UI.
- Keep `KnowledgeMemoryEditor` as the self-contained editor for the page
  and the Automations **Manage Memories** sheet.
- Storybook targets `KnowledgePageView` (`Empty`, `WithMemory`,
  `Loading`, `ReadOnly`).

## Behavior

1. Load memory. Empty content → upload UI; otherwise → editor.
2. Dropzone accepts listed types, max 5 files; selection is UI-only.
3. Drive / SharePoint / Notion / Import website → “Coming soon” toast.
4. Markdown/Text → editor with empty draft. Blank table → editor with a
   small markdown table starter.
5. Add existing knowledge → editor if saved content exists; else toast.
6. Editor exposes **Add knowledge** to return to the upload UI.

## Out of scope

Real file ingest, integration OAuth, website crawl, and retrieval preview
API wiring in the UI.
