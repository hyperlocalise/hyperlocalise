# [MEDIUM] Repository-controlled translation target paths are written without normalization or allowlisting

**File:** [`apps/hyperlocalise-web/src/lib/agents/github/github-repository-automation-pull-translations-export.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/lib/agents/github/github-repository-automation-pull-translations-export.ts#L126-L280) (lines 126, 129, 280)
**Project:** hyperlocalise
**Severity:** MEDIUM  •  **Confidence:** medium  •  **Slug:** `path-traversal`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

The `to` pattern from repository i18n config is accepted as `toPattern` and resolved directly into `targetPath` without rejecting absolute paths, `..` segments, `.git` paths, or non-localization destinations. That `targetPath` is later passed to `writeFilesToSandbox` in `github-repository-automation-pull-translations-pr.ts`, which forwards paths to Vercel Sandbox; the installed sandbox package documents that absolute paths are allowed and its normalizer does not constrain relative paths to the repository checkout. A repository contributor who can influence the i18n config can therefore make the automation write translated output outside the intended locale tree and potentially into Git control or sandbox files before subsequent Git commands run with the GitHub App installation credentials available.

## Recommendation

Validate resolved target paths before returning candidates: require relative POSIX paths, normalize them, reject empty paths, absolute paths, parent-directory traversal, `.git`/Git metadata paths, and unsupported extensions, and preferably require them to match the configured localization target scope.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-31)
