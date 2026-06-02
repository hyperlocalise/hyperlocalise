# [MEDIUM] run trusts config paths outside the project root

**File:** [`apps/cli/cmd/run.go`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/cli/cmd/run.go#L195-L218) (lines 195, 218)
**Project:** hyperlocalise
**Severity:** MEDIUM  •  **Confidence:** medium  •  **Slug:** `path-traversal`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

The run command passes the selected config directly into runsvc.Run. Bucket `from` and `to` paths are later resolved and used for file reads and writes without a project-root confinement check. A malicious repo or PR can set absolute or `../` paths so `hyperlocalise run` reads local translation-shaped files outside the checkout, sends source text to the chosen provider, and writes translated output outside the project with the current user's privileges.

## Recommendation

Canonicalize source and target paths relative to a trusted project/config directory, reject absolute paths and parent/symlink escapes by default, and add an explicit allowlist or opt-in flag for intentional external paths.

## Revalidation

**Verdict:** true-positive

run delegates to runsvc.Run, and runsvc loads configuration through config.Load, so the current code does include new project-path validation. That validation blocks literal ../ segments, absolute paths outside the config directory, and existing symlinks that appear in the raw bucket from/to pattern. It also validates locale strings with safeLocalePattern, which blocks ../ injection through locale placeholders. The remaining gap is that validation is done before pathresolver substitutes {{source}}, {{target}}, [locale], and {{localeDir}} into concrete runtime paths. A malicious repository can commit a symlink whose name is a valid source or target locale, such as en-US or fr-FR, and use patterns like {{source}}/messages.json and {{target}}/messages.json. The raw pattern passes validation because the literal {{target}} path is not the symlink, but runsvc later reads or writes the substituted path and writeBytesAtomic creates temp files under filepath.Dir(targetPath), following symlinked parent directories. This can still read translation-shaped files outside the checkout and write generated outputs outside the project with the current user’s privileges. The common ../ and absolute-path variants are fixed, but the broader project-root confinement claim is still false for symlinked substituted path components.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-21)
