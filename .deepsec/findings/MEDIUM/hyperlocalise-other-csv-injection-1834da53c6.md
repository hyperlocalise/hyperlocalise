# [MEDIUM] Smartling glossary and translation-memory CSV exports allow spreadsheet formula injection

**File:** [`apps/cli/cmd/smartling.go`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/cli/cmd/smartling.go#L528-L647) (lines 528, 647)
**Project:** hyperlocalise
**Severity:** MEDIUM  •  **Confidence:** medium  •  **Slug:** `other-csv-injection`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

The Smartling glossary and translation-memory download commands write remote Smartling content to CSV output. The traced storage writers put raw glossary terms, notes, definitions, source text, and translated text into encoding/csv rows without formula neutralization. A user with Smartling content-edit access can place a formula-prefixed value in the exported data and have it execute when an operator opens the CSV in spreadsheet software.

## Recommendation

Sanitize all CSV cells derived from remote Smartling content by prefixing formula-leading values with an apostrophe or tab before writing them.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-13)
