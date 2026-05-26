import { tool } from "ai";
import { z } from "zod";

import { getAgentRuntimeContext } from "@/lib/agent-runtime/context";
import {
  buildSubagentSummaryLines,
  SUBAGENT_REGISTRY,
} from "@/lib/agent-runtime/subagents/definitions";
import { runSubagent } from "@/lib/agent-runtime/subagents/run-subagent";
import {
  SUBAGENT_TYPES,
  type HyperlocaliseSubagentType,
} from "@/lib/agent-runtime/subagents/types";
import { SUBAGENT_STEP_LIMIT } from "@/lib/agent-runtime/subagents/constants";

const subagentTypeSchema = z.enum(SUBAGENT_TYPES);

const taskOutputSchema = z.object({
  success: z.boolean(),
  subagentType: subagentTypeSchema,
  summary: z.string(),
  error: z.string().optional(),
});

export type TaskToolOutput = z.infer<typeof taskOutputSchema>;

export function createTaskTool() {
  const subagentSummaryLines = buildSubagentSummaryLines();
  const taskInputSchema = z.object({
    subagentType: subagentTypeSchema.describe(
      `Specialist to run. Available options:\n${subagentSummaryLines}`,
    ),
    task: z.string().describe("Short description of the work (shown to operators)"),
    instructions: z.string().describe(
      `Detailed instructions for the specialist. Include:
- Goal and deliverables
- Constraints (locales, file IDs, quoted strings to search)
- How to verify success`,
    ),
  });

  return tool({
    description: `Delegate work to a Hyperlocalise specialist subagent.

AVAILABLE SPECIALISTS:
${subagentSummaryLines}

WHEN TO USE:
- Translation requests with attached files → \`translation\`
- Finding localized copy in GitHub → \`repository\`
- Any work that matches a specialist description above

WHEN NOT TO USE:
- Simple questions you can answer without tools
- Requests that need a specialist that is unavailable (explain what is missing instead)

BEHAVIOR:
- Specialists run autonomously for up to ${SUBAGENT_STEP_LIMIT} tool steps
- They return only a summary — relay that summary to the user
- Be explicit in instructions; specialists cannot ask clarifying questions`,
    inputSchema: taskInputSchema,
    outputSchema: taskOutputSchema,
    execute: async ({ subagentType, task, instructions }, { experimental_context }) => {
      const runtime = getAgentRuntimeContext(experimental_context);
      const entry = SUBAGENT_REGISTRY[subagentType as HyperlocaliseSubagentType];

      if (!entry.isAvailable(runtime)) {
        return {
          success: false,
          subagentType,
          summary: entry.unavailableMessage(runtime),
          error: "subagent_unavailable",
        };
      }

      const result = await runSubagent(subagentType, {
        toolContext: runtime.toolContext,
        task,
        instructions,
      });

      return {
        success: true,
        subagentType,
        summary: result.text.trim() || "Specialist completed the task.",
      };
    },
  });
}
