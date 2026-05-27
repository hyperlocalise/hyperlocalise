import type { HyperlocaliseAgentRuntimeContext } from "@/lib/agent-runtime/context";

import { repositorySubagent } from "./repository";
import { translationSubagent } from "./translation";
import {
  SUBAGENT_TYPES,
  type HyperlocaliseSubagentType,
  type SubagentRegistryEntry,
} from "./types";

export { SUBAGENT_TYPES, type HyperlocaliseSubagentType };

export const SUBAGENT_REGISTRY = {
  translation: {
    shortDescription:
      "Translate uploaded localization files and queue translation jobs when sourceFileId values are available",
    agent: translationSubagent,
    isAvailable: (runtime: HyperlocaliseAgentRuntimeContext) =>
      runtime.hasFileAttachments || runtime.suggestedMode === "translation",
    unavailableMessage: (_runtime) =>
      "Translation requires an attached localization file with a target language.",
  },
  repository: {
    shortDescription:
      "Explore a connected GitHub repository for localization context around source strings, messages, or keys (read-only)",
    agent: repositorySubagent,
    isAvailable: (runtime: HyperlocaliseAgentRuntimeContext) =>
      Boolean(runtime.toolContext.sandboxId),
    unavailableMessage: (_runtime) =>
      "Repository search requires a connected GitHub repository. Enable one under Agent → GitHub or specify the repo in your message.",
  },
} satisfies Record<HyperlocaliseSubagentType, SubagentRegistryEntry>;

export function buildSubagentSummaryLines(): string {
  return SUBAGENT_TYPES.map((type) => {
    const subagent = SUBAGENT_REGISTRY[type];
    return `- \`${type}\` — ${subagent.shortDescription}`;
  }).join("\n");
}
