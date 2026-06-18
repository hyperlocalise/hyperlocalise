import { stepCountIs, ToolLoopAgent } from "ai";
import { z } from "zod";

import { loadSubagentInstructions } from "@/agents/_runtime/loader";
import { getHyperlocaliseAgentModel } from "@/lib/agent-runtime/loops/model";
import { buildSubagentToolSet } from "@/lib/agent-runtime/subagents/build-subagent-tools";
import {
  SUBAGENT_NO_QUESTIONS_RULES,
  SUBAGENT_STEP_LIMIT,
  SUBAGENT_TIMEOUT,
} from "@/lib/agent-runtime/subagents/constants";
import type { SubagentCallOptions } from "@/lib/agent-runtime/subagents/types";

const callOptionsSchema = z.object({
  toolContext: z.custom<SubagentCallOptions["toolContext"]>(),
  task: z.string(),
  instructions: z.string(),
});

function buildTranslationSystemPrompt() {
  const base = loadSubagentInstructions({ agentId: "hyperlocalise", subagentId: "translation" });
  return `${base}

## Rules
${SUBAGENT_NO_QUESTIONS_RULES}`;
}

const TRANSLATION_SYSTEM_PROMPT = buildTranslationSystemPrompt();

export const translationSubagent = new ToolLoopAgent({
  model: getHyperlocaliseAgentModel(),
  instructions: TRANSLATION_SYSTEM_PROMPT,
  stopWhen: stepCountIs(SUBAGENT_STEP_LIMIT),
  timeout: SUBAGENT_TIMEOUT,
  callOptionsSchema,
  // @ts-expect-error Dynamic toolset is assembled in prepareCall from ToolContext.
  prepareCall: ({ options, ...settings }) => {
    if (!options) {
      throw new Error("Translation subagent requires call options.");
    }

    const tools = buildSubagentToolSet(options.toolContext, "translation");
    const activeTools = Object.keys(tools) as Array<keyof typeof tools>;

    return {
      ...settings,
      model: getHyperlocaliseAgentModel(),
      tools,
      activeTools: activeTools.length > 0 ? activeTools : undefined,
      instructions: `${TRANSLATION_SYSTEM_PROMPT}

## Task
${options.task}

## Detailed instructions
${options.instructions}`,
    };
  },
});

export { TRANSLATION_SYSTEM_PROMPT };
