# [HIGH] Read-only bash allowlist can expose sandbox secrets and arbitrary files

**File:** [`apps/hyperlocalise-web/src/lib/agent-runtime/tools/workspace/bash.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/lib/agent-runtime/tools/workspace/bash.ts#L10-L101) (lines 10, 11, 13, 15, 16, 78, 87, 99, 101)
**Project:** hyperlocalise
**Severity:** HIGH  •  **Confidence:** high  •  **Slug:** `secrets-exposure`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

The bash tool is described as read-only, but the allowlist permits broad `jq`, `yq`, `ls`, `find`, and selected `git` invocations without validating their file arguments against the workspace boundary. The command is split and passed directly to `ctx.bash.exec`, so an agent-prompted command such as `jq -n env` can dump the sandbox process environment, `jq -R . /proc/self/environ` or `jq -R . /etc/passwd` can read arbitrary sandbox files, and `git diff --no-index /etc/passwd /dev/null` can return file contents. The post-execution redaction is not a reliable boundary, especially for JSON-formatted environment output. The same gap also permits read-only bypasses such as `find . -type f -delete` or `yq -i`, which can mutate the sandbox despite read-only workflow mode.

## Recommendation

Replace the free-form command string with structured per-command schemas. Remove unrestricted `jq`/`yq` from this tool or wrap them with explicit workspace-relative file parameters. Validate every path after symlink resolution, reject absolute paths and parent traversal, block environment introspection, and deny write-capable flags/actions such as `-i`, `--in-place`, `--output`, `--no-index`, `-delete`, `-fprint`, and related `find` actions.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-27)
