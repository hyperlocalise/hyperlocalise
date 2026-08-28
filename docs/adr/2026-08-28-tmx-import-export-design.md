# TMX import and export

## Context

Native translation-memory import used regular expressions and assumed the first TUV was the source. That dropped inline codes, ignored header `srclang`, truncated after 5,000 units, and had no export path.

## Decision

Parse and write TMX 1.4 with a bounded XML reader. The import API accepts a dry run, returns a durable report, writes in batches, and upserts units that carry a stable `tuid`. Export downloads the full memory or a locale pair.

### Supported

- XML declaration encodings UTF-8, US-ASCII, and UTF-16 (payload is already Unicode)
- Header `srclang` and per-unit `srclang`
- `xml:lang` and TMX 1.1 `lang` on each TUV
- Multiple target languages in one unit
- Inline codes `bpt`, `ept`, `ph`, `it`, `hi`, `sub`, `ut`
- Predefined and numeric character entities
- `prop`, `note`, creation/change dates and ids
- Context from `context`, `x-context`, `x-context-string`, `x-context-pre`, and `x-context-post`
- Idempotent re-import when `tuid` is present (`externalKey` is `tmx:{tuid}:{source}:{target}`)

### Intentionally unsupported

- `ude` / `map` user-defined entities
- `alttrans`
- DTD and custom entity declarations (rejected to prevent XXE)
- Non-UTF encodings such as ISO-8859-1 or Windows-1252
- Same-language target variants in one unit (the extra TUV is skipped with a warning)
- TBX and spreadsheet interchange

### Limits

The documented unit cap is 50,000 translation units per request. Callers may pass a lower `maxUnits`. Files over the cap are rejected with `unit_limit_exceeded`. They are never silently truncated. Writes use batches of 250 entries.

Imported rows still require `memories:write` and keep the existing review-status default (`approved`) unless the file sets `x-review-status` or `review-status`.

## Consequences

CSV import shares the same report and dry-run contract. The TM detail page previews the report before writing and can download TMX.
