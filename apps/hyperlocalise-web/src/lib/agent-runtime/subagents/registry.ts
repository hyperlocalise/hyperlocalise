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

/** Preferred delegation order when multiple subagents are available (repository context before translation). */
export function resolvePreferredSubagentOrder(
  runtime: HyperlocaliseAgentRuntimeContext,
): HyperlocaliseSubagentType[] {
  const available = new Set(listAvailableSubagentTypes(runtime));
  const order: HyperlocaliseSubagentType[] = [];

  if (available.has("repository")) {
    order.push("repository");
  }

  if (available.has("translation")) {
    order.push("translation");
  }

  return order;
}

export function resolveSubagentTypeForMode(
  runtime: HyperlocaliseAgentRuntimeContext,
): HyperlocaliseSubagentType | null {
  return resolvePreferredSubagentOrder(runtime)[0] ?? null;
}
