import { openai } from "@ai-sdk/openai";

import { env } from "@/lib/env";

import { hyperlocaliseAgentModelId } from "./model-id";

export { hyperlocaliseAgentModelId } from "./model-id";

export function getHyperlocaliseAgentModel() {
  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  return openai(hyperlocaliseAgentModelId);
}
