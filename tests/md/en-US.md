---
title: "Release checklist"
description: "Validate docs updates before you sync localized content."
---

# Release checklist

Ship updates without breaking placeholders like `{{locale}}` or flags such as `--dry-run`.

Use the [status reference](https://example.com/docs/status?tab=cli#dry-run) before you push changes.

Reference links should also survive: [CLI guide][cli-guide] and ![Diagram](https://example.com/assets/flow(chart).png).

> Keep repeated labels stable.
> Keep repeated labels stable.
>
> Preserve `MDPH_0_END` as literal prose, not as a parser token.

- Review "Sync summary" in the terminal.
- Confirm links in [Troubleshooting](https://example.com/docs/troubleshooting#common-errors) stay intact.
- Do not translate `hyperlocalise run --group docs`.
- Escape characters like `\*literal asterisks\*` and `docs\[archive]` carefully.

| Step | Owner | Notes |
| ---- | ----- | ----- |
| Prepare | Docs | Replace only the sentence, not `docs/{{locale}}/index.mdx`. |
| Verify | QA | Check "Sync summary" appears in the report and review [CLI guide][cli-guide]. |
| Publish | Ops | Upload ![Diagram](https://example.com/assets/flow(chart).png) after approval. |

1. Open `docs/index.mdx`.
2. Search for "Sync summary".
3. Compare with the previous release notes.

- Parent item
  - Nested note with [Troubleshooting](https://example.com/docs/troubleshooting#common-errors) and `{{locale}}`

```bash
hyperlocalise run --group docs --dry-run
```

Final reminder: "Sync summary" must match across the checklist and report.

[cli-guide]: https://example.com/docs/cli(reference)
