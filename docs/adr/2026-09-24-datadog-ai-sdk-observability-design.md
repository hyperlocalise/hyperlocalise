# Datadog observability for AI SDK calls

## Summary

Instrument server-side Vercel AI SDK calls with Datadog LLM Observability. Use Datadog's native `ai` integration so model calls, token usage, tool execution, latency, and errors join the active Next.js or workflow trace. Vercel has no colocated Datadog Agent, so LLM Observability uses agentless intake while the existing Vercel Trace Drain continues to carry APM traces.

The integration must fail closed for content. Every AI SDK call sets `recordInputs: false` and `recordOutputs: false`. A Datadog span processor also clears span inputs and outputs immediately before export. Neither layer includes runtime or tool context. Exported spans may contain only stable workflow names, provider and model identity, token metrics, latency, error class, bounded status, and tool names.

## Architecture

`datadog-init.mjs` remains the first server-side module loaded through `NODE_OPTIONS`. It initializes `dd-trace`, then registers the content-redaction processor before Next.js loads `ai`. Next.js keeps `dd-trace` and `ai` external so Datadog can attach its module and diagnostics-channel hooks. The workflow compiler continues to bundle the OpenAI and Anthropic provider packages because workflow steps use their serialization classes; Datadog observes their lifecycle through the external `ai` package.

A small application helper creates AI SDK telemetry settings. It accepts a fixed workflow name and always returns enabled telemetry with input and output recording disabled. Call sites use names such as `translation-generation`, `conversation-classification`, `visual-workflow-execution`, `email-intent`, `slack-agent`, `image-extraction`, and `localisation-audit`. They do not add user, organization, file, project, prompt, or tool context.

Datadog's async context links AI workflow, provider, and tool spans to an active request or background workflow span. Call sites remain in the Node.js runtime because `dd-trace` does not support Edge.

## Data flow and failure handling

An AI SDK call emits lifecycle events on the SDK's Node.js tracing channel. Datadog consumes those events and creates a workflow span, an LLM child span for each provider request, and tool spans when tools execute. Provider/model identity and token usage come from structured SDK events rather than application content.

The per-call telemetry policy prevents the SDK from placing prompts, completions, tool arguments, or tool results in telemetry events. The export processor replaces any input and output arrays that still reach Datadog with empty arrays. This second layer protects against call-site regressions and integration behavior changes.

Instrumentation is passive. When `DD_LLMOBS_ENABLED` is false or absent, AI behavior stays unchanged. Writer failures are handled by `dd-trace` and never enter the generation result path. Agentless intake uses bounded timeouts and asynchronous buffering; rollback removes the LLM Observability environment variables and redeploys.

## Vercel configuration

Production and preview configure `DD_LLMOBS_ENABLED`, `DD_LLMOBS_ML_APP`, `DD_LLMOBS_AGENTLESS_ENABLED`, `DD_LLMOBS_SAMPLE_RATE`, `DD_SITE`, `DD_SERVICE`, `DD_ENV`, and `DD_VERSION`. `DD_API_KEY` is a Vercel secret and is required only for agentless LLM Observability intake. APM continues through the Vercel Trace Drain rather than direct agentless trace intake.

Start LLM Observability sampling conservatively and review ingested spans and token volume before increasing it. Restrict dashboard and trace access to operators who need it, and apply the organization's Datadog retention policy. Expected cost drivers are sampled LLM Observability spans, indexed APM spans, and Datadog retention; model token costs remain provider charges.

## Verification

Unit tests assert that every telemetry configuration disables content recording and that the export processor clears representative prompts, completions, tool arguments, results, credentials, and identifiers without changing safe tags. A concurrent test verifies that independent configurations do not share mutable state.

Repository checks inventory production AI SDK calls and Edge runtime declarations before rollout. Unit tests verify the shared content policy independently of a live provider or Datadog intake.

A preview smoke test then confirms that representative OpenAI and Anthropic spans arrive under the intended environment and ML application, carry provider/model, latency, status, and token usage, and share the originating request or workflow trace. Operators must inspect the exported payload for prohibited content before enabling production.
