# Crowdin OTA concordance fixture

## Decision

Maintain a reproducible Go fixture under `tools/crowdin-ota-glossary-fixture`.
The fixture contains 50 online-travel-agent concepts with English source terms
and Vietnamese, Japanese, German, and Korean target terms. It generates a TBX
seed and records organization-level Crowdin glossary concordance responses.

Remote glossary creation requires `--create-glossary`. Existing glossary
imports require `--import`. The tool never deletes or overwrites a remote
glossary and never writes credentials to disk.

## Recording contract

`apps/hyperlocalise-web/src/lib/glossary/fixtures/ota-concordance-recording.json`
stores nine query cases for each target language. Every run stores its exact
`input`, HTTP status, and raw `output` JSON. The recording is intentionally
independent of the application's mapped concordance types so it can preserve
future Crowdin response fields and serve as a replay fixture for web-app tests.
