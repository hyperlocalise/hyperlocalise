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

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-09)
