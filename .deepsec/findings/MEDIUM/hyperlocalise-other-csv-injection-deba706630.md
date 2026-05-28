# [MEDIUM] Glossary CSV export does not neutralize spreadsheet formulas

**File:** [`apps/cli/cmd/lokalise.go`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/cli/cmd/lokalise.go#L644) (lines 644)
**Project:** hyperlocalise
**Severity:** MEDIUM  •  **Confidence:** medium  •  **Slug:** `other-csv-injection`

## Owners

**Suggested assignee:** `140675996+NguyenChHieu@users.noreply.github.com` _(via last-committer)_

## Finding

The glossary download command streams remote Lokalise glossary data to CSV output. Tracing into the storage writer shows raw term, description, and translation fields are written with encoding/csv but are not neutralized for spreadsheet formula prefixes. A translator or compromised TMS account that can create glossary text beginning with =, +, -, or @ can produce a CSV that executes formulas when an operator opens it in Excel or similar spreadsheet software.

## Recommendation

Before writing CSV cells from remote/user-controlled text, prefix dangerous formula-leading values with an apostrophe or tab and apply the same sanitizer to all CSV export paths.

## Recent committers (`git log`)

- Chi Hieu Nguyen <140675996+NguyenChHieu@users.noreply.github.com> (2026-05-18)
