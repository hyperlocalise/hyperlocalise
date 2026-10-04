# CLI QA validation for repositories and cloud scans

## Decision

Use one local Go QA runner for repository checks, individual source/target pairs,
and project QA scan pages. The runner uses `internal/i18n/segmentvalidate` for
format, length, and optional QA modes. A versioned JSON policy carries the same
12 `{ enabled, severity }` settings as project QA. Optional glossary terms and
accepted spelling words are supplied as local context.

`hl validate` accepts `--source-text` or `--source-file`, `--target-text` or
`--target-file`, and a target locale. It also accepts a JSON batch input file so
the cloud scan can validate a page in one process. The command emits structured
JSON, including checks that were skipped because a local dependency was absent.
Findings are data, so they do not cause a nonzero exit in JSON mode; malformed
input and execution failures do.

`hl check` keeps its existing default file integrity checks. With a QA policy,
it applies the same segment QA runner to mapped repository entries. The policy
may be passed by path or referenced from `i18n.yml`.

The Vercel translation QA workflow builds a policy snapshot from the policy
captured on the scan run, project glossary terms, and accepted spelling words.
For each page it writes the policy and segments to a disposable sandbox with
the CLI installed, runs `hl validate` once, reads the JSON results, and persists
findings with the existing page retry and finalization behavior. It no longer
calls the Go service once per segment. The sandbox is stopped after each page,
including failures, so a retry can recreate it independently.

## Constraints

- Preserve existing `hl check` behavior when no QA policy is supplied.
- Keep the policy schema versioned and reject unsupported or incomplete policy
  files. Do not silently replace a cloud project's chosen severities.
- Use the same finding types as project QA. Keep file integrity findings distinct
  from the cloud QA suite in repository output.
- Report spelling as skipped when Hunspell or its locale dictionary is absent.
  The command must remain usable offline and without service credentials.
- Do not put source or target text in command arguments or application logs.
  Transfer scan inputs through sandbox files and remove the disposable sandbox.
- Keep the existing QA run, finding, retry, and summary database contracts.

## Verification

Compare CLI and Go service results for representative format, QA, length, and
spelling cases. Exercise text, file, and batch inputs; policy filtering and
severity; repository check integration; sandbox failure and cleanup; and page
retry idempotence. Run the Go and web checks required by `AGENTS.md`.
