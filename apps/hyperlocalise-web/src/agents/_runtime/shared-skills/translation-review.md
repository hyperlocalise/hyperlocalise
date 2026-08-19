---
id: translation-review
name: Translation review
---

## Translation review

Use this procedure when reviewing localisation or translation changes in a repository. Pair with **Recent source-content changes** to gather diffs, then review **every changed key** individually.

If `i18n.yml` exists, run Hyperlocalise validation with `runHyperlocaliseCli` (`hl check`) against the translation files it maps. Skip that step when no `i18n.yml` is present. Do not look for `i18n.jsonc`.

Keep output **scannable**. One entry per key. Do not repeat the same key in multiple sections.

### Per-key review

- Collect added and updated keys from catalog diffs with old → new values.
- Review each changed key for placeholders, ICU, terminology, and locale fit.
- Assign each key exactly one outcome: **P0**, **P1**, **P2**, or **OK**.

### Priority tiers

- **P0 (high):** Missing keys, broken ICU/placeholders, placeholder mismatch, untranslated shipped-locale copy, wrong locale file, RTL-breaking markup, runtime formatting breakage.
- **P1 (medium):** Terminology/glossary conflict, ambiguous source, truncated values, gender/agreement issues, TM/glossary mismatch.
- **P2 (low):** Style polish, optional terminology alignment, human review with no proven defect.
- **OK:** Changed value looks correct; note only if something non-obvious was checked (ICU, placeholders).

### Required report format

Start with a results header, then priority sections. Match the code-review results shape.

#### Header

```markdown
## Translation Review Results

**Keys reviewed**: N
**Issues found**: X high priority / Y medium priority / Z low priority
```

`N` = all changed keys reviewed. Counts must match the sections below.

#### Finding entry shape

Each P0/P1/P2 entry is a bullet plus a recommendation blockquote:

```markdown
- **`key` · locale · `file`** — Brief description (include why it matters)
  > Recommendation: How to fix
```

- **Description** — what's wrong and **why** (user impact, runtime risk, glossary rule, locale rule). One sentence.
- **Recommendation** — concrete fix: target string, file edit, glossary term, or follow-up action.

If a section has no findings, write `None.` under the heading.

#### Section order

Use these sections **in this order**:

1. `### High Priority (P0)`
2. `### Medium Priority (P1)`
3. `### Low Priority (P2)`
4. `### Keys OK`
5. `### Tooling`

#### Keys OK

Changed keys with **no** P0/P1/P2. One line each. Do **not** list keys already under a priority section.

`- **`key` · locale** — old→new` or `- **`key` · locale** — added "…"`

If every changed key has a finding: `None.` If no catalog changes: `No locale catalog changes in this window.`

#### Tooling

One line each:

- **Hyperlocalise validation:** ran | skipped | failed — `i18n.yml` path and reason when not run
- **Crowdin concordance:** ran (N keys) | skipped | not configured
- **Coverage:** N keys · N locales · N commits

### Compact example

```markdown
## Translation Review Results

**Keys reviewed**: 4
**Issues found**: 0 high priority / 1 medium priority / 1 low priority

### High Priority (P0)

None.

### Medium Priority (P1)

- **`btn.save` · de-DE · `lang/de-DE.json`** — `Sichern` conflicts with approved glossary term `Speichern` — breaks consistent DE product terminology
  > Recommendation: Replace with `Speichern`

### Low Priority (P2)

- **`onboarding.title` · de-DE · `lang/de-DE.json`** — informal "du" in heading — tone may clash with formal settings copy elsewhere
  > Recommendation: Align with Sie/register used in settings strings

### Keys OK

- **`nav.home` · fr-FR** — "Home"→"Accueil"
- **`nav.back` · fr-FR** — added "Retour"

### Tooling

- **Hyperlocalise validation:** ran — scribe-fe-v2/i18n.yml
- **Crowdin concordance:** ran (2 keys)
- **Coverage:** 4 keys · 2 locales · 1 commit
```

### Output rules

- **Description + recommendation.** Do not collapse into one line with `→`. Use the blockquote for the fix.
- **No duplication.** A key appears in P0/P1/P2 **or** Keys OK, never both.
- Do **not** write "Overall risk: Low/Medium/High" or file-level summaries instead of keys.
- Do **not** append standalone Crowdin sections.
- Always include every section above, even when empty (`None.`).
- When P0 blockers exist, they must appear under **High Priority** first so readers see them immediately.

### Crowdin concordance (when available)

When `use_crowdin` is enabled, follow **Crowdin concordance review**. Fold glossary/TM/style into the **same** P1/P2 entry (description + recommendation). Never a second Crowdin block.
