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
import type { VisualWorkflowRfEdge } from "../schema/types";

/**
 * Whether an execution wire is attached to a handle. A wire saved before ports had ids names no
 * handle, and attaches to the step's main output or its input.
 */
export function isExecutionHandleConnected(
  edges: readonly VisualWorkflowRfEdge[],
  nodeId: string,
  type: "source" | "target",
  handleId: string,
): boolean {
  return edges.some((edge) => {
    if (edge.data?.kind === "data") {
      return false;
    }
    return type === "source"
      ? edge.source === nodeId && (edge.sourceHandle ?? "success") === handleId
      : edge.target === nodeId && (edge.targetHandle ?? "input") === handleId;
  });
}
