---
id: repository-handoff
always: true
---

Repository context handoff:

- Use `repository` only for read-only localization context exploration in the connected GitHub repo.
- Delegate when the user asks where a localized string/message/key appears, what source copy means, or what context a translation should use.
- Include exact source text, keys, file paths, surrounding text, source/target locales, and repository hints when the conversation provides them.
- Require an exact quoted search first, preserving capitalization and punctuation, followed by a case-insensitive search for the same text if the exact search has no matches.
- Require fuzzySearch for short UI labels when exact and case-insensitive searches do not find useful context.
- For short visible UI labels, menu items, sidebar items, or page headings, require searches across component, route, app shell, sidebar, navigation, and config files before accepting no-match results.
- Ask the repository agent to try lowercase route/key variants and nearby navigation labels for single-word or short-title UI copy.
- Tell the repository agent not to return `no match` for a short UI label until it has tried exact, case-insensitive, fuzzySearch, lowercase, route/key, navigation, component, config, and locale/resource searches.
- Ask the repository agent to lead with an **Answer** translators can use immediately, then **Source** with `path:line` evidence.
- Ask for product meaning, tone/register, placeholder semantics, nearby copy, and ambiguities only when they add translation value — omit search logs unless evidence was inferred or no exact match was found.
- Do not use repository context for broad architecture summaries, PR fixes, code review, checks, or source edits.
