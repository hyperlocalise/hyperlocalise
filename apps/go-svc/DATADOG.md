# Datadog APM runbook

This app uses the OpenTelemetry SDK directly, not `dd-trace-go` — spans are exported over OTLP/HTTP to a Datadog Agent or an OpenTelemetry Collector configured with a Datadog exporter. See `README.md`'s "OpenTelemetry / Tracing" and "Datadog log correlation" sections for what's emitted and exactly where each value comes from.

## What this repo controls vs. what's external

Controlled here:

- OTel SDK setup, span creation, and resource attributes (`telemetry.go`, `telemetry_middleware.go`).
- The `dd.trace_id` / `dd.span_id` / `dd.service` / `dd.env` / `dd.version` log correlation fields (`telemetry_log_handler.go`).

External to this repo — there is no Terraform, Kubernetes, or Datadog pipeline configuration checked in anywhere in this monorepo:

- The actual value of `OTEL_EXPORTER_OTLP_ENDPOINT` / `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`, set as a Vercel project environment variable, pointing at a Datadog Agent's OTLP/HTTP receiver or a Collector with a Datadog exporter.
- Whether that Agent/Collector is configured to ingest OTel-native IDs (128-bit hex trace ID, 64-bit hex span ID) for both traces and log correlation, as opposed to legacy 64-bit decimal APM ingestion. Datadog's current documentation states native OTel hex IDs are supported for log-trace correlation, but this repo has no visibility into, or control over, how the receiving end is actually configured — confirm this post-deploy (see Verification below), don't assume it from the docs alone.
- Any Datadog-side log pipeline, remapper, or facet configuration for the `dd.*` attributes — none of it is repo-managed; it lives entirely in the Datadog UI.
- Whether `VERCEL_GIT_COMMIT_SHA` / `VERCEL_ENV` reach the container at all, which depends on the `go_svc` Vercel project's **"Automatically expose System Environment Variables"** setting (see README) — a Vercel dashboard setting outside this repository.

## Vercel enablement

Enable **Automatically expose System Environment Variables** on the `go_svc` Vercel project, for both Preview and Production, so `VERCEL_ENV` / `VERCEL_GIT_COMMIT_SHA` populate `dd.env` / `dd.version` and the matching OTel resource attributes (`deployment.environment.name` / `service.version`).

Set `OTEL_EXPORTER_OTLP_ENDPOINT` (or the traces-specific `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`) to the Datadog Agent's or Collector's OTLP/HTTP receiver. Tracing — and therefore log correlation, since `dd.trace_id` / `dd.span_id` only ever appear on a log record when a span is active — is a complete no-op until one of these is set.

## Data-safety rules

Unchanged from the existing tracing guarantees documented in the README: span attributes stay limited to `http.request.method`, `http.route` (the matched route template, never a concrete organization slug or project ID), and `http.response.status_code`. Logs keep the same bounded-route (`requestLogPath`) and redaction-by-omission behavior this repo already had — the correlation handler only *adds* `dd.*` fields to a log record; it never changes, removes, or rewrites any existing field. Do not add span attributes or log fields carrying request/response bodies, the `Authorization` header, cookies, or any other customer-supplied content.

## Verification

**Verifiable in this repo**: the correlation mechanism itself — see `telemetry_log_handler_test.go` and the end-to-end test in `request_log_test.go` — via `go test ./apps/go-svc/...`.

**Must be verified after deployment**, since the Datadog Agent/Collector endpoint and how it ingests these IDs are external to this repo:

1. Issue one known request against a deployed environment.
2. Locate its APM trace in Datadog.
3. From the trace, navigate to its correlated `go-svc` logs. If Datadog shows no matching logs here, the Agent/Collector endpoint is most likely not configured for OTel-native ID ingestion on the log side — this step is the actual test of that external configuration, not something `go test` can verify from inside this repo.
4. Confirm the log entry carries `dd.trace_id`, `dd.span_id`, `dd.service`, `dd.env`, and `dd.version` with the expected values (`dd.service` should read `go-svc`; `dd.env` / `dd.version` should match the deployed environment and commit).
5. From that log entry, navigate back to its trace.
6. Logs and traces can sample independently. A log with no visible matching trace, or a trace with no visible matching log, doesn't by itself indicate a correlation bug — repeat with a few more requests before treating an isolated miss as one.

## Rollback

Unset `OTEL_EXPORTER_OTLP_ENDPOINT` and `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` (or set `OTEL_SDK_DISABLED=true`) and redeploy to stop tracing entirely. Logs keep emitting `dd.service` / `dd.env` / `dd.version` (harmless without a matching trace) but never `dd.trace_id` / `dd.span_id`, since no span will ever be active. No code change or Datadog-side action is required to stop this service's log correlation.
