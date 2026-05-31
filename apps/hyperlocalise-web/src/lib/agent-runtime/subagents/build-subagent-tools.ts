import type { ToolSet } from "ai";

import {
  filterToolSetByNames,
  repositoryWorkspaceToolNames,
} from "@/lib/agent-runtime/tools/manifest";
import { buildTools } from "@/lib/agent-runtime/tools/registry";
import type { ToolContext } from "@/lib/agent-contracts/tool-context";

import type { HyperlocaliseSubagentType } from "./types";

const subagentToolNames = {
  translation: ["createTranslationJob"],
  repository: [...repositoryWorkspaceToolNames],
} satisfies Record<HyperlocaliseSubagentType, string[]>;

export function buildSubagentToolSet(
  toolContext: ToolContext,
  subagentType: HyperlocaliseSubagentType,
): ToolSet {
  const built = buildTools(toolContext);
  return filterToolSetByNames(built, subagentToolNames[subagentType]);
}

export function listSubagentToolNames(subagentType: HyperlocaliseSubagentType): string[] {
  return [...subagentToolNames[subagentType]];
}
