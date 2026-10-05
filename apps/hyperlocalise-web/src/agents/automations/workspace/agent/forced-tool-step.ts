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
 * model could legitimately skip (e.g. a genuinely optional save_memory call) would end the run
 * before any tool planned after it — like a Slack/email notification — ever ran. save_memory being
 * forced doesn't mean it fabricates content: its own input schema accepts an explicit "nothing to
 * remember" decision instead.
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
