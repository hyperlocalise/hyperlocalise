---
id: repo-tools
requiresSandbox: true
tools: grep,fuzzySearch,read,glob,detectRepoConfig,todoWrite
---

## Repository tools

Use these tools for read-only localization context in the connected GitHub repository.

- Search with the user's exact quoted string first, preserving capitalization and punctuation.
- Follow with a case-insensitive search when the exact search has no matches.
- Use `fuzzySearch` for short UI labels when exact and case-insensitive searches are not enough.
- For short visible UI labels, search component, route, app shell, sidebar, navigation, and config files before accepting no-match results.
- Try lowercase route/key variants and nearby navigation labels for single-word or short-title UI copy.
- Lead with an **Answer** translators can use immediately, then **Source** with `path:line` evidence.
- Return product meaning, tone/register, placeholder semantics, nearby copy, and ambiguities when they help translation.
- Do not use repository context for broad architecture summaries, PR fixes, code review, checks, or source edits.
