# [MEDIUM] Glossary CSV export writes spreadsheet formulas verbatim

**File:** [`internal/i18n/storage/lokalise/glossary.go`](https://github.com/hyperlocalise/hyperlocalise/blob/main/internal/i18n/storage/lokalise/glossary.go#L126-L365) (lines 126, 130, 350, 352, 353, 362, 365)
**Project:** hyperlocalise
**Severity:** MEDIUM  •  **Confidence:** medium  •  **Slug:** `other-csv-injection`

## Owners

**Suggested assignee:** `140675996+NguyenChHieu@users.noreply.github.com` _(via last-committer)_

## Finding

WriteGlossaryCSV streams remote Lokalise glossary content directly into a CSV. glossaryCSVRow includes term text, descriptions, translations, and translation descriptions without neutralizing values that start with spreadsheet formula metacharacters such as =, +, -, or @. csv.Writer handles CSV quoting, but spreadsheet applications can still interpret quoted cells as formulas. A malicious Lokalise collaborator could add a formula payload to glossary content; when an operator opens the exported CSV in Excel or Google Sheets, it may execute spreadsheet-side actions or exfiltrate data.

## Recommendation

For spreadsheet-facing exports, escape formula-leading cells before writing them, for example by prefixing an apostrophe or another accepted neutralization marker. If exact round-trip import is required, separate raw export from a safe spreadsheet export mode and document the risk.

## Recent committers (`git log`)

- Chi Hieu Nguyen <140675996+NguyenChHieu@users.noreply.github.com> (2026-05-18)
