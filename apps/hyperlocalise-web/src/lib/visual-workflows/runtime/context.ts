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
export type VisualWorkflowExecutionContext = {
  trigger: Record<string, unknown>;
  nodes: Record<string, Record<string, unknown>>;
};

export function createVisualWorkflowExecutionContext(input: {
  triggerInput?: Record<string, unknown>;
}): VisualWorkflowExecutionContext {
  return {
    trigger: {
      ...input.triggerInput,
      triggeredAt: new Date().toISOString(),
    },
    nodes: {},
  };
}

export function setNodeOutput(
  context: VisualWorkflowExecutionContext,
  nodeId: string,
  output: Record<string, unknown>,
) {
  context.nodes[nodeId] = output;
}
