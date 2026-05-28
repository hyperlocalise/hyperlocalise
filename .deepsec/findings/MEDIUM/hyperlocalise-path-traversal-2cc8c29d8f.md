# [MEDIUM] Grep can follow repository symlinks outside the workspace

**File:** [`apps/hyperlocalise-web/src/lib/agent-runtime/tools/workspace/grep.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/lib/agent-runtime/tools/workspace/grep.ts#L84-L148) (lines 84, 99, 101, 145, 148)
**Project:** hyperlocalise
**Severity:** MEDIUM  •  **Confidence:** medium  •  **Slug:** `path-traversal`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

The `path` input is checked only lexically. A malicious or attacker-controlled repository can contain a symlink whose workspace-relative name points outside the repo, and the tool passes that path to recursive `grep`. Common grep implementations follow command-line symlink operands, allowing the tool to search and return lines from files outside the intended workspace boundary.

## Recommendation

Resolve the real path of the requested search root inside the sandbox and require it to remain under the repository root. Reject symlinks or walk the tree with `lstat` and only grep vetted regular files. Also pass the pattern with `-e` or after `--` to avoid option injection from dash-prefixed search patterns.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-27)
