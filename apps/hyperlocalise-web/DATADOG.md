# Datadog APM runbook

This app uses `dd-trace` for Node.js server tracing. The tracer is inert in normal local development and tests because the app does not preload it from a package script. Vercel deployments opt in with `NODE_OPTIONS`.

## Runtime coverage

All current App Router routes use Next.js's default Node.js runtime. There are no route files that export `runtime = "edge"`. Recheck this before each rollout:

```bash
rg 'export const runtime' src/app
```

`dd-trace` does not instrument Edge routes. If a route moves to Edge, record the gap here and verify it separately through Vercel's platform traces.

`next.config.ts` keeps `dd-trace`, `ai`, `pg`, and `undici` external so the tracer can install its native load hooks. The workflow compiler must bundle the OpenAI and Anthropic provider packages because workflow steps use their serialization classes; Datadog's `ai` integration observes their AI SDK lifecycle events through the external `ai` package. The Datadog Turbopack wrapper instruments supported server dependencies that Next.js still bundles. It does not touch browser or Edge bundles.

## Vercel enablement

Enable **Automatically expose System Environment Variables** on both the preview and production Vercel projects. This provides `VERCEL_ENV` and `VERCEL_GIT_COMMIT_SHA` at runtime.

Configure these non-secret variables for both Preview and Production, then redeploy:

| Variable                     | Value                         |
| ---------------------------- | ----------------------------- |
| `NODE_OPTIONS`               | `--import ./datadog-init.mjs` |
| `DD_SERVICE`                 | `hyperlocalise-web`           |
| `DD_TRACE_PROPAGATION_STYLE` | `datadog,tracecontext`        |

`datadog-init.mjs` derives `DD_ENV` from `VERCEL_ENV` and `DD_VERSION` from `VERCEL_GIT_COMMIT_SHA` before the tracer loads. Explicit `DD_ENV` or `DD_VERSION` values take precedence. This makes preview and production traces distinguishable and makes the service version immutable for each deployment.

Do not configure `DD_API_KEY` in the application. Install the Datadog integration from the Vercel Marketplace for the preview and production projects, authorize the correct Datadog site, and create a Trace Drain for each project.

### LLM Observability intake

Vercel Functions do not provide a colocated Datadog Agent. Use agentless intake for LLM Observability while keeping the Trace Drain above for APM. Configure these values in Vercel and redeploy:

| Variable                      | Preview                         | Production                        | Storage              |
| ----------------------------- | ------------------------------- | --------------------------------- | -------------------- |
| `DD_LLMOBS_ENABLED`           | `true`                          | `true` after preview verification | Environment variable |
| `DD_LLMOBS_ML_APP`            | `hyperlocalise-web-preview`     | `hyperlocalise-web`               | Environment variable |
| `DD_LLMOBS_AGENTLESS_ENABLED` | `true`                          | `true`                            | Environment variable |
| `DD_LLMOBS_SAMPLE_RATE`       | `1.0` during smoke testing      | `0.1` initially                   | Environment variable |
| `DD_SITE`                     | The organization's Datadog site | The organization's Datadog site   | Environment variable |
| `DD_API_KEY`                  | Site API key                    | Site API key                      | Vercel secret        |

`DD_SERVICE`, `DD_ENV`, and `DD_VERSION` apply to LLM Observability as well as APM. Keep the service and deployment-derived values described above. Never expose `DD_API_KEY` to a `NEXT_PUBLIC_*` variable or store it in a checked-in env file.

Agentless mode sends only LLM Observability payloads directly to Datadog. The Trace Drain remains the supported APM path. This split avoids running an Agent inside a short-lived Vercel Function and avoids duplicate APM export.

Start each Trace Drain at **10% sampling**. This is a deliberate cost-control baseline, not a permanent target. Review Datadog ingested span volume and Vercel drain volume after 24 hours and again after seven days before increasing it. Do not also set a blanket `DD_TRACE_SAMPLE_RATE` during the initial rollout; two independent percentages can compound and make validation misleading.

Static assets under `/_next/static/*` are served outside the Node.js route runtime. `/api/health` is included in the initial 10% drain sample because the Next.js catch-all route does not expose a distinct bounded root resource for that Hono route. After observing the emitted root resource and tags, add a zero-rate resource sampling rule only if it can match the health endpoint without matching all `/api/[[...route]]` traffic.

## Data-safety rules

Keep route and resource names at framework-generated templates such as `/auth/select-organization/[organizationSlug]` and `/api/[[...route]]`. Never replace them with concrete request paths.

Do not enable header tagging or request/response body capture. In particular, do not add cookies, authorization headers, organization slugs, project IDs, source text, translated text, or query strings as tags. W3C `traceparent` and `tracestate` propagation is enabled by `DD_TRACE_PROPAGATION_STYLE`; `dd-trace` injects it into supported outbound Node.js HTTP and `undici` requests.

Every server-side AI SDK call must use `createAiTelemetry()` from `src/lib/observability/ai-telemetry.ts`. The helper enables telemetry with a fixed workflow name and sets both `recordInputs` and `recordOutputs` to `false`. It does not include runtime or tool context. `datadog-init.mjs` also registers `datadog-content-policy.mjs` as an export processor; the processor clears all span inputs and outputs before Datadog formats the event.

This policy prohibits source strings, translations, prompts, completions, chat, email and Slack content, uploaded or extracted document content, tool arguments and results, credentials, and user identifiers. Approved fields are provider, model, token counts, duration, error class, bounded status, safe tool name, and one of the fixed workflow names in `AiWorkflowName`. Do not add free-form tags or metadata to AI telemetry.

The inventory below covers the current server-side generation paths:

| Workflow name                   | Production path                                         |
| ------------------------------- | ------------------------------------------------------- |
| `translation-generation`        | Translation generation and translation subagent         |
| `content-editor-recommendation` | Content editor suggestions                              |
| `conversation-classification`   | Agent conversation routing                              |
| `hyperlocalise-agent`           | Shared email, Slack, web, and GitHub conversation agent |
| `conversation-skill`            | Delegated conversation skills                           |
| `visual-workflow-execution`     | Visual workflow AI nodes                                |
| `email-intent`                  | Email request and clarification classification          |
| `slack-agent`                   | Slack image request classification                      |
| `web-chat-agent`                | Public web chat automation                              |
| `image-extraction`              | Image text extraction                                   |
| `document-variant-generation`   | Document localisation variants                          |
| `localisation-audit`            | Company profile and audit credit scoring                |
| `repository-agent`              | GitHub, GitLab, and repository workflow agents          |
| `workspace-automation`          | Workspace orchestrator and provider tools               |
| `contentful-agent`              | Contentful automation                                   |
| `evaluation-judge`              | Non-production evaluation harness                       |

The repository currently has no `embed` or `embedMany` call sites. Add the same policy before introducing either operation. AI call sites must remain in the Node.js runtime; reject a change that adds `export const runtime = "edge"` to their route or importing module.

Datadog's AI integration uses the active Node.js async context. AI workflow, provider, and tool spans therefore remain children of the originating Next.js request or background workflow trace where a parent exists. The policy creates a new immutable telemetry object for every call; it stores no request state globally.

## Verification

Use a preview deployment before enabling production:

1. Set preview `DD_LLMOBS_SAMPLE_RATE=1.0`. Request a bounded OpenAI-backed AI route and confirm one AI workflow and LLM span arrive with `ml_app:hyperlocalise-web-preview`, `service:hyperlocalise-web`, `env:preview`, provider, model, token counts, status, and duration.
2. Repeat with an Anthropic-backed route. Exercise a tool call and confirm the tool span has a safe tool name and duration but no arguments or result.
3. Open each AI span and confirm it shares the APM trace ID of the originating Next.js request or background workflow where propagation is available.
4. Search the captured payload for unique canary values placed in the source, prompt, expected completion, tool arguments and result, uploaded content, and identifier fields. Stop the rollout if any canary appears.
5. Request a bounded non-AI route and confirm one Next.js server trace arrives with `service:hyperlocalise-web`, `env:preview`, the deployed commit SHA as `version`, a templated resource, status, and duration.
6. Exercise a route that queries Postgres and confirm a `pg` child span shares the trace ID.
7. Exercise a route that calls an external service and confirm an HTTP or `undici` child span shares the trace ID. Verify the outbound request carries W3C trace context to a controlled receiver.
8. Confirm preview and production queries separate cleanly by `env`, and two deployments of the same environment separate by `version`.

After the smoke test, set the preview sampling rate to the intended steady-state value and enable production. If Datadog intake is unavailable, confirm the same AI request still completes normally before rollout continues.

## Sampling, access, retention, and cost

Start production at `DD_LLMOBS_SAMPLE_RATE=0.1`. Review ingested LLM span volume, token distributions, and APM indexed-span volume after 24 hours and seven days. Increase sampling only when the additional diagnostic value justifies the volume. LLM sampling is decided once per trace and differs from the independent Vercel Trace Drain percentage.

Restrict LLM Observability and APM access to engineering and incident-response roles. Use the organization's Datadog retention policy; do not extend retention for content debugging because content is prohibited. Audit access through Datadog's normal role and audit controls.

Expected Datadog cost dimensions are ingested LLM Observability spans, indexed APM spans, and their retention. Model input and output tokens remain provider billing dimensions; Datadog records counts for analysis but does not change provider usage.

## Rollback

Set `DD_LLMOBS_ENABLED=false` (or remove it) and redeploy to stop AI telemetry without changing product behavior. Remove `DD_LLMOBS_AGENTLESS_ENABLED`, `DD_LLMOBS_ML_APP`, `DD_LLMOBS_SAMPLE_RATE`, and `DD_API_KEY` after verification.

To stop all tracing, remove `NODE_OPTIONS` from the affected Vercel environment and redeploy. This stops tracer preload without a code rollback. Disable or remove that project's Trace Drain to stop forwarding platform traces. If the deployment itself is unhealthy, use Vercel's deployment rollback as well. Removing Datadog does not require changing application secrets or database state.
