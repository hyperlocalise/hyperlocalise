---
id: review-translation-changes
name: Review translation changes
---

## Review translation changes

Review the repository changes in scope for localisation and translation risk.

- Read the commits, diffs and surrounding code for the changes in scope.
- Follow the **Translation review** procedure for per-key findings and P0/P1/P2 output.
- Judge code-adjacent localisation risk: hard-coded copy, i18n APIs, locale routing, fallback, formatters, and writeback.
- Cite commit SHAs and file paths for each finding.
- Ignore unrelated logic, security, and formatting issues unless they affect user-facing copy or locale behavior.

Code-layer review focus, in addition to translation review:

- Hard-coded user-facing copy and source strings that cannot be translated
- i18n API misuse, locale routing, fallback chains, and writeback regressions
- Locale-sensitive formatting outside catalog files

Report the **Translation review** sections. When P0 blockers exist, they come first.
