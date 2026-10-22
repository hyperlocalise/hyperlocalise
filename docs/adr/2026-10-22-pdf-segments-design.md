# PDF as keyed segments in the Content Editor

## Problem

PDF uploads were skipped in Google Drive sync and could not be opened as keyed segments in the Content Editor. Translators had no TM, QA, glossary, or generated target PDF.

## Decisions

- PDF text blocks are extracted in Go with PDFium (WebAssembly), keyed as `page-<n>#<blockIndex>` with context `Page N, block M`.
- Ingest uses go-svc (`POST /internal/pdf/entries`), which calls the same
  `translationfileparser` package as the CLI. Target PDFs are generated in go-svc
  (`POST /internal/pdf/apply`) by replacing text objects in the source layout.
  The web app downloads through the existing Office download path.
- Scanned PDFs without a native text layer fail ingest with a clear message. OCR is not used for project sources.
- Arabic, Hebrew, and Indic targets return `ErrPDFScriptUnsupported` because PDFium does not shape those scripts.

## Limits

- One dominant font per block; mixed inline styles are not preserved.
- Text in XObjects, annotations, and form fields is not translated.
- Long translations may overflow the block bounds; overflow keys are returned in `X-Hyperlocalise-Overflow-Keys`.

## Validation

- Go golden and round-trip tests in `internal/i18n/translationfileparser/pdf_parser_test.go`.
- Web format, ingest, download, File view capability, and Google Drive classification tests.
