# hyperlocalise

Hyperlocalise is AI-native localization infrastructure for modern apps.

It combines a local-first CLI, CI automation, and storage adapters so localization workflows can live inside your engineering system instead of beside it.

[![Go Report Card](https://goreportcard.com/badge/github.com/hyperlocalise/hyperlocalise)](https://goreportcard.com/report/github.com/hyperlocalise/hyperlocalise)
[![CI](https://github.com/hyperlocalise/hyperlocalise/actions/workflows/ci.yml/badge.svg)](https://github.com/hyperlocalise/hyperlocalise/actions/workflows/ci.yml)

## Docs

The full product documentation lives at [hyperlocalise.dev/docs](https://hyperlocalise.dev/docs).

- Getting started: [Install](https://hyperlocalise.dev/docs/getting-started/install), [Quickstart](https://hyperlocalise.dev/docs/getting-started/quickstart), [First project](https://hyperlocalise.dev/docs/getting-started/first-project)
- Configuration: [i18n config](https://hyperlocalise.dev/docs/configuration/i18n-config), [provider credentials](https://hyperlocalise.dev/docs/configuration/provider-credentials)
- Commands: [CLI overview](https://hyperlocalise.dev/docs/commands/overview), [`run`](https://hyperlocalise.dev/docs/commands/run), [`eval`](https://hyperlocalise.dev/docs/commands/eval), [`status`](https://hyperlocalise.dev/docs/commands/status), [`sync pull`](https://hyperlocalise.dev/docs/commands/sync-pull), [`sync push`](https://hyperlocalise.dev/docs/commands/sync-push)
- Workflows: [local generation](https://hyperlocalise.dev/docs/workflows/local-generation), [CI automation](https://hyperlocalise.dev/docs/workflows/ci-automation), [TMS curation loop](https://hyperlocalise.dev/docs/workflows/tms-curation-loop)
- Providers: [provider overview](https://hyperlocalise.dev/docs/providers/overview)
- TMS adapters: [storage overview](https://hyperlocalise.dev/docs/storage/overview)

## Install

Install the latest stable CLI:

```bash
curl -fsSL https://raw.githubusercontent.com/hyperlocalise/hyperlocalise/main/install.sh | bash
```

Pin a specific release:

```bash
curl -fsSL https://raw.githubusercontent.com/hyperlocalise/hyperlocalise/main/install.sh | VERSION=v1.2.3 bash
```

Install the Hyperlocalise skill from this repository:

```bash
npx skills add . --skill hyperlocalise
```

Install it directly from GitHub:

```bash
npx skills add https://github.com/hyperlocalise/hyperlocalise --skill hyperlocalise
```

## CLI overview

The CLI centers on four workflows:

- `run`: generate local translations and write target files
- `eval`: score and compare translation quality
- `sync`: pull from or push to supported storage adapters
- `status`: report translation coverage and review state

Other commands include `init`, `completion`, `update`, and `version`.

Use `hyperlocalise --help` for the local command surface, or see the docs for full flags, examples, and provider-specific setup.

## GitHub Action

This repository also ships a composite GitHub Action at [`action.yml`](action.yml).

Current scope:

- Action name: `Hyperlocalise CI`
- Supported checks in `v1`: `drift` and `check`
- `drift` runs `hyperlocalise run --dry-run` and reports planned localization changes
- `check` runs `hyperlocalise check --format json` and reports localization integrity findings

Example:

```yaml
jobs:
  drift:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v4

      - uses: hyperlocalise/hyperlocalise@v1
        with:
          check: check
          config-path: i18n.jsonc
          hyperlocalise-version: latest
          fail-on-findings: true
          upload-artifact: true
```

### GitHub Action settings

Inputs from [`action.yml`](action.yml):

- `check`: check name. Supported values: `drift`, `check`. Default: `drift`
- `config-path`: path to the i18n config file. Default: `i18n.jsonc`
- `working-directory`: working directory for the check. Default: `.`
- `hyperlocalise-version`: CLI version to install. Default: `latest`
- `fail-on-drift`: fail the action when drift is detected. Default: `true`
- `fail-on-findings`: fail the action when `check` findings are detected. Default: `true`
- `upload-artifact`: upload the JSON report and text summary. Default: `true`
- `github-annotations`: emit inline GitHub workflow annotations for `check` findings. Default: `true`

Outputs:

- `drift-detected`: `true`, `false`, or `unknown`
- `findings-detected`: `true`, `false`, or `unknown`
- `cli-exit-code`: exit code returned by the Hyperlocalise CLI
- `report-path`: path to the generated JSON report
- `summary-path`: path to the generated text summary
- `findings-total`: total number of reported errors and warnings
- `error-count`: number of error-level findings
- `warning-count`: number of warning-level findings

Operational notes:

- If the CLI fails before completing a clean report run, the action fails.
- If the report state cannot be determined, the action fails.
- When `upload-artifact` is enabled, the action uploads both the JSON report and the text summary.
- When `fail-on-drift` is `false`, the action can be used in reporting-only mode.
- When `fail-on-findings` is `false`, the `check` mode can be used in reporting-only mode.
- When GitHub step summaries are available, the action writes counts such as `Errors: 3` and `Warnings: 5` to the run summary.
- In `check` mode, the action can emit inline GitHub annotations when the report includes file and line metadata.

## Supported integrations

LLM providers are documented in the docs site and currently include `openai`, `azure_openai`, `anthropic`, `lmstudio`, `groq`, `mistral`, `ollama`, `gemini`, and `bedrock`.

Storage adapters are documented in the docs site and in `internal/i18n/storage/`, with support for `crowdin`, `lilt`, `lokalise`, `phrase`, `poeditor`, and `smartling`.

## Development

Useful repo paths:

- `apps/cli/`: CLI application entrypoint
- `apps/cli/cmd/`: CLI command handlers
- `apps/web/`: web app workspace
- `internal/`: shared internal packages
- `pkg/platform/`: runtime, auth, transport, and observability helpers
- `api/proto/`: protobuf contract workspace
- `scripts/`: project scripts

Common commands:

```bash
make bootstrap
make fmt
make lint
make test-workspace
make check-build
```

For contributor guidance, see [docs/contributing/development.mdx](docs/contributing/development.mdx).

## Release

Create and push a semantic version tag to trigger release CI:

```bash
git tag v0.1.0
git push origin v0.1.0
```

Release assets are built by [GoReleaser](https://goreleaser.com/) via [`.github/workflows/release.yml`](.github/workflows/release.yml) and [`.goreleaser.yml`](.goreleaser.yml).

## Contributing

Issues and pull requests are welcome.
