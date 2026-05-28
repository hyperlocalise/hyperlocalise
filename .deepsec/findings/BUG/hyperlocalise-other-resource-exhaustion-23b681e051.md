# [BUG] Smartling downloads buffer unbounded response bodies

**File:** [`apps/cli/cmd/smartling.go`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/cli/cmd/smartling.go#L184-L275) (lines 184, 193, 263, 275)
**Project:** hyperlocalise
**Severity:** BUG  •  **Confidence:** medium  •  **Slug:** `other-resource-exhaustion`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

The Smartling download commands request source and translation files into result.Content before writing them. The traced Smartling HTTP client uses io.ReadAll(resp.Body) for these downloads without a maximum size, so an unexpectedly large remote file can exhaust memory or kill the CLI/CI job.

## Recommendation

Add explicit maximum download sizes or stream responses directly to the output file while enforcing a byte limit.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-13)
