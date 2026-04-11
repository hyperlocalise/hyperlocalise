# API protobuf contracts

This directory contains Hyperlocalise protobuf contracts and Buf configuration.

## Files

- `buf.yaml`: Buf module and lint/breaking configuration.
- `buf.gen.yaml`: Buf code-generation configuration for Go stubs.
- `hyperlocalise/common/v1/common.proto`: Shared common messages.

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
