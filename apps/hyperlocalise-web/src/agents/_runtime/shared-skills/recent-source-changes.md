---
id: recent-source-changes
name: Recent source changes
---

## Recent source-content changes (`gitHistory`)

Use `gitHistory` for localisation review of recent repository changes. Prefer it over raw `git log` / `git diff` in bash.

`gitHistory` runs git from the clone root. If the sandbox cwd is a parent of the clone, it uses `git -C <clone>`. If a path is prefixed with the repository directory name (for example `scribe-fe-v2/src/locales/en.json`), strip that prefix. `git diff` exit code 1 means differences were found — that is success and the patch is in the tool output.

### Procedure

1. Call `gitHistory` with `mode: "changedFiles"` and the requested `since`/`until` window (for a daily lookback use `"24 hours ago"`; for a push, use the push commit range).
2. When no paths are provided, the tool discovers source files from **every tracked** `i18n.yml`, `i18n.jsonc`, `crowdin.yml`, `crowdin.yaml`, `.phrase.yml`, `phrase.yml`, or `phrase.yaml` in the repository (including nested paths), and merges their source `from`/`source` patterns.
3. If discovery returns no files, an empty file list, or a "no localization config" / "no source files were resolved" diagnostic, **keep exploring the repository**:
   - Use `detectRepoConfig` and/or `glob`/`grep` to find likely source locale files (for example `**/en*.json`, `**/en-US/**`, `**/locales/**`, `**/messages/**`, `**/i18n/**`, `**/*.messages.ts`, `**/lang/**`).
   - Call `gitHistory` again with `mode: "changedFiles"` and those discovered `paths`.
   - If still empty, broaden with common localization directories as `paths`, or use `mode: "fileDiff"` / `mode: "entryLog"` once you have candidate paths.
4. For files that changed, use `mode: "fileDiff"` to inspect source entries. Collect added and updated keys/source strings from `+` lines together with the previous values from matching `-` lines. Also read localisation logic changes (i18n API usage, locale routing, fallback, formatters, writeback) — not only catalogs.
5. Use `mode: "entryLog"` or `mode: "blame"` only when a specific currently present key/source string needs more provenance.

Do **not** conclude that nothing changed, or that there are no localisation findings, solely because config-based path discovery was empty or a raw git command failed. Empty discovery means continue repo exploration. A failed `git diff` is not "no findings."
