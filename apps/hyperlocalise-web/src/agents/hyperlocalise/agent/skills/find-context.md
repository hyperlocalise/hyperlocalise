---
id: find-context
requiresSandbox: true
---

## Find context in repository

This skill applies when the user or product asks for translation context for source text, messages, localization keys, UI labels, or uploaded-file segments — either for one string/key or for every recently changed source entry in a time window.

Use the `repo-tools` skill to search and inspect the repository. This skill adds the localization-specific search priorities and final answer contract.

In multi-turn conversations, treat the latest user message as the active lookup target. Previous source strings, keys, and labels are history only; do not include them in the answer unless the latest user message explicitly asks to compare, include both, revisit a previous string, or explain a relationship between strings.

**List-only recent changes** (no context requested) belong to `repo-tools` changelog answers — do not invent context sections for those. **Recent changes with context** belong here: discover with `gitHistory`, then find context for each discovered key.

## Inputs

- `sourceText` is the literal source copy to find when available.
- `stringKey` is the localization key or message identifier to find when available.
- `sourcePath`, surrounding TMS notes, locale hints, or repository hints narrow the search when provided.
- For recent-change + context requests, a time window (`since` / `until`, or phrases like "last week") replaces a single `sourceText`/`stringKey` until `gitHistory` produces the key list.

## Modes

### A. Specific string or key

Use when the user provides (or clearly means) one source string or key.

### B. Recent changes with full context

Use when the user asks for recently added/changed source copy **and** wants context for those entries (for example "new translations last week and give me all the context", "what changed and what does each mean").

Procedure:

1. Follow the `repo-tools` **Recent source-content changes** procedure to call `gitHistory` (`changedFiles` → `fileDiff`, with path fallbacks when discovery is empty).
2. From the diffs, extract the set of **newly added or meaningfully changed source keys/strings** (prefer additions and content changes; skip churn-only formatting unless nothing else changed).
3. For **each** extracted key or source string, run the specific-string search procedure below (exact key/text → usage → surrounding UI). Reuse file reads across keys in the same feature when possible.
4. Answer with one find-context section block per discovered entry. Lead with a one-line inventory of the keys covered, then the per-key sections.
5. If many entries are found, still cover them all when practical; group closely related sibling keys under one feature heading but keep a distinct What it is / Where/how it shows / Translation guidance block per key. If the step budget is tight, prioritize newly **added** keys over minor edits and note any remaining keys that still need context.

Do **not** stop after the changelog inventory when the user asked for context. Do **not** ask for Crowdin/TMS linkage because config discovery was empty — keep exploring the repo.

## Search procedure (per key / source string)

- Follow the `repo-tools` search procedure first.
- When the key came from a recent `gitHistory`/`fileDiff` result, you may use `entryLog` / `blame` only if provenance helps; otherwise search usage and read surrounding code as usual.
- If `sourceText` is present, search with the exact text first.
- If `stringKey` is present, search with the exact key first. This is enough to proceed when source text is missing or too generic.
- If exact key search has no useful matches, search nearby key variants, namespace fragments, locale/resource files, and code references that consume the key.
- For short visible UI labels, menu items, sidebar items, or page headings, search component, route, app shell, sidebar, navigation, and config files before accepting no-match results.
- Try lowercase route/key variants and nearby navigation labels for single-word or short-title UI copy.
- Mention search attempts only when evidence is inferred, no exact match was found, or ambiguity remains. Keep that to one short note in the final guidance, not a search log.

## Output contract

### Specific string or key

Return concise Markdown for translators using exactly these labeled sections in this order. Lead with meaning and usage; do not bury the answer under search metadata.

**What it is:** 1-3 sentences on what the string or key is and what it does in the product, including UI role, user-facing purpose, and any ICU placeholders or variables.

**Where/how it shows:** 1-4 sentences on the product surface and interaction: screen, step, flow, layout position, and how the user encounters it. Include the best repository evidence inline as concrete `path:line` references and quoted source text when helpful.

**Translation guidance:**

- Actionable notes for translators: intended meaning, tone/register, length constraints, and what to avoid.
- Call out sibling strings in the same feature that share a concept and should use consistent terminology. Name keys when repository evidence supports it.
- Note ambiguities, inferred evidence, or missing matches in at most one short bullet.

### Recent changes with full context

Start with a short inventory (time window + keys/source strings found). Then, for each key, emit:

`### \`keyOrQuotedSource\`` (include source path when known)

followed by the same **What it is** / **Where/how it shows** / **Translation guidance** sections for that key.

Omit bullets that add no translation value. Do not use separate "Summary", "Answer", "Source", "Details", or "Searches Run" sections. Do not suggest code changes, review implementation, run checks, or summarize unrelated architecture.
