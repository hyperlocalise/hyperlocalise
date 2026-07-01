import { tool } from "ai";
import { z } from "zod";

import {
  formatAgentRuntimeContextError,
  resolveAgentRuntimeContext,
} from "@/lib/agent-runtime/context";
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
import { fromThrowableAsync, isErr } from "@/lib/primitives/result/results";

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
      `Agent to run. Available options:\n${subagentSummaryLines}`,
    ),
    task: z.string().describe("Short description of the work (shown to operators)"),
    instructions: z.string().describe(
      `Detailed instructions for the agent. Include:
- Goal and deliverables
- Constraints (locales, file IDs, quoted strings to search)
- How to verify success`,
    ),
  });

  return tool({
    description: `Delegate work to a Hyperlocalise subagent.

AVAILABLE AGENTS:
${subagentSummaryLines}

WHEN TO USE:
- Translation requests with attached files → \`translation\`
- Crowdin or TMS progress/status for projects, files, or strings → \`translation\`
- Finding localization context for source strings, messages, keys, or uploaded-file segments in GitHub → \`repository\`
- Any work that matches an agent description above

WHEN NOT TO USE:
- Simple questions you can answer without tools
- Requests that need an agent that is unavailable (explain what is missing instead)
- General repository architecture summaries, PR fixes, code review, or checks unless an agent explicitly supports them

BEHAVIOR:
- Agents run autonomously for up to ${SUBAGENT_STEP_LIMIT} tool steps
- They return only a summary — relay that summary to the user
- Be explicit in instructions; agents cannot ask clarifying questions`,
    inputSchema: taskInputSchema,
    outputSchema: taskOutputSchema,
    execute: async ({ subagentType, task, instructions }, { experimental_context }) => {
      const runtimeResult = resolveAgentRuntimeContext(experimental_context);
      if (isErr(runtimeResult)) {
        return {
          success: false,
          subagentType,
          summary: "Agent cannot run without request context.",
          error: formatAgentRuntimeContextError(runtimeResult.error),
        };
      }

      const runtime = runtimeResult.value;
      const entry = SUBAGENT_REGISTRY[subagentType as HyperlocaliseSubagentType];

      if (!entry.isAvailable(runtime)) {
        return {
          success: false,
          subagentType,
          summary: entry.unavailableMessage(runtime),
          error: "subagent_unavailable",
        };
      }

      const subagentResult = await fromThrowableAsync(
        runSubagent(subagentType, {
          toolContext: runtime.toolContext,
          task,
          instructions:
            subagentType === "repository"
              ? [
                  instructions,
                  "",
                  "Repository agent handoff requirements:",
                  "- Include the exact source text, key, file path, surrounding text, source locale, target locale, and repo hint when known.",
                  "- Search the exact quoted source text first, preserving capitalization and punctuation.",
                  "- If the exact quoted search has no matches, try the same text case-insensitively before declaring no match.",
                  "- If case-insensitive grep has no useful matches for a short UI label, run fuzzySearch with the same label before declaring no match.",
                  "- For short visible UI labels, menu items, sidebar items, or page headings, search component, route, app shell, sidebar, navigation, and config files before accepting no-match results.",
                  "- For single-word or short-title UI copy, try lowercase route/key variants and nearby navigation labels.",
                  "- Do not return `no match` for a short UI label until you have tried exact, case-insensitive, fuzzySearch, lowercase, route/key, navigation, component, config, and locale/resource searches.",
                  "- Lead with an **Answer** translators can use immediately, then **Source** with `path:line` evidence.",
                  "- Return localization context only: product meaning, tone/register, placeholders, nearby copy, and ambiguities when useful. Omit search logs unless evidence was inferred or no exact match was found.",
                  "- Do not ask for code changes, PR review, checks, or broad architecture analysis.",
                ].join("\n")
              : instructions,
        }),
      );

      if (!isErr(subagentResult)) {
        const result = subagentResult.value;
        return {
          success: true,
          subagentType,
          summary: result.text.trim() || "Agent completed the task.",
        };
      }

      const message =
        subagentResult.error instanceof Error
          ? subagentResult.error.message
          : String(subagentResult.error);
      return {
        success: false,
        subagentType,
        summary: "Agent encountered an error.",
        error: message,
      };
    },
  });
}
