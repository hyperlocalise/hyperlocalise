---
id: crowdin-concordance-review
name: Crowdin concordance review
---

## Crowdin concordance review

Use when `use_crowdin` is enabled. Stay read-only. **No separate Crowdin section.**

### When to run

After `use_github_repository`, before notify. Pass each changed key with source, repo target, and locales.

### Tools

1. **search_concordance** — per changed source expression
2. **get_style_guide** — when tone/register matters
3. **recommend_translation** — only on glossary/TM conflict or ambiguous wording

### `use_crowdin` response shape

One entry per queried key. Use the same description + recommendation shape as **Translation review**:

```markdown
- **`key` · locale** — Brief description (include why)
  > Recommendation: verdict or fix
```

Examples:

- **`btn.save` · de-DE** — glossary `Speichern` ≠ repo `Sichern` — breaks approved terminology

  > Recommendation: P1 — use `Speichern`

- **`nav.home` · fr-FR** — TM matches `Accueil` — consistent with prior UI copy
  > Recommendation: OK — no change

Omit keys not queried.

### Merge into the final report

- **Conflict** → fold into the P1/P2 entry under **Translation Review Results**: description cites Crowdin evidence; recommendation gives the fix.
- **Supports repo** → key stays in **Keys OK**; no extra Crowdin line needed.
- **No hit** → omit unless terminology was ambiguous; then add under **Low Priority (P2)** with recommendation `Review terminology with locale owner`.

Do **not** duplicate: if P1 already cites glossary `Speichern`, do not also list the key under Keys OK with a Crowdin note.

### Banned

- `## Crowdin concordance` / `## Crowdin review` sections
- Multi-line blocks per key (Glossary/TM/Style/Verdict bullets)
- Project-wide "terminology looks fine" without keys
