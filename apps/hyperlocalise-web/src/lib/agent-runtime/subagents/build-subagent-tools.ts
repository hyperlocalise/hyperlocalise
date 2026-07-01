import type { ToolSet } from "ai";

import {
  filterToolSetByNames,
  repositoryWorkspaceToolNames,
} from "@/lib/agent-runtime/tools/manifest";
import { buildTools } from "@/lib/agent-runtime/tools/registry";
import type { ToolContext } from "@/lib/agent-contracts/tool-context";

import { createTranslateStringTool } from "@/agents/_runtime/shared-tools/translate_string";
import { createCheckCrowdinProgressTool } from "@/agents/_runtime/shared-tools/check_crowdin_progress";

import type { HyperlocaliseSubagentType } from "./types";

const subagentToolNames = {
  translation: ["createTranslationJob"],
  repository: [...repositoryWorkspaceToolNames],
} satisfies Record<HyperlocaliseSubagentType, string[]>;

function listTranslationToolNames(projectId: string | null): string[] {
  const names = [...subagentToolNames.translation];
  if (projectId) {
    names.push("translate_string", "check_crowdin_progress");
  }
  return names;
}

export function buildSubagentToolSet(
  toolContext: ToolContext,
  subagentType: HyperlocaliseSubagentType,
): ToolSet {
  const built = buildTools(toolContext);
  const names =
    subagentType === "translation"
      ? listTranslationToolNames(toolContext.projectId)
      : subagentToolNames[subagentType];
  const filtered = filterToolSetByNames(built, names);

  if (subagentType === "translation" && toolContext.projectId) {
    return {
      ...filtered,
      translate_string: createTranslateStringTool(toolContext),
      check_crowdin_progress: createCheckCrowdinProgressTool(toolContext),
    };
  }

  return filtered;
}

export function listSubagentToolNames(
  subagentType: HyperlocaliseSubagentType,
  options?: { projectId?: string | null },
): string[] {
  if (subagentType === "translation") {
    return listTranslationToolNames(options?.projectId ?? null);
  }

  return [...subagentToolNames[subagentType]];
}
