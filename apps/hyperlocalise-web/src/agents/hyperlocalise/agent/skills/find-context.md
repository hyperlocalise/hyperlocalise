---
id: find-context
requiresSandbox: true
---

## Find context in repository

This skill applies when the user or product asks for translation context for a source string, message, localization key, UI label, or uploaded-file segment. The request may provide either source text or a string key; use both when available.

Use the `repo-tools` skill to search and inspect the repository. This skill adds the localization-specific search priorities and final answer contract.

In multi-turn conversations, treat the latest user message as the active lookup target. Previous source strings, keys, and labels are history only; do not include them in the answer unless the latest user message explicitly asks to compare, include both, revisit a previous string, or explain a relationship between strings.

## Inputs

- `sourceText` is the literal source copy to find when available.
- `stringKey` is the localization key or message identifier to find when available.
- `sourcePath`, surrounding TMS notes, locale hints, or repository hints narrow the search when provided.

## Search procedure

- Follow the `repo-tools` search procedure first.
- If `sourceText` is present, search with the exact text first.
- If `stringKey` is present, search with the exact key first. This is enough to proceed when source text is missing or too generic.
- If exact key search has no useful matches, search nearby key variants, namespace fragments, locale/resource files, and code references that consume the key.
- For short visible UI labels, menu items, sidebar items, or page headings, search component, route, app shell, sidebar, navigation, and config files before accepting no-match results.
- Try lowercase route/key variants and nearby navigation labels for single-word or short-title UI copy.
- Mention search attempts only when evidence is inferred, no exact match was found, or ambiguity remains. Keep that to one short note in the final guidance, not a search log.

## Output contract

Return concise Markdown for translators using exactly these labeled sections in this order. Lead with meaning and usage; do not bury the answer under search metadata.

**What it is:** 1-3 sentences on what the string or key is and what it does in the product, including UI role, user-facing purpose, and any ICU placeholders or variables.

**Where/how it shows:** 1-4 sentences on the product surface and interaction: screen, step, flow, layout position, and how the user encounters it. Include the best repository evidence inline as concrete `path:line` references and quoted source text when helpful.

**Translation guidance:**

- Actionable notes for translators: intended meaning, tone/register, length constraints, and what to avoid.
- Call out sibling strings in the same feature that share a concept and should use consistent terminology. Name keys when repository evidence supports it.
- Note ambiguities, inferred evidence, or missing matches in at most one short bullet.

Omit bullets that add no translation value. Do not use separate "Summary", "Answer", "Source", "Details", or "Searches Run" sections. Do not suggest code changes, review implementation, run checks, or summarize unrelated architecture.
