# Datadog APM runbook

This app uses `dd-trace` for Node.js server tracing. The tracer is inert in normal local development and tests because the app does not preload it from a package script. Vercel deployments opt in with `NODE_OPTIONS`.

## Runtime coverage

All current App Router routes use Next.js's default Node.js runtime. There are no route files that export `runtime = "edge"`. Recheck this before each rollout:

```bash
rg 'export const runtime' src/app
```

`dd-trace` does not instrument Edge routes. If a route moves to Edge, record the gap here and verify it separately through Vercel's platform traces.

`next.config.ts` keeps `dd-trace`, `pg`, and `undici` external so the tracer can install its native load hooks. The Datadog Turbopack wrapper instruments supported server dependencies that Next.js still bundles. It does not touch browser or Edge bundles.

## Vercel enablement

Enable **Automatically expose System Environment Variables** on both the preview and production Vercel projects. This provides `VERCEL_ENV` and `VERCEL_GIT_COMMIT_SHA` at runtime.

Configure these non-secret variables on the **web** Vercel service only (`apps/hyperlocalise-web`) for Preview and Production, then redeploy:

| Variable                     | Value                         |
| ---------------------------- | ----------------------------- |
| `NODE_OPTIONS`               | `--import ./datadog-init.mjs` |
| `DD_SERVICE`                 | `hyperlocalise-web`           |
| `DD_TRACE_PROPAGATION_STYLE` | `datadog,tracecontext`        |

`NODE_OPTIONS=--import ./datadog-init.mjs` is the preload for this Next.js service. The path is relative to the web service root in `vercel.json`. Next.js file tracing includes `datadog-init.mjs` and `datadog-init-env.mjs`, so each Node.js serverless function can resolve the import. Vercel applies `NODE_OPTIONS` to that service's Node runtime (and to `next build`). Leave it unset locally so `vp test` and `vp run dev` stay inert.

Do not set `NODE_OPTIONS` or `DD_SERVICE` on `go_svc`. That service is a Go container and does not load this preload.

`datadog-init.mjs` derives `DD_ENV` from `VERCEL_ENV` and `DD_VERSION` from `VERCEL_GIT_COMMIT_SHA` before the tracer loads. Explicit `DD_ENV` or `DD_VERSION` values take precedence. This makes preview and production traces distinguishable and makes the service version immutable for each deployment. The same preload always sets `DD_TRACE_OBFUSCATION_QUERY_STRING_REGEXP` to `.*` so `http.url` never keeps a query string. Do not override that variable to a weaker pattern.

Do not configure `DD_API_KEY` in the application. Install the Datadog integration from the Vercel Marketplace for the preview and production projects, authorize the correct Datadog site, and create a Trace Drain for each project.

Start each Trace Drain at **10% sampling**. This is a deliberate cost-control baseline, not a permanent target. Review Datadog ingested span volume and Vercel drain volume after 24 hours and again after seven days before increasing it. Do not also set a blanket `DD_TRACE_SAMPLE_RATE` during the initial rollout; two independent percentages can compound and make validation misleading.

Static assets under `/_next/static/*` are served outside the Node.js route runtime. `/api/health` is included in the initial 10% drain sample because the Next.js catch-all route does not expose a distinct bounded root resource for that Hono route. After observing the emitted root resource and tags, add a zero-rate resource sampling rule only if it can match the health endpoint without matching all `/api/[[...route]]` traffic.

## Data-safety rules

Keep route and resource names at framework-generated templates such as `/auth/select-organization/[organizationSlug]` and `/api/[[...route]]`. Never replace them with concrete request paths.

Do not enable header tagging or request/response body capture. In particular, do not add cookies, authorization headers, organization slugs, project IDs, source text, translated text, or query strings as tags. Translation-memory search text travels in the `search` query parameter; complete query-string redaction in `datadog-init.mjs` is what keeps that text out of `http.url`. W3C `traceparent` and `tracestate` propagation is enabled by `DD_TRACE_PROPAGATION_STYLE`; `dd-trace` injects it into supported outbound Node.js HTTP and `undici` requests.

## Verification

Use a preview deployment before enabling production:

1. Request a bounded route and confirm one Next.js server trace arrives with `service:hyperlocalise-web`, `env:preview`, the deployed commit SHA as `version`, a templated resource, status, and duration.
2. Exercise a route that queries Postgres and confirm a `pg` child span shares the trace ID.
3. Exercise a route that calls an external service and confirm an HTTP or `undici` child span shares the trace ID. Verify the outbound request carries W3C trace context to a controlled receiver.
4. Inspect span names and tags for concrete organization slugs, project IDs, query strings, headers, bodies, source text, and translated text. Stop the rollout if any appear.
5. Confirm preview and production queries separate cleanly by `env`, and two deployments of the same environment separate by `version`.

## Rollback

Remove `NODE_OPTIONS` from the affected Vercel environment and redeploy. This stops tracer preload without a code rollback. Disable or remove that project's Trace Drain to stop forwarding platform traces. If the deployment itself is unhealthy, use Vercel's deployment rollback as well. Removing Datadog does not require changing application secrets or database state.
