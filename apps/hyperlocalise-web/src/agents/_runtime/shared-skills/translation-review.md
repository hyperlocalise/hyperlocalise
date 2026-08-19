---
id: translation-review
name: Translation review
---

## Translation review

Use this procedure when reviewing localisation or translation changes in a repository. Pair with **Recent source-content changes** to gather diffs, then review **every changed key** individually.

Keep output **scannable**. One line per key. Do not repeat the same key in multiple sections.

### Per-key review

- Collect added and updated keys from catalog diffs with old → new values.
- Review each changed key for placeholders, ICU, terminology, and locale fit.
- Assign each key exactly one outcome: **P0**, **P1**, **P2**, or **OK**.

### Priority tiers

- **P0 (blocker):** Missing keys, broken ICU/placeholders, placeholder mismatch, untranslated shipped-locale copy, wrong locale file, RTL-breaking markup, runtime formatting breakage.
- **P1 (should fix):** Terminology/glossary conflict, ambiguous source, truncated values, gender/agreement issues, TM/glossary mismatch.
- **P2 (follow-up):** Style polish, optional terminology alignment, human review with no proven defect.
- **OK:** Changed value looks correct; note only if something non-obvious was checked (ICU, placeholders).

### Required report sections

Use these sections **in this order**.

#### Blockers (P0)

One line per finding. Format:

`- \`key\` · locale · file — what's wrong — why fix is needed → fix`

The **why** is one short clause: user impact, runtime risk, glossary/compliance rule, or locale rule broken. Do not skip it.

If none: `None.`

#### Should fix (P1)

Same one-line format. If none: `None.`

#### Follow-ups (P2)

Same one-line format. If none: `None.`

#### Keys OK

Changed keys with **no** P0/P1/P2. One line each. Do **not** list keys already under P0/P1/P2.

`- \`key\` · locale — old→new` or `- \`key\` · locale — added "…"`

If every changed key has a finding, write `None.` If no catalog changes: `No locale catalog changes in this window.`

#### Tooling

One line each:

- **Hyperlocalise validation:** ran | skipped | failed — config path and reason when not run
- **Crowdin concordance:** ran (N keys) | skipped | not configured
- **Coverage:** N keys · N locales · N commits

#### Summary

`P0: N · P1: N · P2: N · OK: N`

### Compact example

```markdown
## Blockers (P0)
None.

## Should fix (P1)
- `btn.save` · de-DE · lang/de-DE.json — `Sichern` ≠ glossary `Speichern` — breaks approved DE product terminology → use `Speichern`

## Follow-ups (P2)
- `onboarding.title` · de-DE · lang/de-DE.json — informal "du" in heading — tone may clash with formal settings copy elsewhere → align with Sie/register

## Keys OK
- `nav.home` · fr-FR — "Home"→"Accueil"
- `nav.back` · fr-FR — added "Retour"

## Tooling
- **Hyperlocalise validation:** ran — scribe-fe-v2/i18n.yml
- **Crowdin concordance:** ran (2 keys)
- **Coverage:** 3 keys · 2 locales · 1 commit

## Summary
P0: 0 · P1: 1 · P2: 1 · OK: 2
```

### Output rules

- **One line per key.** Format for findings: `what's wrong — why fix is needed → fix`. No Issue/Recommendation sub-blocks.
- **No duplication.** A key appears in P0/P1/P2 **or** Keys OK, never both.
- Do **not** write "Overall risk: Low/Medium/High" or file-level summaries instead of keys.
- Do **not** append standalone Crowdin sections.
- Always include every section above, even when empty (`None.`).

### Crowdin concordance (when available)

When `use_crowdin` is enabled, follow **Crowdin concordance review**. Fold glossary/TM/style into the **same one-line** P1/P2 entry (for conflicts) or omit from Keys OK when OK. Never a second Crowdin block.
