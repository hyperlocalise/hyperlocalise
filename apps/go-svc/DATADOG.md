# Datadog APM runbook

This app uses Datadog's compile-time Go instrumentation with Orchestrion. Orchestrion rewrites supported dependencies during the ECS build, and the generated code uses the `dd-trace-go/v2` runtime to send spans to the Datadog Agent. See `README.md`'s "Datadog tracing" and "Datadog log correlation" sections for the application behavior.

## What this repo controls vs. what's external

Controlled here:

- Datadog tracer setup and the OpenTelemetry bridge used by the route-safe middleware (`telemetry.go`, `telemetry_middleware.go`).
- The Orchestrion tool manifest and ECS compile-time instrumentation (`orchestrion.tool.go`, `Dockerfile.ecs`).
- The `dd.trace_id` / `dd.span_id` / `dd.service` / `dd.env` / `dd.version` log correlation fields (`telemetry_log_handler.go`).

External to this repo — there is no Terraform, Kubernetes, or Datadog pipeline configuration checked in anywhere in this monorepo:

- The actual ECS task value of `DD_TRACE_AGENT_URL`, which must resolve to the Datadog Agent's APM intake endpoint (`http://127.0.0.1:8126` for the current sidecar).
- Any Datadog-side log pipeline, remapper, or facet configuration for the `dd.*` attributes — none of it is repo-managed; it lives entirely in the Datadog UI.
- Whether the ECS deployment task definition receives the exact immutable image tag as `DD_VERSION` and the deployment environment as `DD_ENV` — these values are owned by the infrastructure repository and deployment workflow.

## ECS enablement

The ECS task definition sets `DD_TRACE_AGENT_URL`, `DD_TRACE_ENABLED`, `DD_SERVICE`, `DD_ENV`, and `DD_VERSION`. The deployment workflow updates `DD_VERSION` to the exact immutable image tag whenever a new image is deployed, so the application logs and Datadog traces identify the running image.

Set `DD_TRACE_AGENT_URL` to the Datadog Agent's APM intake endpoint and keep `DD_TRACE_ENABLED=true`. Tracing — and therefore log correlation, since `dd.trace_id` / `dd.span_id` only ever appear on a log record when a span is active — is a no-op when tracing is disabled.

## Data-safety rules

Unchanged from the existing tracing guarantees documented in the README: span attributes stay limited to `http.request.method`, `http.route` (the matched route template, never a concrete organization slug or project ID), and `http.response.status_code`. Logs keep the same bounded-route (`requestLogPath`) and redaction-by-omission behavior this repo already had — the correlation handler only *adds* `dd.*` fields to a log record; it never changes, removes, or rewrites any existing field. Do not add span attributes or log fields carrying request/response bodies, the `Authorization` header, cookies, or any other customer-supplied content.

## Verification

**Verifiable in this repo**: the correlation mechanism itself — see `telemetry_log_handler_test.go` and the end-to-end test in `request_log_test.go` — via `go test ./apps/go-svc/...`.

**Must be verified after deployment**, since the Datadog Agent endpoint and Datadog log pipeline are external to this repo:

1. Issue one known request against a deployed environment.
2. Locate its APM trace in Datadog.
3. From the trace, navigate to its correlated `go-svc` logs. If Datadog shows no matching logs here, the Agent/Collector endpoint is most likely not configured for OTel-native ID ingestion on the log side — this step is the actual test of that external configuration, not something `go test` can verify from inside this repo.
4. Confirm the log entry carries `dd.trace_id`, `dd.span_id`, `dd.service`, `dd.env`, and `dd.version` with the expected values (`dd.service` should read `go-svc`; `dd.env` / `dd.version` should match the deployed environment and commit).
5. From that log entry, navigate back to its trace.
6. Logs and traces can sample independently. A log with no visible matching trace, or a trace with no visible matching log, doesn't by itself indicate a correlation bug — repeat with a few more requests before treating an isolated miss as one.

## Rollback

Set `DD_TRACE_ENABLED=false` and redeploy to stop tracing entirely. Logs keep emitting `dd.service` / `dd.env` / `dd.version` (harmless without a matching trace) but never `dd.trace_id` / `dd.span_id`, since no span will ever be active. No code change or Datadog-side action is required to stop this service's log correlation.
