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
import { isStepCount, ToolLoopAgent } from "ai";

import { hyperlocaliseAgentMaxOutputTokens } from "@/lib/agent-runtime/loops/hyperlocalise-agent";
import {
  WORKSPACE_ORCHESTRATOR_STEP_LIMIT,
  WORKSPACE_ORCHESTRATOR_TIMEOUT,
} from "@/lib/agent-runtime/subagents/constants";
import { resolveWorkspaceAutomationModel } from "@/lib/agents/workspace-automation-types";

import { buildWorkspaceOrchestratorTools } from "./build-workspace-orchestrator-tools";
import type { WorkspaceOrchestratorSession } from "./context";

export function createWorkspaceOrchestratorAgent(session: WorkspaceOrchestratorSession) {
  const tools = buildWorkspaceOrchestratorTools(session);
  const plannedToolCount = session.plan.tools.length;
  // WORKSPACE_ORCHESTRATOR_STEP_LIMIT is a floor, not a ceiling: prepareStep below forces the
  // exact next planned tool at each step (or toolChoice: "none" past the end of the plan), so
  // there's no way for the loop to run past plannedToolCount + 1 steps regardless of how high this
  // is set. Capping it with Math.min instead used to silently drop any planned tool beyond the
  // limit — e.g. Memory enabled on an automation already planning 6 tools pushed the 7th (often
  // the Slack/email notification) past the cap, so it never ran even though the automation
  // reported success.
  //
  // Every planned tool is forced via toolChoice: { type: "tool", toolName }, never "auto": the
  // underlying ToolLoopAgent's step loop only continues past a step that produced at least one
  // tool call, so an "auto" step the model could legitimately skip (e.g. a genuinely optional
  // save_memory call) risked ending the run before any tool planned after it — like a Slack/email
  // notification — ever ran. save_memory being forced doesn't mean it fabricates content: its own
  // input schema accepts an explicit "nothing to remember" decision instead.
  const stepLimit = Math.max(WORKSPACE_ORCHESTRATOR_STEP_LIMIT, plannedToolCount + 1);

  return new ToolLoopAgent({
    model: resolveWorkspaceAutomationModel(session.automation.model),
    instructions: session.composedInstructions,
    tools,
    activeTools: session.plan.tools,
    runtimeContext: session,
    maxOutputTokens: hyperlocaliseAgentMaxOutputTokens,
    timeout: WORKSPACE_ORCHESTRATOR_TIMEOUT,
    stopWhen: isStepCount(stepLimit),
    prepareStep: ({ stepNumber }) => {
      const toolName = session.plan.tools[stepNumber];
      if (toolName) {
        return {
          activeTools: [toolName],
          toolChoice: { type: "tool", toolName },
        };
      }

      return {
        toolChoice: "none",
      };
    },
  });
}
