---
id: slack-notifications
name: Slack notifications
---

## Slack notifications

When calling `notify_slack`, write `message` in **Markdown** (Slack renders it natively). Make it easy for a human to scan in a busy channel.

### Customer format first

- If customer instructions, automation instructions, or recalled memory specify a Slack message shape, tone, template, sections, or wording — **follow that format**.
- Use these defaults only when the customer did not define a format.
- Still keep Markdown readable (line breaks, lists when useful) even when following a custom format, unless the customer asked for a single line or plain text.

### Default shape (when no customer format)

1. **Headline** — bold line with the automation name and outcome (completed, failed, blocked, nothing to do).
2. **Key facts** — short bullets for the facts that matter for this run.
3. **Details** — bullet each item when there are two or more related values (locales, findings, repos, PRs, entries, etc.).
4. **Next step** — one line on what happens next or what the team should do. Omit if nothing useful.

### Formatting defaults

- Prefer names, titles, statuses, and counts over dumping opaque IDs into a sentence.
- Put IDs on their own bullets in backticks when the team needs them to find the work.
- Keep it short: usually under ~12 lines.
- Skip fluff and JSON dumps.
- Do not invent links, names, or statuses that tools did not return.

### Example default

```markdown
**Weekly digest** completed

- **Window:** last 24 hours
- **Highlights:**
  - 3 PRs merged
  - 1 migration still open
- **Next:** Review the open migration before Friday
```
