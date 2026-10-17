# Excel workbooks as segments with a File view

This changes the `.xlsx` row of [CAT Univer office support](../plans/2026-08-01-cat-univer-office-support-design.md) and the Office row of [CAT File view](../plans/2026-08-01-cat-file-view-design.md). `.xlsx` is no longer File view only. `.xls`, `.docx`, and `.pptx` are unchanged.

## Problem

A native `.xlsx` upload was one Office file. Translators edited the whole workbook in Univer or uploaded a translated copy, so string tables got no translation memory, QA, length limits, glossary checks, or segment review. The CLI already reads workbooks as entries, following [Smartcat's multilingual Excel rules](https://help.smartcat.com/multilingual-excel-done-right/).

## Decisions

- Platform uses the CLI's rules, ported to TypeScript in `src/lib/translation/xlsx`. Both implementations produce the same keys for the same workbook:
  - Only row 1 is read for headers. Matching is case-insensitive, and any run of characters outside `a`-`z` and `0`-`9` becomes `-`.
  - A sheet whose row 1 has a source-locale column is multilingual. Each row is one entry, keyed by the `key`, `id`, or `context` column. An empty or repeated key falls back to `Sheet!N:N`.
  - `comment` columns become segment context, and `length-limit` columns become maximum lengths.
  - Any other visible sheet uses the cell layout, with one entry per text cell keyed `Sheet!B3`.
  - Formulas, numbers, cells without letters, and hidden sheets are skipped. Plain `t="str"` cells are text in both implementations.
- `.xlsx` stays in the Office, whole-file, and binary format families, so uploads, storage, and asset routes do not change. `isSegmentedSpreadsheetTranslationFileFormat` turns on the segment behavior.
- Ingest parses the stored workbook in-process inside a workflow step, then reconciles keys like other source files. Binary content does not cross step boundaries, and no sandbox is used.
- The target workbook is generated, not stored. Download, the public download API, MCP, and GitHub content sync all call `loadProjectXlsxTranslationDownload`:
  - It patches only the worksheet and shared-string parts of the source, so styles, formulas, and other locales' cells are kept.
  - It writes only ready translations, so source text never lands in a target column.
  - A missing target column is added with the source column's width.
  - Output is byte-stable for the same input: patched parts keep their zip dates and no folder entries are added. Content sync diffs this output against the repository.
- CAT returns the keys plus a `documentView`. The source is the stored workbook, and the target is the generated download URL.
  - The `spreadsheet` view family offers Comfortable, Side by side, Multilingual, and File view, and defaults to Side by side.
  - File view is read-only, with no upload, approve, or save, because edits there would bypass segment history and QA.
  - Provider projects keep string segment views.
- An `.xlsx` with no keys, such as one uploaded before this change, keeps the old Office behavior everywhere: the stored-variant download, `office_file` segments, and an editable File view.
- Translations already in an uploaded workbook are not imported automatically, because cell values can be stale. **Import translations** reads a filled workbook for one locale through the same parser.

## Follow-ups

- Automatic file translation jobs still fail on `.xlsx` with a message that points to segments. Running them needs a CLI release with the xlsx parser and a bump of the sandbox CLI pin.
- Saving edits from File view back into segments.
- An opt-in setting to import translations already in the workbook at upload.
- The File view target reloads when the view mounts. It does not refresh while segments change in another view.

## Validation

- Go and TypeScript unit tests cover header rules, both layouts, key fallbacks, `t="str"` cells, writer output (filling and appending columns, byte stability), ingest and import workflows, and the download routes.
- Running both parsers on the same fixtures produced identical keys.
- A database integration test uploads a workbook, approves one translation, and checks the downloaded cells.
- CAT service and capability tests cover keyed, keyless, and `.xls` workbooks.
