import type {
  WorkspaceAutomationRecord,
  WorkspaceAutomationRunRecord,
  WorkspaceAutomationRunStatus,
} from "@/lib/agents/workspace-automations";

import type { WorkspaceOrchestratorPlan, WorkspaceOrchestratorToolName } from "./plan";

export type WorkspaceOrchestratorRepository = {
  id: string;
  githubInstallationId: string;
  githubRepositoryId: string;
};

export type WorkspaceOrchestratorSession = {
  organizationId: string;
  automation: WorkspaceAutomationRecord;
  run: WorkspaceAutomationRunRecord;
  plan: WorkspaceOrchestratorPlan;
  repository: WorkspaceOrchestratorRepository | null;
  composedInstructions: string;
  stepResults: Partial<Record<WorkspaceOrchestratorToolName, Record<string, unknown>>>;
  terminalStatus: WorkspaceAutomationRunStatus | null;
  terminalError: string | null;
};

export function createWorkspaceOrchestratorSession(input: {
  organizationId: string;
  automation: WorkspaceAutomationRecord;
  run: WorkspaceAutomationRunRecord;
  plan: WorkspaceOrchestratorPlan;
  repository: WorkspaceOrchestratorRepository | null;
  composedInstructions: string;
}): WorkspaceOrchestratorSession {
  return {
    organizationId: input.organizationId,
    automation: input.automation,
    run: input.run,
    plan: input.plan,
    repository: input.repository,
    composedInstructions: input.composedInstructions,
    stepResults: {},
    terminalStatus: null,
    terminalError: null,
  };
}
