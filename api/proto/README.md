# Proto Contracts

The canonical internal service contracts live in [`api/proto`](./).

Rules:

- `.proto` files under this directory are the source of truth
- generated Go code belongs under [`pkg/api/proto`](../../pkg/api/proto)
- HTTP handlers are adapters over these contracts, not a separate workflow model

## Translation service

The v1 translation backend contract is:

- [`api/proto/hyperlocalise/tms/translation/v1/translation.proto`](./hyperlocalise/tms/translation/v1/translation.proto)

This replaces the old generic job contract. Translation jobs are now the top-level async unit.

Contract conventions used by the translation API:

- user-facing V1 shape first; internal workflow details stay out of the public contract
- shared pagination via `hyperlocalise.common.v1.PageRequest` and `PageResponse`
- `google.protobuf.Timestamp` for temporal fields
- enums for stable user-facing state such as job status
- `oneof` result payloads so inline and artifact outputs are mutually exclusive on the wire
- `optional` only where presence matters; business-required validation stays in service code

## Tooling

Buf config:

- lint and breaking rules: [`api/proto/buf.yaml`](./buf.yaml)
- Go generation config: [`api/proto/buf.gen.yaml`](./buf.gen.yaml)

## Commands

From the repo root:

```bash
cd api/proto
buf lint
buf breaking --against '.git#branch=main'
buf generate
```

## Generated output

`buf generate` writes Go protobuf and gRPC stubs into [`pkg/api/proto`](../../pkg/api/proto) using source-relative paths.

Expected generated paths for the translation API:

- `pkg/api/proto/hyperlocalise/tms/translation/v1/translation.pb.go`
- `pkg/api/proto/hyperlocalise/tms/translation/v1/translation_grpc.pb.go`

## Requirements

The generator config expects these binaries on `PATH`:

- `buf`
- `protoc-gen-go`
- `protoc-gen-go-grpc`

Example install:

```bash
go install google.golang.org/protobuf/cmd/protoc-gen-go@latest
go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@latest
```

## Workflow for contract changes

1. Edit the relevant `.proto` file in [`api/proto`](./)
2. Run `buf lint`
3. Run `buf generate`
4. Update service implementations and HTTP adapters to match
5. Commit both the `.proto` change and generated Go code together
