import { openai } from "@ai-sdk/openai";

import { env } from "@/lib/env";

export const hyperlocaliseAgentModelId = "gpt-5.4-mini";

export function getHyperlocaliseAgentModel() {
  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  return openai(hyperlocaliseAgentModelId);
}
