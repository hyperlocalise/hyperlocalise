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
} from "@/lib/agent-runtime/skills/conversation-skill-registry";
import { DEFAULT_AGENT_TIMEOUT } from "@/lib/agent-runtime/subagents/constants";
import {
  hyperlocaliseAgentMaxOutputTokens,
  hyperlocaliseAgentStepLimit,
  prepareConversationSkillStep,
} from "@/lib/agent-runtime/loops/hyperlocalise-agent";

import {
  getAgentProviderOptions,
  type ResolvedAgentLanguageModel,
} from "@/lib/providers/language-model";
import { resolveHyperlocaliseAgentLanguageModel } from "@/lib/providers/organization-language-model";

export type ConversationSkillAgentOnFinish = ToolLoopAgentSettings<never, ToolSet>["onEnd"];

export async function createConversationSkillAgent(
  runtime: HyperlocaliseAgentRuntimeContext,
  onEnd?: ConversationSkillAgentOnFinish,
  languageModel?: ResolvedAgentLanguageModel,
) {
  const skillPlan = buildConversationSkillPlan(runtime);
  // Filtering lives in buildConversationSkillTools; activeTools mirrors what was built.
  const tools = buildConversationSkillTools(runtime, skillPlan.toolNames);
  const activeTools = Object.keys(tools);
  const resolvedModel =
    languageModel ??
    (await resolveHyperlocaliseAgentLanguageModel({
      organizationId: runtime.toolContext.organizationId,
    }));

  return new ToolLoopAgent<never, ToolSet>({
    model: resolvedModel.model,
    instructions: buildConversationSkillInstructions({
      surface: runtime.surface,
      projectId: runtime.toolContext.projectId,
      skillPlan,
      attachedProject: runtime.attachedProject,
      glossarySearchEnabled: runtime.toolContext.glossarySearchEnabled === true,
      additionalInstructions: runtime.additionalInstructions,
    }),
    tools,
    activeTools,
    providerOptions: getAgentProviderOptions(resolvedModel.source),
    runtimeContext: runtime,
    maxOutputTokens: hyperlocaliseAgentMaxOutputTokens,
    timeout: DEFAULT_AGENT_TIMEOUT,
    stopWhen: isStepCount(hyperlocaliseAgentStepLimit),
    prepareStep: prepareConversationSkillStep,
    onEnd,
  });
}
