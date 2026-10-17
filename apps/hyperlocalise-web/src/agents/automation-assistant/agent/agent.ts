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
import { describeAutomationAssistantCatalogue } from "@/lib/agents/automation-assistant-editors";

import {
  automationAssistantSkillFor,
  createAutomationAssistantTools,
  type AutomationAssistantToolContext,
} from "./editors";

export const AUTOMATION_ASSISTANT_AGENT_ID = "automation-assistant";
/** A turn reads the page, calls the editor's tool once or twice, and writes the reply. */
export const AUTOMATION_ASSISTANT_STEP_LIMIT = 6;
export const AUTOMATION_ASSISTANT_MAX_OUTPUT_TOKENS = 4_000;

/**
 * The agent's own instructions, how to work in the editor the turn was sent from, and what it
 * can set there. Nothing in it depends on the page or the turn: the page as it stands goes with
 * the person's newest message instead.
 */
export function buildAutomationAssistantInstructions(
  kind: AutomationAssistantToolContext["kind"] = "automation-editor",
): string {
  return composeInstructions({
    agentId: AUTOMATION_ASSISTANT_AGENT_ID,
    skills: [automationAssistantSkillFor(kind)],
    dynamicSections: [describeAutomationAssistantCatalogue(kind)],
  });
}

/**
 * The automation assistant for one turn. It knows the page the turn was sent from and has that
 * editor's tool and nothing else: no repository, no translation, no web, no subagents.
 */
export function createAutomationAssistantAgent(input: {
  /** The page as the turn knows it. The tool rewrites it, so the caller can read the page the turn left. */
  toolContext: AutomationAssistantToolContext;
  model?: LanguageModel;
}) {
  const { toolContext } = input;
  return new ToolLoopAgent({
    model: input.model ?? getHyperlocaliseAgentModel(),
    instructions: buildAutomationAssistantInstructions(toolContext.kind),
    tools: createAutomationAssistantTools(toolContext),
    maxOutputTokens: AUTOMATION_ASSISTANT_MAX_OUTPUT_TOKENS,
    timeout: DEFAULT_AGENT_TIMEOUT,
    stopWhen: isStepCount(AUTOMATION_ASSISTANT_STEP_LIMIT),
  });
}
