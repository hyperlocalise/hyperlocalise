# Agent uses Vercel AI Gateway unless the org brings a key

## Date

2026-08-16

## Context

The Hyperlocalise agent always called OpenAI through `@ai-sdk/openai` and the
platform `OPENAI_API_KEY`. Org BYOK credentials already existed for
translation, but the conversational agent ignored them. Video already used
Vercel AI Gateway.

We want one managed path for the agent: Vercel AI Gateway. When an organization
stores its own provider key, the agent should call that provider through the
matching AI SDK client.

## Decision

Resolve language models in `src/lib/providers/language-model.ts` and
`src/lib/providers/organization-language-model.ts`.

| Path | When | Client | Auth |
|------|------|--------|------|
| Managed | No org BYOK credential | AI SDK Gateway model string | Vercel OIDC on deploy |
| BYOK | Latest org credential | `createAnthropic`, `createOpenAI`, or OpenAI-compatible | Decrypted org key |

Managed calls pass a Gateway model id, for example `openai/gpt-5.6-luna`
(`hyperlocaliseManagedGatewayModelId`). The AI SDK default provider is Vercel
AI Gateway, so no `AI_GATEWAY_API_KEY` or `createGateway({ apiKey })` is
required on Vercel. BYOK keeps the catalog model name the org selected.

The conversation agent resolves this per organization and reuses that model for
conversation classification. Managed string translation uses the same Gateway
fallback.

Image and video localization stay on the managed Gateway. They never use org
BYOK:

| Media | Gateway model | Why |
|-------|---------------|-----|
| Image translation | `openai/gpt-image-2` | OpenAI image model through Vercel AI Gateway |
| Video translation | `bytedance/seedance-2.5` | Seedance 2.5 through the same Gateway |

File-translation sandboxes follow the same BYOK-then-managed order as string
jobs. When the organization has a stored provider credential, the sandbox CLI
profile uses that provider, model, and decrypted key. Otherwise they use
`ai_gateway` and `AI_GATEWAY_API_KEY` when that env var is set, or `openai` and
`OPENAI_API_KEY`. The Go CLI supports those providers.

OpenAI `reasoningSummary` options apply only for Gateway and OpenAI BYOK.

## Consequences

- Vercel deployments authenticate Gateway with OIDC. Do not set
  `AI_GATEWAY_API_KEY` in the app, CI, or local env files.
- BYOK orgs keep conversational agent and classification traffic on their own
  provider accounts. Image and video jobs still go through the platform Gateway.
- Subagents and automations that call `getHyperlocaliseAgentModel()` use Gateway
  and do not yet read org BYOK. Follow-up if those surfaces should honor BYOK.
