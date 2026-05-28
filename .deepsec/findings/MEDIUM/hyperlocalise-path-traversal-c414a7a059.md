# [MEDIUM] check --fix can apply unconfined paths from project config

**File:** [`apps/cli/cmd/check.go`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/cli/cmd/check.go#L637-L655) (lines 637, 655)
**Project:** hyperlocalise
**Severity:** MEDIUM  •  **Confidence:** medium  •  **Slug:** `path-traversal`

## Owners

**Suggested assignee:** `140675996+NguyenChHieu@users.noreply.github.com` _(via last-committer)_

## Finding

The fix path builds a runsvc.Input from the selected config and invokes runCheckFixSvc. The underlying config validation only checks that bucket paths are non-empty and extension-compatible; it does not reject absolute paths, parent-directory traversal, or symlink escapes. A malicious repository config can therefore cause `hyperlocalise check --fix` to read source files outside the checkout, send their text to the configured translation provider, and write generated target files outside the project under the operator or CI user's privileges.

## Recommendation

Resolve all source and target paths against a trusted project/config root, reject absolute paths and any cleaned/evaluated path that escapes that root by default, and require an explicit opt-in for external paths.

## Revalidation

**Verdict:** true-positive

The current config loader now blocks the straightforward absolute-outside and ../ config-path cases by calling cfg.validateProjectPaths from config.Load. That validation canonicalizes the config directory, rejects literal .. path segments, evaluates existing symlinks where possible, and verifies the raw bucket from/to values stay under the config directory. However, check --fix still builds findings from paths after placeholder substitution and then passes those SourceFile/TargetFile values into runsvc.Run as FixTargets/FixMarkdownScopes. The validation happens on raw patterns such as {{target}}/messages.json, not necessarily on the concrete substituted path such as fr-FR/messages.json. A malicious repository can include a symlink named after a safe locale, for example fr-FR -> /tmp/outside, and use a valid config to make check --fix write through that symlink when runsvc.writeBytesAtomic creates the temp file in filepath.Dir(targetPath). The source side has the same placeholder-symlink gap for reads, for example {{source}} resolving to a symlinked en-US directory. There is no post-substitution EvalSymlinks containment check before the fix service reads source files or writes targets. So the direct traversal variant has been patched, but the unconfined-path issue remains exploitable through symlinked substituted path components.

## Recent committers (`git log`)

- Chi Hieu Nguyen <140675996+NguyenChHieu@users.noreply.github.com> (2026-05-22)
- renovate[bot] <29139614+renovate[bot]@users.noreply.github.com> (2026-05-08)
- Minh Cung <cungminh2710@gmail.com> (2026-04-26)
