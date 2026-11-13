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
import {
  WORKSPACE_ORCHESTRATOR_DURABLE_TOOL_BUDGET_MS,
  WORKSPACE_ORCHESTRATOR_TOOL_BUDGET_MS,
} from "@/lib/agent-runtime/subagents/constants";

import type { WorkspaceOrchestratorToolName } from "./plan";
import type { RepositoryAgentToolName } from "./repository-agent";

/*
 * Imported by the workspace automation `"use workflow"` module: constants and type imports only.
 */

export const WORKSPACE_AUTOMATION_RUN_CANCELLED = "workspace_automation_run_cancelled";

export function isRepositoryAgentToolName(name: string): name is RepositoryAgentToolName {
  return name === "use_github_repository" || name === "use_gitlab_repository";
}

/**
 * Deadline for the orchestrator's model calls. Tools that wait durably (repository agents, GitHub
 * jobs) run far longer than one step, so each planned tool contributes its own budget.
 */
export function workspaceOrchestratorDeadlineMs(
  planTools: readonly WorkspaceOrchestratorToolName[],
) {
  return planTools.reduce(
    (total, name) =>
      total +
      (name in WORKSPACE_ORCHESTRATOR_DURABLE_TOOL_BUDGET_MS
        ? WORKSPACE_ORCHESTRATOR_DURABLE_TOOL_BUDGET_MS[
            name as keyof typeof WORKSPACE_ORCHESTRATOR_DURABLE_TOOL_BUDGET_MS
          ]
        : WORKSPACE_ORCHESTRATOR_TOOL_BUDGET_MS),
    0,
  );
}
