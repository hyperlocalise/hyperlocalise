# [MEDIUM] CSV status output allows spreadsheet formula injection

**File:** [`apps/cli/cmd/status.go`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/cli/cmd/status.go#L88-L570) (lines 88, 90, 558, 559, 560, 561, 569, 570)
**Project:** hyperlocalise
**Severity:** MEDIUM  •  **Confidence:** medium  •  **Slug:** `other-csv-injection`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

The status command emits CSV rows containing entry keys, namespaces, and locales taken from translation files and config. `encoding/csv` handles CSV quoting, but it does not neutralize spreadsheet formula prefixes such as `=`, `+`, `-`, or `@`. If a malicious translation key or namespace is exported and opened in Excel, LibreOffice, or Google Sheets, it can be interpreted as a formula and may execute spreadsheet actions or exfiltrate data.

## Recommendation

Before writing CSV intended for spreadsheet consumption, prefix fields beginning with formula metacharacters or leading tab/CR characters with a safe escape such as an apostrophe, or provide an explicit raw CSV mode.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-03-31)
