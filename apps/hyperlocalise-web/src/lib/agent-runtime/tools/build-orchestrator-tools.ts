import type { ToolSet } from "ai";

import { createCheckCrowdinProgressTool } from "@/agents/_runtime/shared-tools/check_crowdin_progress";
import type { ToolContext } from "@/lib/agent-contracts/tool-context";
import {
  createGetProjectContextTool,
  createListProjectsTool,
  createUpdateInteractionProjectTool,
} from "@/lib/tools/project-tools";

export {
  orchestratorDirectToolNames,
  shouldUseCrowdinDirectTools,
  type OrchestratorDirectToolName,
} from "./orchestrator-direct-path";

export function buildOrchestratorDirectTools(toolContext: ToolContext): ToolSet {
  return {
    list_projects: createListProjectsTool(toolContext),
    get_project_context: createGetProjectContextTool(toolContext),
    update_interaction_project: createUpdateInteractionProjectTool(toolContext),
    check_crowdin_progress: createCheckCrowdinProgressTool(toolContext),
  };
}
