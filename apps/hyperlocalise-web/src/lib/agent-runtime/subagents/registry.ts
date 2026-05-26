import type { HyperlocaliseAgentRuntimeContext } from "@/lib/agent-runtime/context";

import {
  buildSubagentSummaryLines,
  SUBAGENT_REGISTRY,
  SUBAGENT_TYPES,
  type HyperlocaliseSubagentType,
} from "./definitions";

export {
  SUBAGENT_REGISTRY,
  SUBAGENT_TYPES,
  buildSubagentSummaryLines,
  type HyperlocaliseSubagentType,
};

export function listAvailableSubagentTypes(
  runtime: HyperlocaliseAgentRuntimeContext,
): HyperlocaliseSubagentType[] {
  return SUBAGENT_TYPES.filter((type) => SUBAGENT_REGISTRY[type].isAvailable(runtime));
}

export function resolveSubagentTypeForMode(
  runtime: HyperlocaliseAgentRuntimeContext,
): HyperlocaliseSubagentType | null {
  if (
    runtime.suggestedMode === "translation" &&
    SUBAGENT_REGISTRY.translation.isAvailable(runtime)
  ) {
    return "translation";
  }

  if (runtime.suggestedMode === "repository" && SUBAGENT_REGISTRY.repository.isAvailable(runtime)) {
    return "repository";
  }

  const available = listAvailableSubagentTypes(runtime);
  if (available.length === 1) {
    return available[0]!;
  }

  return null;
}
