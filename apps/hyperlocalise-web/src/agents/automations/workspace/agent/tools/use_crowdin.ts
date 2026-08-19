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
import { isStepCount, ToolLoopAgent } from "ai";
import { z } from "zod";

import { defineAgentTool } from "@/agents/_runtime/define-agent-tool";
import { getHyperlocaliseAgentModel } from "@/lib/agent-runtime/loops/model";
import {
  SUBAGENT_NO_QUESTIONS_RULES,
  SUBAGENT_RESPONSE_FORMAT,
  WORKFLOW_AGENT_TIMEOUT,
} from "@/lib/agent-runtime/subagents/constants";
import {
  extractGenerateResultTokenUsage,
  withAgentRuntimeUsageMetering,
} from "@/lib/billing/agent-runtime-usage";

import type { WorkspaceOrchestratorSession } from "../context";
import { createCrowdinReviewTools } from "./crowdin-review-tools";

const CROWDIN_TOOL_STEP_LIMIT = 10;

const useCrowdinInputSchema = z.object({
  objective: z
    .string()
    .trim()
    .min(1)
    .max(4000)
    .describe(
      "What Crowdin evidence to gather for translation review: source strings, locales, surrounding context, and the review question.",
    ),
});

export function createUseCrowdinTool(session: WorkspaceOrchestratorSession) {
  return defineAgentTool({
    description:
      "Look up Crowdin glossary, translation memory, style guidance, and translation recommendations for strings under review. Pass source strings, locales, and surrounding context from prior steps.",
    inputSchema: useCrowdinInputSchema,
    execute: async ({ objective }) => {
      const crowdin = session.automation.toolConfig.crowdin;
      const projectId = crowdin?.projectId?.trim();
      if (!crowdin?.enabled || !projectId) {
        throw new Error("crowdin_not_configured");
      }

      const tools = createCrowdinReviewTools({
        organizationId: session.organizationId,
        projectId,
        actorUserId: session.automation.authorUserId,
      });

      const agent = new ToolLoopAgent({
        model: getHyperlocaliseAgentModel(),
        tools,
        instructions: [
          "You are gathering Crowdin evidence for a workspace automation translation review.",
          "Use search_concordance for glossary and translation-memory matches.",
          "Use get_style_guide for project translation context and Crowdin AI style prompts.",
          "Use recommend_translation when the objective asks for suggested wording.",
          "Stay read-only. Do not write translations back to Crowdin.",
          "Return a concise factual summary: matches, style constraints, and any recommended translations with reasoning.",
          SUBAGENT_NO_QUESTIONS_RULES,
          SUBAGENT_RESPONSE_FORMAT,
        ].join("\n"),
        stopWhen: isStepCount(CROWDIN_TOOL_STEP_LIMIT),
        timeout: WORKFLOW_AGENT_TIMEOUT,
      });

      const result = await withAgentRuntimeUsageMetering({
        organizationId: session.organizationId,
        operationKey: `workspace-crowdin:${session.run.id}:agent_runs`,
        source: "workspace_crowdin_agent",
        dimensions: {
          surface: "automation",
          agent_surface: "crowdin",
          project_id: projectId,
        },
        extractTokenUsage: extractGenerateResultTokenUsage,
        run: () =>
          agent.generate({
            messages: [
              {
                role: "user",
                content: [
                  `Objective: ${objective}`,
                  `Crowdin project: ${projectId}`,
                  session.automation.instructions.trim()
                    ? `Automation instructions:\n${session.automation.instructions.trim()}`
                    : null,
                ]
                  .filter((line): line is string => Boolean(line))
                  .join("\n\n"),
              },
            ],
          }),
      });

      const summary = result.text.trim() || "Completed Crowdin review with no textual summary.";
      const payload = {
        summary,
        projectId,
      };
      session.stepResults.use_crowdin = payload;
      return payload;
    },
  });
}
