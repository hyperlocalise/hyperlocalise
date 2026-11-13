# Document editor redesign

Phase 1 of turning the content editor's document mode into a CMS-grade editor. It covers Markdown and MDX files opened in File view. The CMS layer (page tree, page status, publishing) is a later phase.

## Problem

Document mode shows the source file read-only beside a TipTap Markdown editor for the target. The editor looks like a form field inside a card, has a fixed toolbar, a short slash menu, and no block controls. Translators get none of the help the string editor gives them: no source for the paragraph they are editing, no translation memory, no glossary, no concordance search. AI help is limited to rewriting a selection, and generating a whole file overwrites the target. Edits are saved with a manual button. MDX files fall back to a raw textarea because TipTap escapes JSX on save.

## Decisions

### Engine

- Stay on TipTap 3. It is already shipped, its Markdown round trip is under our control, and its open-source extensions cover drag handles and tables. Plate and BlockNote were considered. Plate would add a second editor engine and generic Markdown serialization. BlockNote's Markdown export is lossy and several of its features are GPL or commercial.
- Build the editor as a separate `components/document-editor/` module. The shared `MarkdownEditor` keeps serving comments and inbox replies unchanged. Slash, image, and selection AI modules are reused.

### Layout

- One centred target page about 720px wide, styled like a published document. Frontmatter is a compact property table at the top of the page.
- A split toggle shows the read-only source page beside the target.
- Hovering a block shows a `+` button and a drag handle. The handle menu turns the block into another type, duplicates, deletes, or translates it.
- Selecting text shows a toolbar: a block type picker, bold, italic, underline, strike, code, link, an **Ask AI** menu (the existing selection actions), and **Add to glossary**.
- The slash menu is grouped into Basic, Media, Components, and AI, with icons and shortcut hints. New blocks: tables, callouts, toggles, and code blocks with a language label.
- The header carries the breadcrumb, locales, autosave status, split toggle, **Translate document**, and the existing review actions.

### Outline

- The outline is a strip of ticks pinned to the right edge of the page, one per heading. H2 ticks are long, deeper headings shorter, all right-aligned. The strip stays in view while scrolling.
- The tick for the section in view is dark. Hovering a tick shows its heading. Hovering the strip opens a floating table of contents with nested headings and the current section highlighted. Clicking an entry scrolls to it.
- The strip is one focusable control. Enter opens the table of contents and arrow keys move through it.
- A tick is amber while its section has untranslated blocks or pending AI suggestions.
- The strip is hidden when the document has fewer than two headings.

### Assistant panel

- A collapsible right panel (⌘J) follows the block that holds the cursor. Sections: Source, AI suggestion, Translation memory, Glossary, and Concordance search.
- Source and target are split into top-level blocks. Blocks are aligned by structure: block kinds and heading levels in order, with a sequence alignment that tolerates inserted and deleted blocks. Alignment is recomputed shortly after edits. A block without a confident match says so instead of guessing.
- Translation memory and glossary come from the existing concordance endpoint, called with the aligned source block. The AI suggestion comes from the existing selection AI request, asked to translate the source block.
- Changing block aborts the previous requests. Requests wait 300ms after the focus settles and are cached by source text. Every insert is one undoable transaction. Each section loads and fails on its own. Read-only users see results without insert actions.
- Concordance search takes free text and is prefilled from the selection (⌘⇧F). It searches by source text. Searching by target text needs a backend change and is a follow-up.
- Block-anchored comments and QA beyond glossary checks are out of scope.

### Translate document

- **Translate document** asks for scope, untranslated blocks only by default or all blocks, and shows the count.
- The AI translates the aligned source of each block in scope, with bounded concurrency.
- Each result becomes a suggestion on its target block. Suggestions live in editor plugin state and are drawn as decorations, so they are never part of the saved Markdown. A suggested block shows a word diff with Accept and Reject. A floating bar offers Accept all, Reject all, and next and previous.
- Accepting replaces the block content in one undoable transaction. Editing a block with a pending suggestion marks it outdated instead of applying it.
- Submitting for review warns while suggestions are pending.

### MDX

- JSX elements that start a line become component blocks. Their Markdown children are editable inline, and string attributes are editable from a property popover. Self-closing elements, `import` and `export` lines, and expressions are atom blocks kept verbatim.
- Serialization writes the original tag back when attributes are unchanged and rewrites only changed string attributes.
- **View code** switches to raw source. A file the parser cannot read safely opens in code view with an explanation.

### Autosave

- Save 3 seconds after typing stops, on blur, when the tab is hidden, and on ⌘S. One save runs at a time; edits during a save queue another.
- The header shows Saving, Saved with a relative time, Unsaved changes, or a persistent Couldn't save with Retry that keeps edits.
- Leaving with unsaved changes asks for confirmation. Review stays blocked while changes are unsaved.
- Each save uploads the whole file. If that creates a file version per save, versions will be coalesced server side or saved as drafts. This is checked before autosave is enabled by default.

### Rollout

- The new editor ships behind a flag next to the current viewer until parity.
- Build order: editor base, outline, autosave, assistant, translate document, MDX.

## Validation

Unit tests cover block alignment, Markdown and MDX round trips against fixture files (an unedited file must serialize unchanged), suggestion accept, reject, and outdated states, the autosave state machine with fake timers, and outline active-heading tracking. Component tests and stories cover the outline, assistant states, suggestion bar, and MDX blocks.
