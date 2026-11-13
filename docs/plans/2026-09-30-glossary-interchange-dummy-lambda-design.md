# Glossary interchange Lambda

## Purpose

Process native glossary imports and exports behind the existing
`glossary-interchange` SQS queue using the Go Lambda at
`apps/glossary-interchange-lambda`.

## Contract

The handler accepts an AWS `events.SQSEvent`, returns partial batch failures, and
processes one durable `glossary_import_runs` record per message. GoSvc stores
source/result/backup object references, publishes versioned import/export
messages, and serves report status plus signed result downloads. Replace imports
write a TBX backup before mutating glossary concepts.

Canceled contexts return an error so Lambda retries the complete batch. Empty
batches complete successfully.

## Deployment

The application builds `dist/glossary-interchange-lambda/bootstrap` with the
`provided.al2023`-compatible root-level bootstrap shape. The existing
`.github/workflows/lambda-deploy.yml` workflow detects changes under
`apps/glossary-interchange-lambda/**` and uses the same deploy action and job
pattern as the other Lambdas. It uploads `glossary-interchange/bootstrap.zip`
and updates `/hyperlocalise/prod/lambda/glossary-interchange/function_name`.
