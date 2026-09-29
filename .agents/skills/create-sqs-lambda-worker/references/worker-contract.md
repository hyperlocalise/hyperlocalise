# Worker contract

## Handler shape

The Lambda entry point uses the AWS Go events type:

```go
func (h *Handler) Handle(ctx context.Context, event events.SQSEvent) (BatchResponse, error)
```

Each record is decoded and processed independently. Return one item identifier
per failed record so successful records are acknowledged while failed records
are retried or sent to the DLQ.

## Artifact shape

The build target must produce exactly one executable at:

```text
dist/<worker-name>/bootstrap
```

The deployment action packages that executable as a root-level `bootstrap` in
a versioned S3 object.

## Secret metadata

Only secret references are environment configuration. A generated worker should
turn named values into a typed config structure during initialization and keep
the values out of logs, error strings, metrics, and child-process environment.

## Deployment inputs

The reusable action requires:

- `build-command`
- `binary-path`
- `s3-key`
- `bucket-parameter-name`
- `function-parameter-name`
