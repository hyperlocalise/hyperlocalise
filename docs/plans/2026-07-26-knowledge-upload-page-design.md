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
- Present the editor as one compact, Linear-style document surface rather
  than a settings card.
- Call the document **Global guidance**. Its scope includes localization,
  market context, compliance requirements, brand guidance, and go-to-market
  knowledge.
- Use the page copy: “Give every workflow the language, market, compliance,
  and go-to-market context it needs.”
- Keep formatting contextual: selection opens an inline formatting menu and
  `/` opens block commands.
- Show the optional version note only after the user chooses **Save changes**.
  Collect it in a small **Save changes** dialog and commit with **Save version**.
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
6. Editor exposes **Add sources** to return to the upload UI.
7. The editor shows quiet saved/version metadata above the document and
   character count, history, and save actions below it.
8. The empty editor prompts users to add terminology, market insights,
   compliance requirements, launch guidance, and things to avoid.

## Out of scope

Real file ingest, integration OAuth, website crawl, and retrieval preview
API wiring in the UI.
