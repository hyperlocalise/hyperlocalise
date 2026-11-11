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
import type { WorkspaceOrchestratorToolName } from "./plan";

/**
 * Forces the planned tool for each orchestrator model step.
 *
 * Every planned tool is forced via toolChoice: { type: "tool", toolName }, never "auto": the agent
 * loop only continues past a step that produced at least one tool call, so an "auto" step the
 * model could legitimately skip would end the run before any tool planned after it — like a
 * Slack/email notification — ever ran.
 */
export function forcedWorkspaceOrchestratorStep(
  planTools: readonly WorkspaceOrchestratorToolName[],
  stepNumber: number,
) {
  const toolName = planTools[stepNumber];
  if (toolName) {
    return {
      activeTools: [toolName],
      toolChoice: { type: "tool" as const, toolName },
    };
  }

  return { toolChoice: "none" as const };
}
