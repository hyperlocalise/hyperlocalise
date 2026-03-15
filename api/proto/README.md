# API protobuf contracts

This directory contains Hyperlocalise protobuf contracts and Buf configuration.

## Files

- `buf.yaml`: Buf module and lint/breaking configuration.
- `buf.gen.yaml`: Buf code-generation configuration for Go stubs.
- `hyperlocalise/common/v1/common.proto`: Shared common messages.
- `hyperlocalise/translation/v1/translation.proto`: Async translation job contracts.

## Translation job API model

`hyperlocalise/translation/v1/translation.proto` defines the `TranslationService` gRPC API:

1. **Create translation job** via `CreateTranslationJob`.
2. **Get translation job** via `GetTranslationJob` for the full resource, including results.
3. **Get translation job status** via `GetTranslationJobStatus` for lightweight polling.
4. **List translation jobs** via `ListTranslationJobs` using `hyperlocalise.common.v1.PageRequest` and `PageResponse`.

Each `TranslationJob` carries:

- `type`: `TYPE_STRING` or `TYPE_FILE`, derived by the server from the active input/result variant.
- `status`: queued/running/succeeded/failed/canceled lifecycle.
- oneof input payload for the selected job type.
- typed result payload for completed jobs:
  - string jobs return locale/text pairs
  - file jobs return locale/file URI pairs
- structured error payload for failed jobs, including code/message/details.

String translation jobs also support optional translator guidance on input:

- `context`: short product or UI context for the source text
- `max_length`: per-locale output length constraint

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

### Generate Go protobuf and gRPC stubs

```bash
buf generate --template api/proto/buf.gen.yaml api/proto
```

The generated files are written to `pkg/api/proto` as configured in `api/proto/buf.gen.yaml`.
