import type { ToolSet } from "ai";

import {
  filterToolSetByNames,
  repositoryWorkspaceToolNames,
} from "@/lib/agent-runtime/tools/manifest";
import { buildTools } from "@/lib/agent-runtime/tools/registry";
import type { ToolContext } from "@/lib/agent-contracts/tool-context";

import { createTranslateStringTool } from "@/agents/_runtime/shared-tools/translate_string";

import type { HyperlocaliseSubagentType } from "./types";

const subagentToolNames = {
  translation: ["createTranslationJob", "translate_string"],
  repository: [...repositoryWorkspaceToolNames],
} satisfies Record<HyperlocaliseSubagentType, string[]>;

export function buildSubagentToolSet(
  toolContext: ToolContext,
  subagentType: HyperlocaliseSubagentType,
): ToolSet {
  const built = buildTools(toolContext);
  const filtered = filterToolSetByNames(built, subagentToolNames[subagentType]);

  if (subagentType === "translation" && toolContext.projectId) {
    return {
      ...filtered,
      translate_string: createTranslateStringTool(toolContext),
    };
  }

  return filtered;
}

export function listSubagentToolNames(subagentType: HyperlocaliseSubagentType): string[] {
  return [...subagentToolNames[subagentType]];
}
