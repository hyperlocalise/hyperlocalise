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

## Revalidation

**Verdict:** true-positive

The grep tool still validates `path` only lexically with `normalizeWorkspacePath`; it does not call `realpath` or otherwise reject symlink operands. It then invokes `grep -r` with the attacker-controlled workspace-relative path as a command-line operand. Common GNU grep behavior for `-r` follows symbolic links that are supplied directly on the command line. An attacker-controlled repository can add a symlink named with an included extension, such as `leak.yaml -> /etc/passwd`, then ask the tool to search `path: "leak.yaml"` for a known string. The include filter does not prevent this if the symlink basename matches one of the allowed text patterns or the caller supplies a broad `glob`. Returned matching lines are only redacted after grep has already read the out-of-workspace target, so the workspace boundary is still bypassable.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-27)
