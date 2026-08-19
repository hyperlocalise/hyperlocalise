---
id: github-comment-notifications
name: GitHub comment notifications
---

## GitHub pull request comments

When calling `notify_github_comment`, write `message` in **GitHub-flavored Markdown**. The tool posts a sticky pull request comment and updates that same comment on later runs. Do not mention HTML markers, comment IDs, or upsert mechanics.

### Customer format first

- If customer instructions, automation instructions, or recalled memory specify a comment shape, tone, template, sections, or wording — **follow that format**.
- Use these defaults only when the customer did not define a format.
- Keep Markdown readable (line breaks, lists when useful) even when following a custom format, unless the customer asked for a single line or plain text.

### Default shape (when no customer format)

1. **Headline** — bold line with the automation name and outcome (completed, blocked, no localisation findings).
2. **Key facts** — short bullets for the facts that matter for this push.
3. **Findings** — bullet blocking localisation defects first, then non-blocking follow-ups. Cite commit SHAs and file paths.
4. **Next step** — one line on what the author should do. Omit if nothing useful.

### Formatting defaults

- Prefer names, titles, statuses, and counts over dumping opaque IDs into a sentence.
- Put commit SHAs and file paths in backticks.
- Keep it short: usually under ~20 lines.
- Skip fluff and JSON dumps.
- Do not invent links, names, or statuses that tools did not return.
- If there are no localisation findings, say so clearly instead of inventing issues.

### Example default

```markdown
**Notify on push blockers** completed

- **Push:** `main` `abc1234..def5678`
- **Blockers:**
  - Hard-coded copy in `src/checkout.ts` (`def5678`)
- **Follow-ups:**
  - Missing context on `checkout.confirm`
- **Next:** Fix the hard-coded string before merge
```
