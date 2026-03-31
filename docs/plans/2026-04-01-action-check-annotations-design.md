# Action check annotations design

## Summary

This change adds optional GitHub workflow annotations to the `check` mode of the Hyperlocalise action. It also adds count outputs and a GitHub step summary so workflows can show how many errors and warnings the run produced.

## Goals

- show inline GitHub annotations for `check` findings when a file and line can be resolved
- report severity totals such as errors and warnings in the action summary
- keep the feature inside the existing composite action

## Approach

### Recommended: enrich the CLI report and let the action emit annotations

Add severity and annotation location fields to `hyperlocalise check` findings. The action reads those fields from the JSON report, emits `::error` and `::warning` workflow commands, and writes a step summary with counts.

This keeps GitHub-specific behavior in the action while preserving a clean machine-readable report from the CLI.

### Alternative: file-level annotations only

Emit annotations without line numbers. This is simpler, but it produces weaker review feedback and does not meet the inline annotation goal.

### Alternative: create custom check runs

Use the GitHub Checks API to publish a separate check run with annotations and summary text. This offers more control over the summary UI, but it requires extra permissions and more GitHub-specific logic.

## Design

- Add `severity`, `annotationFile`, and `annotationLine` to `check` findings.
- Add `bySeverity` to the JSON summary.
- Add `github-annotations` to the action inputs. Default it to `true`.
- Add `findings-total`, `error-count`, and `warning-count` to the action outputs.
- Write a GitHub step summary that includes totals and breakdowns.
- Emit workflow annotations for the first 50 findings to avoid excessive log noise.

## Line resolution

The current parser API returns key-value pairs, not source spans. This change resolves annotation lines with a best-effort lookup against the source or target file content.

- Target-file findings prefer the target file.
- Missing-key and missing-file findings can fall back to the source file.
- If no better match is found, line `1` is used.

This is good enough for the first version and keeps the change small. A future parser-level span API can replace the lookup without changing the action contract.

## Testing

- extend `apps/cli/cmd/check_test.go` to cover severity and annotation metadata
- run the `apps/cli/cmd` test package
- run a sample Node invocation of the action summary script to verify counts, step summary output, and emitted annotations
