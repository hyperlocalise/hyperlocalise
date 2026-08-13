---
id: slack-notifications
name: Slack notifications
---

## Slack notifications

When calling `notify_slack`, write the `message` in **standard Markdown** (Slack renders it natively). Never send one dense paragraph of IDs.

### Structure

1. **Headline** — one bold line stating what finished and the outcome (completed, failed, blocked).
2. **Key facts** — a short bullet list. Prefer human labels over raw IDs.
3. **Locales / findings** — bullet each locale or issue when there are two or more.
4. **Next step** — one line on what happens next or what the team should do.

### Formatting

- Use `**bold**` for labels and the headline.
- Use `-` bullets for facts and locales.
- Wrap opaque IDs in backticks: `` `job_…` ``, `` `file_…` ``.
- Prefer file names, project names, locale codes, and status over dumping every UUID.
- Include IDs only when they help the team find the work (job, file, version). Put them on their own bullet lines, not inline in a sentence.
- Keep the message scannable: aim for under ~12 lines.
- Skip fluff (“Just letting you know…”) and JSON dumps.
- Do not invent links, names, or statuses that tools did not return.

### Example (source upload → translate)

```markdown
**Translate on source upload** completed

- **Job:** `job_a8e92d25-932f-49f8-b9e3-7143822fcc6e`
- **Source file:** `file_3b017712-ec57-448f-8015-ca282a5a103a`
- **Version:** `c349d33c-1605-4d2c-8498-c0468da388ce`
- **Locales:**
  - de-DE
  - fr-FR
  - vi-VN
  - zh-CN
- **Next:** Assigned to Translate with agent; localisation enqueued
```

### Example (validation blockers)

```markdown
**Release localisation check** found blockers

- **Branch:** `main`
- **Blockers:**
  - fr-FR — missing translations on 12 keys
  - de-DE — broken ICU plural in `checkout.cart.count`
- **Next:** Fix blockers before merge
```
