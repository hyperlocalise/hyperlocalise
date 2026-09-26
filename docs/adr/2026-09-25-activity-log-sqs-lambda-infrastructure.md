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

The application repository does not provision AWS resources or embed AWS credentials.

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

The infrastructure repository publishes the queue URL, queue ARN, AWS region, and Lambda identifiers through the existing SSM/secret handoff convention. It provides `DATABASE_URL` to Lambda through the approved secret-management system and configures the same region for the web app's SQS client.

## Deployment order

1. Provision the queue, DLQ, Lambda shell, IAM, secrets access, and disabled event mapping.
2. Deploy the Go Lambda artifact from the application repository.
3. Configure the web runtime with the queue URL and scoped producer credentials.
4. Enable the event mapping and monitor queue age, Lambda errors, database errors, and DLQ depth.

## Boundaries

The Lambda writes directly to Postgres and does not call the `go-svc` HTTP API. The existing `go-svc` activity-log read API remains responsible for authorization, query parsing, target hydration, and response formatting.
