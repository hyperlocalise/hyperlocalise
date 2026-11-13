---
id: file-issues-for-findings
name: File issues for findings
---

## File issues for findings

Track the findings from earlier steps as Queries issues in the project.

- Call `list_issues` first to read the open issues. Search by the key, file path or wording of each finding.
- Call `create_issue` with one issue for each finding that has no matching open issue. An open issue for the same key and locale is a match: do not file a duplicate.
- Pass an empty list when there are no findings, or when every finding already has an open issue.
- Title: the key or file and the problem, in one line.
- Description: what is wrong, where it is (commit, file path, locale), and the recommended fix.
- Set `priority` from the finding: P0 for blockers, P1 for defects to fix before release, P2 for follow-ups. Do not file findings marked OK.
- Set `targetLocale` and `sourcePath` when the finding names them.
- File at most 20 issues in a run. When there are more findings, file the highest priority first and say how many were left out.
