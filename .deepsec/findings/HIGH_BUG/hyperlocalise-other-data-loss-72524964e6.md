# [HIGH_BUG] Crowdin glossary download deletes pre-existing output on failure

**File:** [`apps/cli/cmd/crowdin.go`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/cli/cmd/crowdin.go#L264-L284) (lines 264, 265, 273, 282, 284)
**Project:** hyperlocalise
**Severity:** HIGH_BUG  •  **Confidence:** high  •  **Slug:** `other-data-loss`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

When --output is set, the glossary command opens the destination with os.Create before the network/API write succeeds. os.Create truncates any existing file. If WriteGlossaryCSV or close then returns an error, the error path calls os.Remove(o.outputPath), deleting the destination even when it existed before the command. A transient Crowdin API error or write error can therefore destroy a user's existing CSV.

## Recommendation

Write to a temporary file in the same directory and rename it over the destination only after a successful download. Track whether the destination existed and never remove a pre-existing file on cleanup; consider requiring --force for replacement.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-09)
