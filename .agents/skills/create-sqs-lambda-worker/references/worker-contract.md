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

Only secret references are environment configuration. Loaded secret values must
never appear in source, Terraform, GitHub variables, logs, error strings, or
child-process environment.

### Postgres / shared runtime database (default)

Queue workers that connect to the shared Hyperlocalise Postgres secret use the
**same contract as activity-log, glossary-interchange, and memory-interchange**.

| Lambda environment variable | Required | Value |
| --- | --- | --- |
| `DATABASE_URL_SECRET_ARN` | yes | Secrets Manager ARN for the runtime secret |
| `DATABASE_SECRET_KEY` | yes | JSON field name inside the secret (`DATABASE_URL`) |
| `DATABASE_URL_SECRET_CACHE_TTL_SECONDS` | no | Warm-cache TTL in seconds (default 300) |

Application bootstrap:

```go
secretConfig, err := secretsmanager.ConfigFromEnv()
loader, err := secretsmanager.NewLoader(secretsClient, secretConfig)
// Pass loader (or a thin wrapper) as the database URL provider.
```

Infrastructure (reusable `sqs-lambda-consumer` module in the infra repo):

```hcl
secret_references = {
  database_url_secret = {
    secret_arn = var.runtime_secret_arn
    json_key   = "DATABASE_URL"
  }
}
environment_variables = {
  DATABASE_SECRET_KEY = "DATABASE_URL"
  # ...non-secret worker config...
}
```

The module emits `DATABASE_URL_SECRET_ARN`, `DATABASE_URL_SECRET_KEY`, and
`DATABASE_URL_SECRET_CACHE_TTL_SECONDS` from `secret_references`. Go reads
`DATABASE_SECRET_KEY` via `ConfigFromEnv()`, so the explicit
`DATABASE_SECRET_KEY` entry in `environment_variables` is required unless you
change the shared loader.

The activity-log stack sets the same three logical settings through the
dedicated `activity-log-consumer` wrapper instead of `secret_references`.

Do not use `ConfigsFromEnv("DATABASE")` for Postgres unless infrastructure
uses `secret_references = { database = ... }`, which emits `DATABASE_ARN` and
`DATABASE_KEY` — that is a different contract and does not match
`database_url_secret`.

### Additional secrets (generic)

When a worker needs more than the shared database secret, or secrets with
distinct logical names, use the generic pattern:

| Lambda environment variable | Meaning |
| --- | --- |
| `<NAME>_ARN` | Secrets Manager ARN |
| `<NAME>_KEY` | JSON field name inside the secret |
| `<NAME>_CACHE_TTL_SECONDS` | Optional cache TTL |

Infrastructure `secret_references` map keys become `<NAME>` after uppercasing
and sanitizing (for example `provider_api` → `PROVIDER_API_ARN`).

Application code:

```go
configs, err := secretsmanager.ConfigsFromEnv("PROVIDER_API", "OTHER")
collection, err := secretsmanager.NewCollection(client, configs)
value, err := collection.Load(ctx, "PROVIDER_API")
```

Pass logical names explicitly to `ConfigsFromEnv` so unrelated `*_ARN`
environment variables are ignored.

## Deployment inputs

The reusable action requires:

- `build-command`
- `binary-path`
- `s3-key`
- `bucket-parameter-name`
- `function-parameter-name`
