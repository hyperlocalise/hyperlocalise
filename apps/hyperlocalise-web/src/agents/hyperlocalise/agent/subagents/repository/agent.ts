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

function buildRepositorySystemPrompt() {
  const base = loadSubagentInstructions({ agentId: "hyperlocalise", subagentId: "repository" });
  return `${base}

## Rules
${SUBAGENT_NO_QUESTIONS_RULES}`;
}

export const REPOSITORY_SYSTEM_PROMPT = buildRepositorySystemPrompt();

export const repositorySubagent = new ToolLoopAgent({
  model: getHyperlocaliseAgentModel(),
  instructions: REPOSITORY_SYSTEM_PROMPT,
  stopWhen: stepCountIs(SUBAGENT_STEP_LIMIT),
  timeout: SUBAGENT_TIMEOUT,
  callOptionsSchema,
  // @ts-expect-error Dynamic toolset is assembled in prepareCall from ToolContext.
  prepareCall: ({ options, ...settings }) => {
    if (!options) {
      throw new Error("Repository subagent requires call options.");
    }

    const tools = buildSubagentToolSet(options.toolContext, "repository");
    const activeTools = Object.keys(tools) as Array<keyof typeof tools>;

    return {
      ...settings,
      model: getHyperlocaliseAgentModel(),
      tools,
      activeTools: activeTools.length > 0 ? activeTools : undefined,
      instructions: `${REPOSITORY_SYSTEM_PROMPT}

## Task
${options.task}

## Detailed instructions
${options.instructions}`,
    };
  },
});
