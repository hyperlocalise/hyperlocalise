# Glossary interchange dummy Lambda

## Purpose

Provide a buildable Go Lambda artifact for the newly provisioned glossary-interchange
queue while the real job contract and processing implementation are still being
defined. This change intentionally does not use `feat/glossary-interchange-async`.

## Contract

The handler accepts an AWS `events.SQSEvent` and returns partial batch failures.
It logs only record counts, message IDs, body sizes, timing, and a fixed failure
reason. Every received record is marked for retry; no message is acknowledged and
no database, object-storage, or secret access occurs.

Canceled contexts return an error so Lambda retries the complete batch. Empty
batches complete successfully.

## Deployment

The application builds `dist/glossary-interchange-lambda/bootstrap` with the
`provided.al2023`-compatible root-level bootstrap shape. The deployment workflow
uploads it to `glossary-interchange/bootstrap.zip` and updates the function named
by `/hyperlocalise/prod/lambda/glossary-interchange/function_name`.
