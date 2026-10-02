# Word files in File view: formatting, start from source, and save

This fills in the `.docx` row of [CAT Univer office support](../plans/2026-08-01-cat-univer-office-support-design.md), which left "best-effort" undefined. `.xlsx` and `.pptx` are unchanged.

## Problem

File view read a Word file as plain text and saved by building a new file from that text. The source pane showed no formatting, and a save discarded everything but the words. An untranslated target opened as an empty editor.

## Decisions

- Word files follow the Markdown flow: a read-only source, an editable target, and a save that exports whatever the editor holds.
- An editable target with no translated file opens the source document. Nothing is stored until the first save. A read-only viewer still sees the empty state.
- Reading goes through `mammoth`'s HTML output and Univer's paste converter. Both are open source and already installed.
- The reader and the writer cover the same set, so what the editor shows survives a save: headings, alignment, bold, italic, underline, strikethrough, sub and superscript, bulleted and numbered lists with nesting, links, and tables.
- The saved file is built from the editor's document, not from the original package. Anything outside the set above is lost on the first save: fonts, sizes, colours, images, headers and footers, page setup, empty paragraphs, and the document's own styles.

## Not decided

- Carrying untouched parts of the source package (styles, page setup, headers and footers) into the saved file.
- Replacing `mammoth` with a reader that also keeps fonts, sizes, colours, and column widths.
- Unsaved-changes status and blocking approval until edits are saved, as Markdown has.

## Validation

Unit tests open a generated document, save it, reopen it, and compare structure and formatting. Opening, editing, saving, and reopening was checked in Firefox through a temporary Storybook story. It was not checked in the running app against stored files, or with documents written by Word.
