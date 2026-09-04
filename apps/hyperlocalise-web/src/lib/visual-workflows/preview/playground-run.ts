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
import { toVisualWorkflowDefinition } from "../schema/serializers";
import type {
  MockNodeRunStatus,
  VisualWorkflowRfEdge,
  VisualWorkflowRfNode,
} from "../schema/types";
import { executeLogicVisualWorkflowNode } from "../runtime/execute-logic-node";
import type { VisualWorkflowNodeExecutionResult } from "../runtime/execution-result";
import { runVisualWorkflowInterpreter } from "../runtime/interpreter";
import { resolveVisualWorkflowTemplate } from "../runtime/expressions";
import type { CanonicalVisualWorkflowNode } from "../schema/types";
import type { VisualWorkflowExecutionContext } from "../runtime/context";

const PLAYGROUND_ORGANIZATION_ID = "00000000-0000-4000-8000-000000000099";

async function executePlaygroundVisualWorkflowNode(input: {
  node: CanonicalVisualWorkflowNode;
  context: VisualWorkflowExecutionContext;
  organizationId: string;
}): Promise<VisualWorkflowNodeExecutionResult> {
  const logicResult = executeLogicVisualWorkflowNode({
    node: input.node,
    context: input.context,
  });
  if (logicResult.ok || logicResult.error.code !== "not_logic_node") {
    return logicResult;
  }

  switch (input.node.config.kind) {
    case "action.http": {
      const url = resolveVisualWorkflowTemplate(input.node.config.url, input.context).trim();
      if (!url) {
        return { ok: false, error: { code: "missing_url", message: "HTTP URL is required." } };
      }

      return {
        ok: true,
        output: {
          status: 200,
          statusText: "OK",
          ok: true,
          body: JSON.stringify({ playground: true, url }),
          json: { playground: true, url },
          simulated: true,
        },
      };
    }
    case "action.notify_slack": {
      const channelId = resolveVisualWorkflowTemplate(
        input.node.config.channelId,
        input.context,
      ).trim();
      const message = resolveVisualWorkflowTemplate(
        input.node.config.message,
        input.context,
      ).trim();
      if (!channelId) {
        return {
          ok: false,
          error: { code: "missing_channel", message: "Slack channel ID is required." },
        };
      }
      if (!message) {
        return {
          ok: false,
          error: { code: "missing_message", message: "Slack message is required." },
        };
      }

      return {
        ok: true,
        output: {
          sent: true,
          channelId,
          message,
          simulated: true,
        },
      };
    }
    case "ai.agent": {
      const prompt = resolveVisualWorkflowTemplate(input.node.config.prompt, input.context).trim();
      if (!prompt) {
        return { ok: false, error: { code: "missing_prompt", message: "AI prompt is required." } };
      }

      return {
        ok: true,
        output: {
          text: `Playground response for: ${prompt.slice(0, 120)}`,
          simulated: true,
        },
      };
    }
    default:
      return {
        ok: false,
        error: {
          code: "unsupported_node",
          message: "Unsupported node type.",
        },
      };
  }
}

export async function runPlaygroundWorkflow(options: {
  name: string;
  nodes: readonly VisualWorkflowRfNode[];
  edges: readonly VisualWorkflowRfEdge[];
  signal?: AbortSignal;
  onStatus: (nodeId: string, status: MockNodeRunStatus) => void;
  onOutput?: (
    nodeId: string,
    output: Record<string, unknown> | null,
    error: Record<string, unknown> | null,
  ) => void;
}): Promise<"completed" | "aborted" | "failed"> {
  if (options.signal?.aborted) {
    return "aborted";
  }

  const definition = toVisualWorkflowDefinition({
    name: options.name,
    nodes: [...options.nodes],
    edges: [...options.edges],
  });

  const result = await runVisualWorkflowInterpreter({
    definition,
    organizationId: PLAYGROUND_ORGANIZATION_ID,
    triggerInput: {
      playground: true,
      triggeredAt: new Date().toISOString(),
    },
    executeNode: executePlaygroundVisualWorkflowNode,
    onNodeUpdate: async (update) => {
      if (options.signal?.aborted) {
        return;
      }

      if (update.status === "running") {
        options.onStatus(update.nodeId, "running");
        return;
      }

      if (update.status === "succeeded") {
        options.onStatus(update.nodeId, "succeeded");
        options.onOutput?.(update.nodeId, update.outputSnapshot ?? null, null);
        return;
      }

      if (update.status === "failed") {
        options.onStatus(update.nodeId, "failed");
        options.onOutput?.(update.nodeId, update.outputSnapshot ?? null, update.error ?? null);
      }
    },
  });

  if (options.signal?.aborted) {
    return "aborted";
  }

  return result.ok ? "completed" : "failed";
}
