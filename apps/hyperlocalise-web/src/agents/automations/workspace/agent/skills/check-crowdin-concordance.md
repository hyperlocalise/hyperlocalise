---
id: check-crowdin-concordance
name: Check against Crowdin
---

## Check against Crowdin

Check the strings under review against the Crowdin project before reporting.

- Call `use_crowdin` with each changed key: source text, repository target value, and locale.
- When no earlier step produced changed keys, pass the strings named in the customer instructions.
- Follow the **Crowdin concordance review** procedure for lookups and response shape.
- Merge the Crowdin evidence into the finding for the same key. Do not add a separate Crowdin section.
- Stay read-only. Do not write translations back to Crowdin.
