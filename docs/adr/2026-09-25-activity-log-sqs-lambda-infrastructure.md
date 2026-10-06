# Activity-log SQS and Go Lambda infrastructure responsibilities

## Status

Accepted for implementation.

## Application repository

The application repository owns:

- Direct SQS publishing from the web application.
- The versioned activity-log message contract.
- The Go Lambda source under `apps/activity-log-lambda`.
- Shared Go activity-log validation and Postgres persistence under `internal/activitylog`.
- Lambda build artifacts and application-side tests.
- Updating the already-provisioned Lambda function's `$LATEST` code from the versioned
  S3 artifact through the `upload` and `provision` jobs in
  `.github/workflows/lambda-deploy.yml`.

The application repository does not provision AWS resources or embed AWS credentials.

The Lambda reads the database connection value from the shared `internal/secretsmanager`
package. Infrastructure must set:

- `DATABASE_URL_SECRET_ARN` to the Secrets Manager secret ARN.
- `DATABASE_SECRET_KEY` to the JSON field containing the connection string (currently
  `DATABASE_URL`).
- `DATABASE_URL_SECRET_CACHE_TTL_SECONDS` optionally, to override the five-minute warm
  runtime cache.

Glossary-interchange and memory-interchange use the same Lambda environment
contract and `secretsmanager.ConfigFromEnv()` in the application repository.
For scaffolding new workers, see
`.agents/skills/create-sqs-lambda-worker/references/worker-contract.md`.

## Infrastructure repository

The infrastructure repository provisions and operates:

- A standard SQS activity-log queue and dead-letter queue.
- A Go Lambda using the `provided.al2023` runtime and the application-produced `bootstrap` artifact.
- The SQS event-source mapping with partial batch failure reporting.
- Lambda timeout, memory, reserved concurrency, and connection limits appropriate for Postgres.
- Producer IAM permissions limited to `sqs:SendMessage` on the activity-log queue.
- Lambda IAM permissions for SQS consumption, CloudWatch logs, and retrieval/decryption of `DATABASE_URL`.
- Postgres network access, TLS requirements, subnets/security groups, and any required VPC endpoints.
- Queue/Lambda encryption, log retention, alarms, dashboards, and DLQ redrive operations.

The infrastructure repository publishes the queue URL, queue ARN, AWS region, and Lambda identifiers through the existing SSM/secret handoff convention. It provides the database secret ARN and JSON field name to Lambda through the approved configuration system and configures the same region for the web app's SQS client. The Vercel web runtime assumes the producer role through Vercel OIDC using `AWS_ROLE_ARN`; it does not receive long-lived AWS access keys.

The infrastructure repository must also publish the existing function name at
`/hyperlocalise/prod/lambda/activity-log/function_name`. The GitHub deployment role needs
`ssm:GetParameter` for that parameter, `lambda:UpdateFunctionCode` for the specific
function ARN, and the minimum Lambda read permission required to wait for and verify the
update. The deployment workflow updates `$LATEST`; it does not create functions, change
configuration, publish versions, or move aliases.

For the Lambda execution role, grant `secretsmanager:GetSecretValue` on the exact
`DATABASE_URL_SECRET_ARN`. Add `kms:Decrypt` on the customer-managed KMS key only when
that secret is encrypted with one; the AWS-managed Secrets Manager key does not require
an additional customer policy. If the Lambda subnets have no NAT route and no existing
Secrets Manager interface endpoint, provision `com.amazonaws.<region>.secretsmanager`
in those subnets with security-group access from the Lambda. No OpenTofu configuration
for these resources is present in this repository, so these IAM and VPC changes remain
in the infrastructure repository.

## Deployment order

1. Provision the queue, DLQ, Lambda shell, IAM, secrets access, and disabled event mapping.
2. Deploy the Go Lambda artifact and update the existing function from the application repository.
3. Configure the web runtime with the queue URL, region, and `AWS_ROLE_ARN`; configure the producer role's Vercel OIDC trust policy and `sqs:SendMessage` permission.
4. Enable the event mapping and monitor queue age, Lambda errors, database errors, and DLQ depth.

## Boundaries

The Lambda writes directly to Postgres and does not call the `go-svc` HTTP API. The existing `go-svc` activity-log read API remains responsible for authorization, query parsing, target hydration, and response formatting.
