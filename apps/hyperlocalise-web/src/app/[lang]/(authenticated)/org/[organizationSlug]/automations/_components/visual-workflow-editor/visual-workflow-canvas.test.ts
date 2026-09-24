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
import { describe, expect, it } from "vite-plus/test";

import { createDefaultConfig } from "@/lib/visual-workflows/catalog/node-catalog";
import { applyVisualWorkflowGraphConnection } from "@/lib/visual-workflows/editor/visual-workflow-editor-graph";
import type { VisualWorkflowRfNode } from "@/lib/visual-workflows/schema/types";

function node(id: string, type: VisualWorkflowRfNode["data"]["catalogType"]): VisualWorkflowRfNode {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data: {
      catalogType: type,
      config: createDefaultConfig(type),
      runStatus: "idle",
    },
  };
}

const nodes = [node("trigger", "trigger.manual"), node("request", "action.http")];

describe("applyVisualWorkflowGraphConnection edge kinds", () => {
  it("creates an execution edge for execution ports", () => {
    const {
      edges: [edge],
    } = applyVisualWorkflowGraphConnection(nodes, [], {
      source: "trigger",
      target: "request",
      sourceHandle: "success",
      targetHandle: "input",
    });

    expect(edge).toMatchObject({
      sourceHandle: "success",
      targetHandle: "input",
      data: { kind: "execution" },
    });
  });

  it("normalizes omitted execution handles to stable port IDs", () => {
    const {
      edges: [edge],
    } = applyVisualWorkflowGraphConnection(nodes, [], {
      source: "trigger",
      target: "request",
      sourceHandle: null,
      targetHandle: null,
    });

    expect(edge).toMatchObject({
      sourceHandle: "success",
      targetHandle: "input",
      data: { kind: "execution" },
    });
  });

  it("creates a data edge and keeps its stable port IDs", () => {
    const executionGraph = applyVisualWorkflowGraphConnection(nodes, [], {
      source: "trigger",
      target: "request",
      sourceHandle: "success",
      targetHandle: "input",
    });

    const { edges } = applyVisualWorkflowGraphConnection(nodes, executionGraph.edges, {
      source: "trigger",
      target: "request",
      sourceHandle: "triggeredAt",
      targetHandle: "url",
    });
    const edge = edges.find((candidate) => candidate.data?.kind === "data");

    expect(edge).toMatchObject({
      sourceHandle: "triggeredAt",
      targetHandle: "url",
      data: { kind: "data" },
      label: "triggeredAt → url",
      style: { strokeDasharray: "5 4" },
    });
  });
});
