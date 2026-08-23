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
import { isStepCount, ToolLoopAgent, type ToolSet } from "ai";

import type { ToolContext } from "@/lib/agent-contracts/tool-context";
import type { HyperlocaliseAgentRuntimeContext } from "@/lib/agent-runtime/context";
import {
  hyperlocaliseAgentMaxOutputTokens,
  hyperlocaliseAgentStepLimit,
  prepareConversationSkillStep,
} from "@/lib/agent-runtime/loops/hyperlocalise-agent";
import { buildConversationSkillInstructions } from "@/lib/agent-runtime/skills/compose-conversation-skill-instructions";
import {
  buildConversationSkillPlan,
  buildConversationSkillTools,
} from "@/lib/agent-runtime/skills/conversation-skill-registry";
import { DEFAULT_AGENT_TIMEOUT } from "@/lib/agent-runtime/subagents/constants";
import type { OrganizationMembershipRole } from "@/lib/database/types";
import {
  getAgentProviderOptions,
  hyperlocaliseManagedGatewayModelId,
} from "@/lib/providers/language-model";

/**
 * Model under evaluation. A Vercel AI Gateway model id so the eval lane can
 * matrix over candidates: `EVAL_MODEL=anthropic/claude-sonnet-4.5 vp run test:eval`.
 */
export const evalModel = process.env.EVAL_MODEL ?? hyperlocaliseManagedGatewayModelId;

/** Skip live suites gracefully when no gateway credential is configured. */
export const hasEvalCredentials = Boolean(
  process.env.AI_GATEWAY_API_KEY ?? process.env.VERCEL_OIDC_TOKEN,
);

export type EvalToolFixture = (input: unknown) => unknown;

export type EvalScenario = {
  /** Flags that drive skill activation and tool gating — the axis most evals vary. */
  runtime?: {
    hasFileAttachments?: boolean;
    hasTmsIntegration?: boolean;
    additionalInstructions?: string;
    membershipRole?: OrganizationMembershipRole;
    projectId?: string | null;
    sandboxId?: string | null;
    glossarySearchEnabled?: boolean;
    knowledgeMemoryEnabled?: boolean;
  };
  /**
   * Canned tool results keyed by tool name. Unlisted tools return a generic
   * empty result. Fixtures should match the tool's output schema so the model
   * behaves as it would in production (schema validation itself is disabled).
   */
  toolFixtures?: Record<string, EvalToolFixture>;
};

export type EvalToolCall = {
  name: string;
  input: unknown;
};

export type EvalTurnResult = {
  text: string;
  steps: number;
  toolCalls: EvalToolCall[];
  toolNames: string[];
};

/**
 * Request-scoped runtime with the same shape production builds in
 * `prepareConversationAgentTurn`, but hermetic: no database handle. Safe
 * because every tool `execute` is replaced with a fixture before any tool
 * can touch `toolContext.db`.
 */
export function buildEvalRuntime(scenario: EvalScenario): HyperlocaliseAgentRuntimeContext {
  const runtime = scenario.runtime ?? {};

  const toolContext: ToolContext = {
    conversationId: "conversation-eval",
    organizationId: "org-eval",
    localUserId: "user-eval",
    membershipRole: runtime.membershipRole ?? "admin",
    projectId: runtime.projectId ?? null,
    sandboxId: runtime.sandboxId ?? null,
    knowledgeMemoryEnabled: runtime.knowledgeMemoryEnabled ?? false,
    glossarySearchEnabled: runtime.glossarySearchEnabled ?? false,
    db: null as unknown as ToolContext["db"],
  };

  return {
    surface: "web",
    toolContext,
    hasFileAttachments: runtime.hasFileAttachments ?? false,
    hasTmsIntegration: runtime.hasTmsIntegration ?? false,
    additionalInstructions: runtime.additionalInstructions,
  };
}

function stubToolSet(realTools: ToolSet, fixtures: Record<string, EvalToolFixture>): ToolSet {
  return Object.fromEntries(
    Object.entries(realTools).map(([toolName, realTool]) => {
      // Keep the inputSchema and description the model reasons over; drop the
      // outputSchema so fixture results are never rejected by validation.
      const { outputSchema: _outputSchema, ...toolWithoutOutputSchema } = realTool;
      return [
        toolName,
        {
          ...toolWithoutOutputSchema,
          execute: async (input: unknown) =>
            fixtures[toolName]?.(input) ?? { success: true, note: "No results (eval fixture)." },
        },
      ];
    }),
  );
}

/**
 * Build the conversation agent from the production parts — real skill plan,
 * real composed instructions, real tool schemas — with fixture tool results.
 *
 * Mirrors the assembly in
 * `@/lib/agent-runtime/loops/conversation-skill-agent.ts`; keep the two in
 * sync when the production assembly changes.
 */
export function createEvalConversationAgent(scenario: EvalScenario) {
  const runtime = buildEvalRuntime(scenario);
  const skillPlan = buildConversationSkillPlan(runtime);
  const tools = stubToolSet(
    buildConversationSkillTools(runtime, skillPlan.toolNames),
    scenario.toolFixtures ?? {},
  );

  return new ToolLoopAgent<never, ToolSet>({
    model: evalModel,
    instructions: buildConversationSkillInstructions({
      surface: runtime.surface,
      projectId: runtime.toolContext.projectId,
      skillPlan,
      attachedProject: runtime.attachedProject,
      glossarySearchEnabled: runtime.toolContext.glossarySearchEnabled === true,
      additionalInstructions: runtime.additionalInstructions,
    }),
    tools,
    activeTools: Object.keys(tools),
    providerOptions: getAgentProviderOptions("gateway"),
    runtimeContext: runtime,
    maxOutputTokens: hyperlocaliseAgentMaxOutputTokens,
    timeout: DEFAULT_AGENT_TIMEOUT,
    stopWhen: isStepCount(hyperlocaliseAgentStepLimit),
    prepareStep: prepareConversationSkillStep,
  });
}

/** Run one user turn against the eval agent and flatten the trajectory. */
export async function runEvalTurn(
  scenario: EvalScenario,
  userMessage: string,
): Promise<EvalTurnResult> {
  const agent = createEvalConversationAgent(scenario);
  const result = await agent.generate({
    messages: [{ role: "user", content: userMessage }],
  });

  const toolCalls = result.steps.flatMap((step) =>
    step.toolCalls.map((call) => ({ name: call.toolName, input: call.input as unknown })),
  );

  return {
    text: result.text,
    steps: result.steps.length,
    toolCalls,
    toolNames: toolCalls.map((call) => call.name),
  };
}
