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
- Use `gitHistory` when the request asks what changed recently, asks for history/provenance, or asks for context for strings changed in a time window such as "last week".
- Prefer concrete `path:line` evidence over guesses from filenames.
- Stop once you have enough evidence for the active skill; do not continue into broad codebase exploration.
