/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
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
