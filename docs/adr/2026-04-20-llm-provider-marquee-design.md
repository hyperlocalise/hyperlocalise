# LLM Provider Marquee Design

## Context

The marketing homepage used a plain text logo strip that mixed LLM providers and TMS vendors. That weakened the message in the hero area and did not reflect the providers supported by the web product.

## Decision

Replace the strip with a dedicated marquee for supported LLM providers:

- Show OpenAI, Anthropic, Gemini, Groq, and Mistral.
- Render each provider as a monochrome inline SVG wordmark inside a subtle pill.
- Reuse the existing marketing marquee animation and duplicate the provider list for seamless looping.
- Fall back to a wrapped static row when motion should be reduced or when the layout is narrow.

## Rationale

This keeps the section aligned with actual product capability, reads clearly as provider support, and adds movement without introducing a new animation system or additional assets.
