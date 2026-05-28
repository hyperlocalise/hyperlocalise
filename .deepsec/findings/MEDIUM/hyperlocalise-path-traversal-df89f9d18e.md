# [MEDIUM] Pull trusts manifest target paths without containment validation

**File:** [`apps/cli/cmd/sync_hyperlocalise.go`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/cli/cmd/sync_hyperlocalise.go#L276-L329) (lines 276, 316, 329)
**Project:** hyperlocalise
**Severity:** MEDIUM  •  **Confidence:** medium  •  **Slug:** `path-traversal`

## Owners

**Suggested assignee:** `140675996+NguyenChHieu@users.noreply.github.com` _(via last-committer)_

## Finding

runHyperlocalisePull reads target paths from the local manifest and writes downloaded output directly to those paths. The i18n config validates bucket paths under the config directory, but the manifest is not revalidated or recomputed from the current config. A tampered .hyperlocalise/jobs.json can map a locale to a path containing parent traversal or an absolute path, causing the CLI to overwrite files outside the intended project tree when pull runs with operator or CI privileges.

## Recommendation

Do not trust persisted targetPaths. Recompute target paths from the validated config/file plan during pull, or validate every manifest target path with the same containment checks used by i18nconfig before writing.

## Recent committers (`git log`)

- Chi Hieu Nguyen <140675996+NguyenChHieu@users.noreply.github.com> (2026-05-23)
- Minh Cung <cungminh2710@gmail.com> (2026-05-20)
