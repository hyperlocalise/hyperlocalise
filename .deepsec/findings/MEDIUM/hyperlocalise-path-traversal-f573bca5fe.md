# [MEDIUM] Crowdin download can write translations outside the configured base path

**File:** [`apps/cli/cmd/crowdin.go`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/cli/cmd/crowdin.go#L213-L225) (lines 213, 225)
**Project:** hyperlocalise
**Severity:** MEDIUM  •  **Confidence:** high  •  **Slug:** `path-traversal`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

The command loads crowdin.yml and passes it to adapter.DownloadTranslations. The traced helper renders files[].translation by replacing placeholders, then joins the rendered path to basePath without verifying that the result remains under basePath. DownloadTranslations then creates parent directories and writes the downloaded payload to that target. A malicious crowdin.yml in a repository or CI workflow can set a translation pattern like ../../target or use language mapping placeholder values containing ../ so hl crowdin download overwrites files outside the intended localization tree.

## Recommendation

After rendering the translation path, compute filepath.Rel(basePath, targetPath) and reject paths that are absolute, equal to "..", or start with "../". Also reject path separators and parent traversal in language mapping placeholder values used for paths.

## Revalidation

**Verdict:** true-positive

The direct ../ and languages_mapping traversal vectors described in the finding have been partially patched: LoadFileWorkflowConfig now rejects raw source/translation patterns containing .. segments, rejects mapping values with path separators, and renderCrowdinTranslationPath checks filepath.Rel against basePath. However, the current containment check is lexical only and does not resolve symlinks before writing. DownloadTranslations still writes with os.MkdirAll(filepath.Dir(targetPath)) and os.WriteFile(targetPath, payload), which follow symlinks in existing parent directories or final path components. A malicious repository can include a symlink inside the configured base path, for example dist -> /tmp/outside, and use a valid translation pattern such as /dist/%locale%/%original_file_name%; the rendered path passes the Rel check but the write lands outside basePath. The same issue can affect IncludeSources because sourcePath is also written directly. There is no later O_NOFOLLOW, EvalSymlinks, or openat-style confinement at the write point. Therefore the original simple path traversal has been hardened, but the broader ability to write outside the configured base path remains exploitable via symlink escape.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-09)
