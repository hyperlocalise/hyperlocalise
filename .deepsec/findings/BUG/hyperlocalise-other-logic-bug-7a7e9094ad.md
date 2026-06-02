# [BUG] Invalid i18n.yml can be left behind after validation fails

**File:** [`apps/hyperlocalise-web/src/lib/agent-runtime/tools/i18n-setup-tools.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/lib/agent-runtime/tools/i18n-setup-tools.ts#L81-L97) (lines 81, 84, 92, 97)
**Project:** hyperlocalise
**Severity:** BUG  •  **Confidence:** medium  •  **Slug:** `other-logic-bug`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

The tool writes the provided content to i18n.yml before running validation. If validation fails, it returns success: false but leaves the invalid file in the sandbox. The setup workflow later treats the run as having written a config by checking only that i18n.yml exists, so a failed validation can still result in an invalid setup file being committed if the agent does not repair it. This is not shell injection because the content is passed via an environment variable and the destination path is fixed.

## Recommendation

Write to a temporary file, validate that file, then atomically rename it to i18n.yml only after validation passes. Also have the workflow perform its own final validation instead of checking only for file existence.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-31)
