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
import { isStepCount, ToolLoopAgent, type ToolLoopAgentSettings, type ToolSet } from "ai";

import type { HyperlocaliseAgentRuntimeContext } from "@/lib/agent-runtime/context";
import { buildConversationSkillInstructions } from "@/lib/agent-runtime/skills/compose-conversation-skill-instructions";
import {
  buildConversationSkillPlan,
  buildConversationSkillTools,
  filterAvailableConversationToolNames,
} from "@/lib/agent-runtime/skills/conversation-skill-registry";
import { DEFAULT_AGENT_TIMEOUT } from "@/lib/agent-runtime/subagents/constants";
import {
  hyperlocaliseAgentMaxOutputTokens,
  hyperlocaliseAgentStepLimit,
  prepareConversationSkillStep,
} from "@/lib/agent-runtime/loops/hyperlocalise-agent";

import { getHyperlocaliseAgentModel } from "./model";

export type ConversationSkillAgentOnFinish = ToolLoopAgentSettings<never, ToolSet>["onEnd"];

export function createConversationSkillAgent(
  runtime: HyperlocaliseAgentRuntimeContext,
  onEnd?: ConversationSkillAgentOnFinish,
) {
  const skillPlan = buildConversationSkillPlan(runtime);
  const toolNames = filterAvailableConversationToolNames(skillPlan.toolNames, runtime);
  const tools = buildConversationSkillTools(runtime, toolNames);

  return new ToolLoopAgent<never, ToolSet>({
    model: getHyperlocaliseAgentModel(),
    instructions: buildConversationSkillInstructions({
      surface: runtime.surface,
      projectId: runtime.toolContext.projectId,
      skillPlan,
      additionalInstructions: runtime.additionalInstructions,
    }),
    tools,
    activeTools: toolNames,
    providerOptions: {
      openai: {
        reasoningSummary: "auto",
      },
    },
    runtimeContext: runtime,
    maxOutputTokens: hyperlocaliseAgentMaxOutputTokens,
    timeout: DEFAULT_AGENT_TIMEOUT,
    stopWhen: isStepCount(hyperlocaliseAgentStepLimit),
    prepareStep: prepareConversationSkillStep,
    onEnd,
  });
}
