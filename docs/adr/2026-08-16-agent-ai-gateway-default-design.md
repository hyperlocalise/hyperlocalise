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
| Managed | No org BYOK credential | `createGateway` from the AI SDK | Platform `AI_GATEWAY_API_KEY` |
| BYOK | Latest org credential | `createAnthropic`, `createOpenAI`, or OpenAI-compatible | Decrypted org key |

Managed model id is `openai/gpt-5.6-luna` (`hyperlocaliseManagedGatewayModelId`).
BYOK keeps the catalog model name the org selected.

The conversation agent resolves this per organization and reuses that model for
conversation classification. Managed string translation uses the same Gateway
fallback.

Image and video localization stay on the managed Gateway. They never use org
BYOK:

| Media | Gateway model | Why |
|-------|---------------|-----|
| Image translation | `openai/gpt-image-2` | OpenAI image model through Vercel AI Gateway |
| Video translation | `google/gemini-omni-flash-preview` | Gemini Omni through the same Gateway |

File-translation sandboxes and the Go CLI still use `OPENAI_API_KEY`.

OpenAI `reasoningSummary` options apply only for Gateway and OpenAI BYOK.

## Consequences

- Deployments that run the agent, managed translation, image localization, or
  video localization need `AI_GATEWAY_API_KEY`.
- BYOK orgs keep conversational agent and classification traffic on their own
  provider accounts. Image and video jobs still go through the platform Gateway.
- Subagents and automations that call `getHyperlocaliseAgentModel()` use Gateway
  and do not yet read org BYOK. Follow-up if those surfaces should honor BYOK.
