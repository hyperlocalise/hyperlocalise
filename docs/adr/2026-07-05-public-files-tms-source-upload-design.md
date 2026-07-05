# ADR: Extend public file upload to external TMS source uploads

## Status

Accepted

## Date

2026-07-05

## Context

Integrations such as the Canva app need one API for source uploads. Today
`POST /api/v1/files` uploads source files to native Hyperlocalise projects
only. External TMS projects expose live read APIs and translation write-back,
but they do not expose source-file upload through the web API.

The product model already treats native and external TMS projects as workspace
projects. Keeping source upload behind one public endpoint avoids making
integrations choose a provider-specific route.

## Decision

Extend `POST /api/v1/files` so it routes by `projectId`.

- Native projects keep the current behavior: store the file, create a source
  version, and enqueue ingest.
- External TMS projects upload the source bytes to the connected provider
  project through the TypeScript TMS adapter contract.
- The endpoint keeps the existing multipart shape and adds optional provider
  fields such as `sourceLocale`, `format`, and `branch`.
- The response remains resource-keyed under `file`, with a `destination` field
  and provider metadata for TMS uploads.

## API shape

`POST /api/v1/files`

Required fields:

- `projectId`
- `sourcePath`
- `file`

Optional fields:

- `sourceHash`
- `commitSha`
- `workflowRunId`
- `sourceLocale`
- `format`
- `branch`

## Provider behavior

The web TMS adapter contract gains a source-upload capability. Each provider
maps the normalized upload request to its own API:

- Crowdin uploads or updates source files.
- Phrase creates an upload for the source locale.
- Lokalise queues a source-file import.
- Smartling uploads the source file URI.

Providers that cannot upload sources return `source_upload_unsupported`.

## Error handling

Expected failures return stable JSON errors:

- `project_not_found`
- `invalid_file_payload`
- `unsupported_file`
- `source_upload_unsupported`
- `source_upload_failed`

Provider errors must not expose secrets or raw file contents.

## Testing

Add route and adapter tests for:

- native uploads still store and enqueue ingest;
- provider-backed projects dispatch to the selected adapter;
- unsupported providers return `source_upload_unsupported`;
- provider adapters construct the expected upload request.
