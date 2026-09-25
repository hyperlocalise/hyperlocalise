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
import type { Connection } from "@xyflow/react";

import { computeForEachBodyNodeIds } from "../editor/for-each-body-membership";
import { toVisualWorkflowV3Definition } from "../schema/serializers";
import type { VisualWorkflowRfEdge, VisualWorkflowRfNode } from "../schema/types";
import { compileVisualWorkflowV3Definition } from "./compile-workflow-v3";

const CANDIDATE_EDGE_ID = "__connection_candidate__";

export type ConnectionValidationCode =
  | "missing_endpoint"
  | "self_connection"
  | "invalid_source_port"
  | "invalid_target_port"
  | "incompatible_data_types"
  | "target_already_connected"
  | "invalid_data_source"
  | "execution_cycle"
  | "loop_boundary";

export type ConnectionValidationResult =
  | {
      valid: true;
      edgeKind: "execution" | "data";
      sourcePortId: string;
      targetPortId: string;
    }
  | {
      valid: false;
      code: ConnectionValidationCode;
      sourcePortId: string | null;
      targetPortId: string | null;
      message: string;
    };

export type VisualWorkflowConnection = Omit<Connection, "source" | "target"> & {
  source: string | null;
  target: string | null;
};

function invalidResult(
  code: ConnectionValidationCode,
  sourcePortId: string | null,
  targetPortId: string | null,
  message: string,
): ConnectionValidationResult {
  return {
    valid: false,
    code,
    sourcePortId,
    targetPortId,
    message,
  };
}

export function validateVisualWorkflowConnection(input: {
  nodes: readonly VisualWorkflowRfNode[];
  edges: readonly VisualWorkflowRfEdge[];
  connection: VisualWorkflowConnection;
  replacingEdgeId?: string;
}): ConnectionValidationResult {
  const { connection, nodes } = input;
  const sourcePortId = connection.sourceHandle ?? null;
  const targetPortId = connection.targetHandle ?? null;

  if (!connection.source || !connection.target) {
    return invalidResult(
      "missing_endpoint",
      sourcePortId,
      targetPortId,
      "The connection must have both a source and a target.",
    );
  }

  if (connection.source === connection.target) {
    return invalidResult(
      "self_connection",
      sourcePortId,
      targetPortId,
      "A node cannot be connected to itself.",
    );
  }

  const sourceNode = nodes.find((node) => node.id === connection.source);
  const targetNode = nodes.find((node) => node.id === connection.target);

  if (!sourceNode || !targetNode) {
    return invalidResult(
      "missing_endpoint",
      sourcePortId,
      targetPortId,
      "The source or target node no longer exists.",
    );
  }

  const edgeKind = targetPortId !== null && targetPortId !== "input" ? "data" : "execution";

  const normalizedSourcePortId =
    edgeKind === "execution" ? (sourcePortId ?? "success") : sourcePortId;

  const normalizedTargetPortId = edgeKind === "execution" ? "input" : targetPortId;

  if (!normalizedSourcePortId) {
    return invalidResult(
      "invalid_source_port",
      sourcePortId,
      normalizedTargetPortId,
      "The connection does not identify a source port.",
    );
  }

  if (!normalizedTargetPortId) {
    return invalidResult(
      "invalid_target_port",
      normalizedSourcePortId,
      targetPortId,
      "The connection does not identify a target port.",
    );
  }

  const existingEdges = input.edges.filter((edge) => edge.id !== input.replacingEdgeId);

  if (edgeKind === "execution") {
    const bodyNodeIdsByLoopId = new Map(
      nodes
        .filter((node) => node.data.catalogType === "logic.for_each")
        .map((node) => [node.id, computeForEachBodyNodeIds(node.id, existingEdges)]),
    );

    const sourceLoopOwner = nodes.find(
      (node) =>
        node.data.catalogType === "logic.for_each" &&
        bodyNodeIdsByLoopId.get(node.id)?.includes(connection.source!),
    );

    const targetLoopOwner = nodes.find(
      (node) =>
        node.data.catalogType === "logic.for_each" &&
        bodyNodeIdsByLoopId.get(node.id)?.includes(connection.target!),
    );

    const entersTargetLoopThroughEach =
      targetLoopOwner?.id === connection.source && normalizedSourcePortId === "each";

    const staysInsideSameLoop =
      sourceLoopOwner !== undefined && sourceLoopOwner.id === targetLoopOwner?.id;

    if (targetLoopOwner && !entersTargetLoopThroughEach && !staysInsideSameLoop) {
      return invalidResult(
        "loop_boundary",
        normalizedSourcePortId,
        normalizedTargetPortId,
        `Connection from "${normalizedSourcePortId}" to "${normalizedTargetPortId}" cannot enter a For Each body from outside its loop.`,
      );
    }

    if (sourceLoopOwner && connection.target === sourceLoopOwner.id) {
      return invalidResult(
        "loop_boundary",
        normalizedSourcePortId,
        normalizedTargetPortId,
        `Connection from "${normalizedSourcePortId}" to "${normalizedTargetPortId}" cannot point back to its owning For Each node.`,
      );
    }

    const createsNestedLoop =
      targetNode.data.catalogType === "logic.for_each" &&
      (sourceLoopOwner !== undefined ||
        (sourceNode.data.catalogType === "logic.for_each" && normalizedSourcePortId === "each"));

    if (createsNestedLoop) {
      return invalidResult(
        "loop_boundary",
        normalizedSourcePortId,
        normalizedTargetPortId,
        "Nested For Each loop regions are not supported.",
      );
    }
  }

  const candidateEdge: VisualWorkflowRfEdge = {
    id: CANDIDATE_EDGE_ID,
    source: connection.source,
    target: connection.target,
    sourceHandle: normalizedSourcePortId,
    targetHandle: normalizedTargetPortId,
    data: {
      kind: edgeKind,
    },
  };

  const baselineDefinition = toVisualWorkflowV3Definition({
    name: "Connection validation",
    nodes: [...nodes],
    edges: existingEdges,
  });

  const candidateDefinition = toVisualWorkflowV3Definition({
    name: "Connection validation",
    nodes: [...nodes],
    edges: [...existingEdges, candidateEdge],
  });

  const baselineResult = compileVisualWorkflowV3Definition(baselineDefinition);
  const candidateResult = compileVisualWorkflowV3Definition(candidateDefinition);

  const candidateIssue = candidateResult.issues.find((issue) => issue.edgeId === CANDIDATE_EDGE_ID);

  if (candidateIssue) {
    switch (candidateIssue.code) {
      case "invalid_source_port":
        return invalidResult(
          "invalid_source_port",
          normalizedSourcePortId,
          normalizedTargetPortId,
          `Source port "${normalizedSourcePortId}" is not valid for this connection.`,
        );

      case "invalid_target_port":
        return invalidResult(
          "invalid_target_port",
          normalizedSourcePortId,
          normalizedTargetPortId,
          `Target port "${normalizedTargetPortId}" is not valid for this connection.`,
        );

      case "incompatible_data_types":
        return invalidResult(
          "incompatible_data_types",
          normalizedSourcePortId,
          normalizedTargetPortId,
          `Source port "${normalizedSourcePortId}" is not compatible with target port "${normalizedTargetPortId}".`,
        );

      case "conflicting_data_input":
        return invalidResult(
          "target_already_connected",
          normalizedSourcePortId,
          normalizedTargetPortId,
          `Target port "${normalizedTargetPortId}" already has a data source.`,
        );

      default:
        return invalidResult(
          "missing_endpoint",
          normalizedSourcePortId,
          normalizedTargetPortId,
          "The connection references an invalid node.",
        );
    }
  }

  if (edgeKind === "data") {
    const executionAncestors = new Set<string>();
    const queue = [connection.target];

    while (queue.length > 0) {
      const current = queue.shift()!;

      for (const edge of existingEdges) {
        if (edge.data?.kind === "data" || edge.target !== current) {
          continue;
        }

        if (!executionAncestors.has(edge.source)) {
          executionAncestors.add(edge.source);
          queue.push(edge.source);
        }
      }
    }

    if (!executionAncestors.has(connection.source)) {
      return invalidResult(
        "invalid_data_source",
        normalizedSourcePortId,
        normalizedTargetPortId,
        `Source port "${normalizedSourcePortId}" must belong to an execution ancestor of target port "${normalizedTargetPortId}".`,
      );
    }
  }

  const baselineHasExecutionCycle = baselineResult.issues.some(
    (issue) => issue.code === "execution_cycle",
  );
  const candidateHasExecutionCycle = candidateResult.issues.some(
    (issue) => issue.code === "execution_cycle",
  );

  if (!baselineHasExecutionCycle && candidateHasExecutionCycle) {
    return invalidResult(
      "execution_cycle",
      normalizedSourcePortId,
      normalizedTargetPortId,
      `Connecting "${normalizedSourcePortId}" to "${normalizedTargetPortId}" would create an execution cycle.`,
    );
  }

  return {
    valid: true,
    edgeKind,
    sourcePortId: normalizedSourcePortId,
    targetPortId: normalizedTargetPortId,
  };
}
