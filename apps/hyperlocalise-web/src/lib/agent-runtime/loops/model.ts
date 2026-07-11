import { openai } from "@ai-sdk/openai";

import { env } from "@/lib/env";

export const hyperlocaliseAgentModelId = "gpt-5.6-luna";

export function getHyperlocaliseAgentModel() {
  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  return openai(hyperlocaliseAgentModelId);
}
