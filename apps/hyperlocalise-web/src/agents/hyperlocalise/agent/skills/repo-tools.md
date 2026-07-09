---
id: repo-tools
requiresSandbox: true
tools: grep,fuzzySearch,read,glob,detectRepoConfig,gitHistory,todoWrite
---

## Repository tools

Use these tools for read-only inspection of the connected GitHub repository.

- Treat the repository as read-only. Do not modify files, run write commands, create tickets, review PR implementation, run checks, or summarize unrelated architecture unless another skill explicitly asks for it.
- Start with the most specific evidence the user provided: exact source text, exact string key, file path, route, component name, or repository hint.
- Use `grep` for exact text and key searches. Preserve capitalization and punctuation for the first search.
- Follow exact text searches with a case-insensitive search when the exact search has no useful matches.
- Use `fuzzySearch` for short UI labels when exact and case-insensitive searches are not enough.
- Use `glob` to discover locale, resource, route, component, or i18n config paths when needed.
- Use `read` to inspect surrounding lines before drawing conclusions from a match.
- Use `detectRepoConfig` when asked about i18n.yml or project locale setup.
- Prefer concrete `path:line` evidence over guesses from filenames.
- Stop once you have enough evidence for the active skill; do not continue into broad codebase exploration.

## Recent source-content changes (`gitHistory`)

Use `gitHistory` when the request asks what changed recently, asks for history/provenance, asks about "new translations" / new source copy in the repo, or asks for context for strings changed in a time window such as "last week".

### Procedure

1. Call `gitHistory` with `mode: "changedFiles"` and the requested `since`/`until` window (default to a recent window such as `"2 weeks ago"` when the user says "recent" without dates).
2. When no paths are provided, the tool discovers source files from `i18n.yml`, `i18n.jsonc`, `crowdin.yml`, `crowdin.yaml`, `.phrase.yml`, `phrase.yml`, or `phrase.yaml`.
3. If discovery returns no files, an empty file list, or a "no localization config" / "no source files were resolved" diagnostic, **keep exploring the repository**:
   - Use `detectRepoConfig` and/or `glob`/`grep` to find likely source locale files (for example `**/en*.json`, `**/en-US/**`, `**/locales/**`, `**/messages/**`, `**/i18n/**`, `**/*.messages.ts`, `**/lang/**`).
   - Call `gitHistory` again with `mode: "changedFiles"` and those discovered `paths`.
   - If still empty, broaden with common localization directories as `paths`, or use `mode: "fileDiff"` / `mode: "entryLog"` once you have candidate paths.
4. For files that changed, use `mode: "fileDiff"` to inspect added/updated source entries.
5. Use `mode: "entryLog"` or `mode: "blame"` only when a specific changed key/source string needs more provenance.

### Answer shape for recent-change listings

Summarize translation-relevant source changes as a scannable changelog: file path, approximate time window or commit summary when available, and the new/changed source strings or keys. Do **not** use the find-context "What it is / Where/how it shows / Translation guidance" sections for a bulk recent-changes question.

Do **not** conclude that recent translations are unavailable, or ask the user to link Crowdin/Hyperlocalise/TMS, solely because config-based path discovery was empty. Empty discovery means continue repo exploration.