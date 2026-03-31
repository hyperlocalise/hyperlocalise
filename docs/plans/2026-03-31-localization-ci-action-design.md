# Localization CI Action Design

## Summary

This change introduces an opinionated GitHub Action at `hyperlocalise/hyperlocalise` for localization CI checks. The first supported workflow is a pull request drift check that runs `hyperlocalise run --dry-run`, streams the CLI output to the workflow log, uploads debugging artifacts, and fails by default when drift is detected.

The action is intentionally narrow in v1. It focuses on one high-value CI gate instead of becoming a generic CLI runner.

## Goals

- provide a simple GitHub Action for localization drift checks in pull requests
- use the existing Hyperlocalise CLI instead of adding GitHub-specific business logic to the product
- fail builds by default when localization drift is detected
- upload a plain-text artifact that tells reviewers what changed without requiring them to inspect JSON manually
- leave room to add more localization CI checks later without changing the action identity

## Non-Goals

- building a general-purpose Hyperlocalise command runner
- adding GitHub job summary output in v1
- supporting write-enabled sync workflows in the first release
- replacing existing repository CI workflows inside this monorepo

## Approaches Considered

### Recommended: opinionated CI action with named checks

Publish one action that is centered on localization CI workflows and accepts a `check` input. The action starts with `check=drift` as the only fully implemented mode. This keeps the interface focused on CI use cases while preserving a clean path to add future checks such as status snapshots or sync conflict gates.

### Alternative: single-purpose drift-only action

Publish an action that only supports drift detection. This is the smallest possible surface area, but it forces a second action or a breaking redesign when more CI checks are added.

### Alternative: generic CLI runner action

Publish an action that installs Hyperlocalise and runs arbitrary commands. This is flexible, but it weakens the product story and pushes CI policy decisions back onto every consumer repository.

## Repository and packaging

The action will live in the main repository: `hyperlocalise/hyperlocalise`.

Keeping the action in the monorepo lets the action ship alongside the CLI and matches the implementation in this change.

## Action shape

The v1 action will expose an opinionated interface:

- `check`: check name, defaults to `drift`
- `config-path`: optional path to `i18n.jsonc`
- `working-directory`: optional working directory
- `hyperlocalise-version`: optional pinned CLI version
- `fail-on-drift`: optional boolean, defaults to `true`
- `upload-artifact`: optional boolean, defaults to `true`

Although the interface includes `check`, v1 only needs to implement `drift`. Unsupported values should fail fast with a clear error.

## Drift check behavior

For `check=drift`, the action will:

1. install the requested Hyperlocalise CLI version
2. run `hyperlocalise run --dry-run --config <path> --output <artifact-dir>/drift-report.json`
3. stream CLI output directly to the GitHub Actions log
4. synthesize `<artifact-dir>/drift-summary.txt` from the JSON report when available
5. upload artifacts when enabled
6. exit non-zero when drift is detected and `fail-on-drift=true`

The logs are the primary user experience in v1. The action does not write a GitHub job summary yet.

## Failure contract

- command or configuration error: always fail
- drift detected with `fail-on-drift=true`: fail after uploading artifacts
- drift detected with `fail-on-drift=false`: pass and keep the artifacts for inspection
- no drift detected: pass

This makes the action useful both as a strict merge gate and as an adoption-friendly reporting tool.

## Artifacts

The action will upload two files when artifact upload is enabled:

- `drift-report.json`: raw machine-readable output from the CLI
- `drift-summary.txt`: human-readable summary for reviewers and CI debugging

`drift-summary.txt` should include:

- config path used
- command exit status
- whether drift was detected
- affected files, locales, groups, or buckets when those fields are present in the JSON report
- a fallback note when the report does not include file-level detail

If the CLI fails before producing JSON, the action should still try to write a minimal `drift-summary.txt` artifact that explains the failure.

## Implementation shape

The first version should use a composite action.

This repository already uses a composite action pattern in `.github/actions/go-bootstrap/action.yml`, and the v1 workflow is simple enough to express with shell steps plus artifact upload. If report parsing or output handling becomes more complex later, the action can move to a JavaScript implementation without changing the public contract.

## Caller experience

Example pull request workflow:

```yaml
name: localization-drift

on:
  pull_request:

jobs:
  drift:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v4

      - uses: hyperlocalise/hyperlocalise@v1
        with:
          check: drift
          config-path: i18n.jsonc
          hyperlocalise-version: v1.2.3
          fail-on-drift: true
          upload-artifact: true
```

## Testing

Validation should cover these cases:

- no drift: action passes
- drift detected with `fail-on-drift=true`: artifacts upload and the action fails
- drift detected with `fail-on-drift=false`: artifacts upload and the action passes
- malformed config or CLI runtime error: action fails and still writes a best-effort text artifact
- JSON reports missing optional detail fields: text artifact falls back gracefully

## Follow-up work

- add `check=status` for CI status snapshots
- add `check=sync-conflicts` for safe remote adapter conflict gates
- add GitHub job summary output when the artifact and log UX has settled
- document recommended rollout guidance for strict mode versus reporting-only mode
