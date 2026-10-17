# Office documents as segments, with an editable File view

This replaces the `.docx`, `.pptx`, and `.xls` rows of [CAT Univer office support](../plans/2026-08-01-cat-univer-office-support-design.md), the Office row of [CAT File view](../plans/2026-08-01-cat-file-view-design.md), and the save flows in [PowerPoint File view save](2026-10-02-pptx-file-view-save-design.md) and [Word File view formatting](2026-10-02-docx-file-view-formatting-design.md). It extends [Excel workbooks as segments](2026-10-17-xlsx-segment-and-file-view-design.md) to every Office format.

## Problem

Word, PowerPoint, and legacy Excel uploads were whole files. Translators edited them in File view or uploaded a translated copy, so they got no translation memory, QA, glossary checks, or segment review. The file flow had two shapes: keyed formats with segment views, and stored-file formats with File view only.

## Decisions

- Every format is extracted as string segments. Segments are the source of truth; File view is a way to read and edit the whole file, not a separate copy.
- **Word and PowerPoint** are read one paragraph at a time, with the same rules in Go (`internal/i18n/translationfileparser`) and TypeScript (`src/lib/translation/ooxml`):
  - A key is the part name and the paragraph's position among all of that part's paragraphs, such as `word/document.xml#12` or `ppt/slides/slide3.xml#4`. Empty paragraphs count, so later keys stay stable.
  - Word reads the main document, then headers, footers, footnotes, and endnotes. Tracked deletions are dropped and tracked insertions are read as text.
  - PowerPoint reads slides in presentation order. Notes, layouts, masters, charts, and diagrams are copied unchanged.
  - Context names the location: `Slide 3, Title 1`, `Slide 3, table cell`, or the Word part and paragraph style.
  - A paragraph's segment is its text in the formatting that covers most of it. Other formatting, links, and non-text objects such as images and fields become `OX` placeholders (`\x1eHLOXPH_<hex>_<n>\x1f`). Writers read the formatting from the source paragraph, so a translation only has to keep the placeholders. CAT shows them as `OX#0`, and QA fails a target that drops or adds one.
  - Writers rebuild only paragraphs whose translation differs from the source. Other parts are copied without recompression.
- **Legacy `.xls`** is read with SheetJS, converted to `.xlsx` in memory, and then handled by the workbook rules. Downloads, content sync, and file jobs write `.xlsx`, because there is no `.xls` writer. `strings.xls` becomes `strings-fr.xlsx`.
- The sandbox CLI becomes the single parser when its pin reaches `hyperlocaliseCliOfficeReleaseVersion` (1.14.0), the gate in `src/lib/translation/sandbox-cli-version.ts`. Until then, ingest and **Import translations** parse Office files in-process, and file translation jobs do not accept them. `.xls` is always converted in-process before it reaches the CLI.
- Targets are generated from ready translations by `loadProjectOfficeTranslationDownload`, used by Download, the public download API, MCP, and GitHub content sync. The native Go public download still returns 501 for Office files.
- File view is editable and writes edits back into segments:
  - Word and PowerPoint show a field per paragraph, grouped by slide or part, beside a preview of the generated target. **Save drafts** saves each changed field.
  - Workbooks show their segments by cell or row the same way.
  - Markdown and HTML files with keys still save the whole edited document, then go-svc parses it with the same Go parsers (`POST /cat/document/parse-back`). Changed paragraphs are saved as drafts. Added or removed paragraphs, and changed paragraphs that ingest split into sentences, are listed and not saved, because their keys cannot be mapped back.
  - Every write is a draft saved through `saveTranslation` with `approve: false`, and runs segment QA first. A save blocked by QA stays dirty and is listed.
- Office uploads ingested before this change have no keys. Opening one in CAT requeues its ingest, and `run-backfill-office-source-ingest.ts` requeues the latest version of every keyless Office file. Requeued ingests set `reingest`, so upload automations do not run again.

## Follow-ups

- Release the CLI with the Office parsers, then bump `sandboxHyperlocaliseReleaseVersion` and the sandbox image `HYPERLOCALISE_VERSION`. Remove the in-process readers from ingest and import after that.
- Native Go public downloads for Office files.
- PowerPoint speaker notes, chart text, and SmartArt are not extracted.
- Parse-back for AsciiDoc documents.
- The File view preview refreshes after a save, not when segments change in another view.

## Validation

- Go and TypeScript golden tests read the same Word and PowerPoint fixtures and produce identical keys, text, placeholders, and context. Writer tests round-trip formatting, links, fields, and tracked changes.
- The CLI writes `.docx` and `.pptx` targets from a source template, and `hl entries` lists their paragraphs.
- QA tests fail a target that drops an `OX` placeholder.
- File view tests cover grouping, placeholder display and restore, and draft saves.
- Parse-back tests cover Markdown, HTML, unknown and missing keys, and sentence-split paragraphs.
- Database tests requeue a keyless `.docx`, skip keyed and non-Office files, and backfill only the latest `.xls` version.
