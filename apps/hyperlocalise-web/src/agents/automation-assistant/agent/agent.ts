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
import { isStepCount, ToolLoopAgent, type LanguageModel } from "ai";

import { composeInstructions } from "@/agents/_runtime/compose-instructions";
import { DEFAULT_AGENT_TIMEOUT } from "@/lib/agent-runtime/subagents/constants";
import { getHyperlocaliseAgentModel } from "@/lib/agent-runtime/loops/model";
import {
  buildWorkspaceAutomationAssistantInstructions,
  UPDATE_AUTOMATION_SETUP_TOOL_NAME,
} from "@/lib/agents/workspace-automation-assistant";
import type { WorkspaceAutomationEditorContext } from "@/lib/agents/workspace-automation-editor-context";

import {
  createUpdateAutomationSetupTool,
  type AutomationAssistantToolContext,
} from "./tools/update_automation_setup";

export const automationAssistantAgentId = "automation-assistant";
/** A turn reads the page, calls the setup tool once or twice, and writes the reply. */
export const automationAssistantStepLimit = 6;
export const automationAssistantMaxOutputTokens = 4_000;

/** The agent's own instructions followed by the section that changes with the page. */
export function buildAutomationAssistantInstructions(
  context: WorkspaceAutomationEditorContext,
): string {
  return composeInstructions({
    agentId: automationAssistantAgentId,
    dynamicSections: [buildWorkspaceAutomationAssistantInstructions(context)],
  });
}

/**
 * The automation assistant for one turn. It knows the page the turn was sent from and has the
 * setup tool and nothing else: no repository, no translation, no web, no subagents.
 */
export function createAutomationAssistantAgent(input: {
  context: WorkspaceAutomationEditorContext;
  model?: LanguageModel;
}) {
  const toolContext: AutomationAssistantToolContext = { automationEditor: input.context };
  return new ToolLoopAgent({
    model: input.model ?? getHyperlocaliseAgentModel(),
    instructions: buildAutomationAssistantInstructions(input.context),
    tools: {
      [UPDATE_AUTOMATION_SETUP_TOOL_NAME]: createUpdateAutomationSetupTool(toolContext),
    },
    maxOutputTokens: automationAssistantMaxOutputTokens,
    timeout: DEFAULT_AGENT_TIMEOUT,
    stopWhen: isStepCount(automationAssistantStepLimit),
  });
}
