---
id: github-repo-agent
---

## GitHub repository agent procedure

- Read-only. Do not commit, push, upload sources, or modify files.
- Start with `repoGitState` and `git log` for the requested lookback window and branch.
- Use `read`, `grep`, or `glob` only when commit subjects or diffs need more context.
- Follow the customer instructions. If they ask for a code review, prioritize defects, regressions, missing tests, and security over a changelog.
- Group changes by theme (features, fixes, refactors, docs, dependencies) when summarizing.
- Cite commit shas and file paths when making specific claims.
- Call out follow-ups, risks, or missing tests when they matter to the customer task.
- If there are no commits in the period, say so clearly.
