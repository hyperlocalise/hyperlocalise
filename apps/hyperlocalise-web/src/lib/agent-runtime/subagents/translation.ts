import { stepCountIs, ToolLoopAgent } from "ai";
import { z } from "zod";

import { getHyperlocaliseAgentModel } from "@/lib/agent-runtime/loops/model";

import { buildSubagentToolSet } from "./build-subagent-tools";
import {
  SUBAGENT_NO_QUESTIONS_RULES,
  SUBAGENT_RESPONSE_FORMAT,
  SUBAGENT_STEP_LIMIT,
} from "./constants";
import type { SubagentCallOptions } from "./types";

const TRANSLATION_SYSTEM_PROMPT = `You are the Hyperlocalise translation agent.

## Role
Create and queue file translation jobs from source files already attached to the conversation.

## Rules
${SUBAGENT_NO_QUESTIONS_RULES}
- Use createTranslationJob with type "file" only when sourceFileId values are present.
- Ask for targetLocales (and sourceLocale when missing) in your summary if you could not queue a job.
- Do not invent sourceFileId values.

${SUBAGENT_RESPONSE_FORMAT}`;

const callOptionsSchema = z.object({
  toolContext: z.custom<SubagentCallOptions["toolContext"]>(),
  task: z.string(),
  instructions: z.string(),
});

export const translationSubagent = new ToolLoopAgent({
  model: getHyperlocaliseAgentModel(),
  instructions: TRANSLATION_SYSTEM_PROMPT,
  stopWhen: stepCountIs(SUBAGENT_STEP_LIMIT),
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
