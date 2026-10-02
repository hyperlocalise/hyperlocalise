# Word files in File view: formatting, start from source, and save

This fills in the `.docx` row of [CAT Univer office support](../plans/2026-08-01-cat-univer-office-support-design.md), which left "best-effort" undefined. `.xlsx` and `.pptx` are unchanged.

## Problem

File view read a Word file as plain text and saved by building a new file from that text. The source pane showed no formatting, and a save discarded everything but the words. An untranslated target opened as an empty editor.

## Decisions

- Word files follow the Markdown flow: a read-only source, an editable target, and a save that exports whatever the editor holds.
- An editable target with no translated file opens the source document. Nothing is stored until the first save. A read-only viewer still sees the empty state.
- A reader of our own parses the Word XML, resolves style inheritance, and builds the editor's document directly. `mammoth` was tried first and dropped for File view: it never reads text size or colour, and it only sees formatting set directly on the text, not formatting that comes from a style.
- The reader and the writer cover the same set, so what the editor shows survives a save:
  - headings and titles, alignment
  - text size, colour, highlight, font, bold, italic, underline, strikethrough, sub and superscript
  - bulleted and numbered lists with nesting, links
  - tables with column widths and merged cells
  - page size and margins, empty paragraphs
- The saved file is built from the editor's document, not from the original package. Formatting is written on the text itself, and the file's styles are replaced. Anything outside the set above is lost on the first save: images, headers and footers, line and paragraph spacing, indents, theme fonts, table borders and shading, and tracked changes.

## Not decided

- Carrying untouched parts of the source package (headers and footers, images) into the saved file.
- Unsaved-changes status and blocking approval until edits are saved, as Markdown has.

## Validation

Unit tests read a hand-written Word package whose size, colour, and alignment come from styles, then save it, reopen it, and compare. Opening, saving, and reopening that package was checked in Firefox through a temporary Storybook story. It was not checked in the running app against stored files, or with documents written by Word itself.
