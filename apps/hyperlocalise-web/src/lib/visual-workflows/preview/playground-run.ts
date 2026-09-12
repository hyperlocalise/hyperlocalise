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
import { createMockWorkflowExecutor } from "../runtime/mock-executor";
import { runVisualWorkflowInterpreter } from "../runtime/interpreter";
import { redactWorkflowSnapshot, collectWorkflowSecrets } from "../runtime/snapshots";
const PLAYGROUND_ORGANIZATION_ID = "00000000-0000-4000-8000-000000000099";

export async function runPlaygroundWorkflow(options: {
  name: string;
  triggerInput?: Record<string, unknown>;
  mockOutputs?: Record<string, Record<string, unknown>>;
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
      ...options.triggerInput,
      playground: true,
      triggeredAt: new Date().toISOString(),
    },
    signal: options.signal,
    executeNode: createMockWorkflowExecutor(options.mockOutputs),
    onNodeUpdate: async (update) => {
      if (options.signal?.aborted) {
        return;
      }

      options.onStatus(update.nodeId, update.status);
      const secrets = collectWorkflowSecrets(options.triggerInput);
      options.onOutput?.(
        update.nodeId,
        redactWorkflowSnapshot(update.outputSnapshot ?? null, secrets) as Record<
          string,
          unknown
        > | null,
        redactWorkflowSnapshot(update.error ?? null, secrets) as Record<string, unknown> | null,
      );
    },
  });

  if (options.signal?.aborted) {
    return "aborted";
  }

  return result.ok ? "completed" : "failed";
}
