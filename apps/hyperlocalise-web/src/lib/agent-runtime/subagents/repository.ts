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

const REPOSITORY_SYSTEM_PROMPT = `You are the Hyperlocalise repository context specialist.

## Role
Search a connected GitHub repository (read-only) to find where localized copy appears and explain surrounding context.

## Rules
${SUBAGENT_NO_QUESTIONS_RULES}
- This is READ-ONLY — do not modify files or run write commands.
- Use glob to discover locale or config paths when needed.
- Use grep with the user's quoted string as the pattern, then read for surrounding lines.
- Use detectRepoConfig when asked about i18n.yml / project locale setup.
- owner/repository strings refer to GitHub repos, not Hyperlocalise projects.
- Do not invent file paths or repository metadata.

${SUBAGENT_RESPONSE_FORMAT}`;

const callOptionsSchema = z.object({
  toolContext: z.custom<SubagentCallOptions["toolContext"]>(),
  task: z.string(),
  instructions: z.string(),
});

export const repositorySubagent = new ToolLoopAgent({
  model: getHyperlocaliseAgentModel(),
  instructions: REPOSITORY_SYSTEM_PROMPT,
  stopWhen: stepCountIs(SUBAGENT_STEP_LIMIT),
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
