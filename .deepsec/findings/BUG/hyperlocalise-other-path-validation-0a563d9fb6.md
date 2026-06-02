# [BUG] Repository i18n target paths are used without repo-relative validation

**File:** [`apps/hyperlocalise-web/src/lib/agents/github/github-repository-automation-pull-translations.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/lib/agents/github/github-repository-automation-pull-translations.ts#L198-L251) (lines 198, 203, 227, 228, 251)
**Project:** hyperlocalise
**Severity:** BUG  •  **Confidence:** medium  •  **Slug:** `other-path-validation`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

This flow loads repository-controlled i18n config, builds pull-translation candidates from it, then passes each candidate targetPath directly into sandbox diff/write/commit helpers. The imported candidate builder derives targetPath from buckets.files[].to via token replacement without rejecting absolute paths, '..' segments, .git paths, hidden paths, or non-localization destinations. A malformed or hostile config can make automation write outside the intended repository workspace or attempt to create PRs touching unexpected files under the GitHub App identity. The PR is not auto-merged here, so this is primarily a reliability and integrity bug rather than a direct privilege escalation.

## Recommendation

Validate resolved target paths before use: require normalized repo-relative paths, reject absolute paths, '..' segments, .git/internal paths, symlink targets, and optionally enforce supported localization extensions or configured target scopes before writing or staging files.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-31)
