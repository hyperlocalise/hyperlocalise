import { env } from "@/lib/env";

export function isWorkspaceOrchestratorEnabled() {
  return env.WORKSPACE_ORCHESTRATOR_ENABLED;
}
