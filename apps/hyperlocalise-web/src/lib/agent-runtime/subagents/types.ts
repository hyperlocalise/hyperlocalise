import type { HyperlocaliseAgentRuntimeContext } from "@/lib/agent-runtime/context";
import type { ToolContext } from "@/lib/agent-contracts/tool-context";

import type { repositorySubagent } from "./repository";
import type { translationSubagent } from "./translation";

export const SUBAGENT_TYPES = ["translation", "repository"] as const;

export type HyperlocaliseSubagentType = (typeof SUBAGENT_TYPES)[number];

export type SubagentCallOptions = {
  toolContext: ToolContext;
  task: string;
  instructions: string;
};

export type HyperlocaliseSubagent = typeof translationSubagent | typeof repositorySubagent;

export type SubagentRegistryEntry = {
  shortDescription: string;
  agent: HyperlocaliseSubagent;
  isAvailable: (runtime: HyperlocaliseAgentRuntimeContext) => boolean;
  unavailableMessage: (runtime: HyperlocaliseAgentRuntimeContext) => string;
};
