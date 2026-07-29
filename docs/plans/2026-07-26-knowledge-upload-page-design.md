# Knowledge upload page

## Problem

The Knowledge page is a markdown memory editor with a Retrieval preview
panel. Teams need a clearer empty-state path to add knowledge, Storybook
coverage, and a TipTap editor instead of a plain textarea.

## Decision

Use a presentational page view with a thin data container.

- Empty (no saved content): show **Upload knowledge** (dropzone + mock
  source buttons).
- With memory, or after Markdown/Text: show the TipTap editor (reuse
  `MarkdownEditor`).
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
- Accept **one file** per upload. Advertise a broad format list on the
  assumption that ingest will be: Go extracts readable text/structure → AI
  rewrites into Global guidance markdown → editor draft / commit.

## Behavior

1. Load memory. Empty content → upload UI; otherwise → editor.
2. Dropzone accepts listed types, max **1 file**; selection is UI-only until
   the Go + AI ingest path lands.
3. Drive / SharePoint / Notion / Import website → “Coming soon” toast.
4. Markdown/Text → editor with empty draft.
5. Editor exposes **Add sources** to return to the upload UI.
6. The editor shows quiet saved/version metadata above the document and
   character count, history, and save actions below it.
7. The empty editor prompts users to add terminology, market insights,
   compliance requirements, launch guidance, and things to avoid.

## Accepted formats and intended ingest

Supported extensions (UI today): `.md`, `.txt`, `.csv`, `.json`, `.docx`,
`.pdf`, `.xlsx`, `.xls`, `.pptx`.

Intended pipeline (not wired in this UI pass):

1. **Go extract** — enough readable text/structure for the model
   (UTF-8 / charset sniff for text; `encoding/csv`; pretty-print JSON;
   OOXML text for `.docx` / `.pptx`; sheet text for `.xlsx`; text-layer PDF;
   best-effort for legacy `.xls` and scanned PDFs).
2. **AI markdown** — rewrite extract into Global guidance sections
   (terminology, markets, compliance, GTM, avoid-list).
3. **Editor** — seed TipTap draft for review, then save as a version.

Treat `.xls` and scanned PDFs as best-effort in the service (clear error /
fallback messaging). No document parsers exist in Go modules yet;
extractors are new work.

## Out of scope

Real file ingest (Go extract + AI markdown), integration OAuth, website
crawl, and retrieval preview API wiring in the UI.
