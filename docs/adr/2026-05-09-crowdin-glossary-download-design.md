# Crowdin Glossary Download Design

## Context

HL-243 adds a non-interactive CLI command for downloading Crowdin glossary terms and exporting them as deterministic CSV. The existing CLI already has a `crowdin` command tree and configuration loader for `crowdin.yml`, identity files, and Crowdin credentials.

## Decision

Add `crowdin glossary download` under the existing Crowdin command tree. The command reuses Crowdin file workflow configuration for API token, base URL, and project identity, then requires `--glossary-id` to select the glossary. It writes CSV to stdout by default and supports `--output` for file output.

The implementation uses the Crowdin terms and concepts APIs instead of Crowdin's asynchronous export endpoint. This keeps the CSV schema stable and lets Hyperlocalise include source term, translated terms, language IDs, term metadata, and concept metadata with predictable headers.

## Error Handling

The command fails before making API calls when configuration or `--glossary-id` is missing. API failures are wrapped with the operation that failed, such as `get glossary` or `list glossary terms`. Empty glossaries still produce a header-only CSV.

## Testing

Tests cover CLI flag parsing and stdout/file output through a command-level fake. Crowdin API behavior is tested with mocked HTTP responses for CSV formatting, language filtering, pagination, empty results, and API errors.
