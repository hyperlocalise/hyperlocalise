# API protobuf contracts

This directory contains Hyperlocalise protobuf contracts and Buf configuration.

## Files

- `buf.yaml`: Buf module and lint/breaking configuration.
- `buf.gen.yaml`: Buf code-generation configuration for Go stubs.
- `hyperlocalise/common/v1/common.proto`: Shared common messages.
- `hyperlocalise/translation/v1/translation.proto`: Async translation job contracts.

## Translation job API model

`hyperlocalise/translation/v1/translation.proto` defines request/response messages for:

1. **Create translation job** via `CreateTranslationJobRequest` with one of:
   - `string_input`: translate in-memory text.
   - `file_input`: translate content referenced by `file_uri`.
2. **Get translation job status** via `GetTranslationJobStatusRequest`.
3. **List translation jobs** via `ListTranslationJobsRequest` using cursor pagination (`cursor`, `next_cursor`).

Each `TranslationJob` carries:

- `type`: `TYPE_STRING` or `TYPE_FILE`.
- `status`: queued/running/succeeded/failed/canceled lifecycle.
- oneof input payload for the selected job type.

## How to use Buf

Run commands from the repository root.

### Lint protobuf files

```bash
buf lint api/proto
```

### Check for breaking changes

```bash
buf breaking api/proto --against '.git#branch=main,subdir=api/proto'
```

### Generate Go protobuf stubs

```bash
buf generate api/proto
```

The generated files are written to `pkg/api/proto` as configured in `api/proto/buf.gen.yaml`.
