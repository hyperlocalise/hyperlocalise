# Compact agent tool activity

## Problem

Inbox and chat-dock assistant messages list every tool call (`grep`, `read`, …) as its
own row. Non-technical users see a wall of implementation detail instead of progress.

Cursor collapses exploration into muted rollups such as “Explored release.yml, 5
searches”, and shows a single live status line while work is in flight.

## Decision

UI-only change in the shared message renderer (`AssistantMessageParts`):

1. Group consecutive **explore** tools into one block.
2. While any tool in that block is in flight, show one live line with
   `ScrambleText` from `dot-anime-react` and friendly copy (“Searching Save”,
   “Reading account-form.tsx”).
3. When the block finishes, show a collapsed rollup (“Explored account-form.tsx,
   5 searches”). Expand reveals existing per-tool `Tool` rows.
4. Keep action tools (`captureScreenshot`, `write`, `applyPatch`, `todoWrite`,
   translation/TMS tools, and anything not on the explore allowlist) as individual
   rows.

Reuse unused `Task` / `TaskTrigger` for the rollup shell. No stream, API, or
persistence changes.

## Explore allowlist

Roll up only these repository read tools:

- `grep`, `fuzzySearch`, `read`, `glob`, `detectRepoConfig`, `gitHistory`

Unknown tools stay individual. An action tool breaks the consecutive group.

## Copy

| State | Example |
|-------|---------|
| Live scramble | Searching {detail} / Reading {detail} / Finding files / Checking repository config |
| Done with searches | Explored {subject}, {count} searches |
| Reads only | Opened {subject} / Opened {count} files |
| No subject | Explored the codebase, {count} searches |

Subject comes from `extractToolInputDetail`, with path basenames. Honor
`prefers-reduced-motion` by disabling scramble animation.

## Success criteria

- Long explore runs read as one or two muted lines by default.
- Latest in-flight explore tool updates with scramble text.
- Screenshots, todos, and writes remain visible as today.
- Inbox and chat dock share the same behavior.
- `vp test` and `vp check --fix` pass.
