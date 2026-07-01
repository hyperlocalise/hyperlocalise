import type { HyperlocaliseAgentRuntimeContext } from "@/lib/agent-runtime/context";

export const orchestratorDirectToolNames = [
  "list_projects",
  "get_project_context",
  "update_interaction_project",
  "check_crowdin_progress",
] as const;

export type OrchestratorDirectToolName = (typeof orchestratorDirectToolNames)[number];

export function shouldUseCrowdinDirectTools(
  runtime: Pick<HyperlocaliseAgentRuntimeContext, "suggestedIntents" | "hasFileAttachments">,
): boolean {
  return (
    runtime.suggestedIntents.includes("translation") &&
    !runtime.suggestedIntents.includes("repository") &&
    !runtime.hasFileAttachments
  );
}
