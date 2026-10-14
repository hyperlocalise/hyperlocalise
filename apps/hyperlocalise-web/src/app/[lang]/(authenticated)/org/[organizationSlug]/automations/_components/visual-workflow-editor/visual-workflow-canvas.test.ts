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
import type {
  VisualWorkflowRfEdge,
  VisualWorkflowRfNode,
} from "@/lib/visual-workflows/schema/types";
import { presentVisualWorkflowEdges, visualWorkflowViewCenter } from "./visual-workflow-canvas";

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

function executionEdge(
  id: string,
  source: string,
  target: string,
  sourceHandle = "success",
): VisualWorkflowRfEdge {
  return {
    id,
    source,
    target,
    sourceHandle,
    targetHandle: "input",
    data: {
      kind: "execution",
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

describe("presentVisualWorkflowEdges", () => {
  it("visually distinguishes Each item and Done regions", () => {
    const loopNodes = [
      node("trigger", "trigger.manual"),
      node("loop", "logic.for_each"),
      node("body", "logic.set"),
      node("body-end", "logic.set"),
      node("after", "logic.set"),
      node("summary", "logic.set"),
    ];

    const edges = [
      executionEdge("trigger-loop", "trigger", "loop"),
      executionEdge("loop-body", "loop", "body", "each"),
      executionEdge("body-end", "body", "body-end"),
      executionEdge("loop-after", "loop", "after", "done"),
      executionEdge("after-summary", "after", "summary"),
    ];

    const presented = presentVisualWorkflowEdges(loopNodes, edges);

    expect(presented.find((edge) => edge.id === "loop-body")?.style).toMatchObject({
      stroke: "var(--primary)",
      strokeWidth: 2,
    });

    expect(presented.find((edge) => edge.id === "body-end")?.style).toMatchObject({
      stroke: "var(--primary)",
      strokeWidth: 2,
    });

    expect(presented.find((edge) => edge.id === "loop-after")?.style).toMatchObject({
      stroke: "var(--muted-foreground)",
      strokeWidth: 2,
    });

    expect(presented.find((edge) => edge.id === "after-summary")?.style).toMatchObject({
      stroke: "var(--muted-foreground)",
      strokeWidth: 2,
    });

    // The way the workflow runs is read from the handles, so execution edges carry no arrowhead.
    expect(presented.every((edge) => edge.markerEnd === undefined)).toBe(true);
  });

  it("outlines a label's letters in the canvas colour instead of boxing them", () => {
    const presented = presentVisualWorkflowEdges(
      [node("branch", "logic.if"), node("slack", "action.notify_slack")],
      [{ ...executionEdge("branch-slack", "branch", "slack", "false"), label: "false" }],
    );

    expect(presented[0]).toMatchObject({
      label: "false",
      labelShowBg: false,
      labelStyle: { paintOrder: "stroke", stroke: "var(--sidebar)" },
    });
  });

  it("keeps data edges visually distinct from loop execution regions", () => {
    const loopNodes = [node("loop", "logic.for_each"), node("body", "logic.set")];

    const edges: VisualWorkflowRfEdge[] = [
      executionEdge("loop-body", "loop", "body", "each"),
      {
        id: "loop-body-data",
        source: "loop",
        target: "body",
        sourceHandle: "item",
        targetHandle: "value",
        data: {
          kind: "data",
        },
      },
    ];

    const presented = presentVisualWorkflowEdges(loopNodes, edges);
    const data = presented.find((edge) => edge.id === "loop-body-data");

    expect(data).toMatchObject({
      label: "item → value",
      labelShowBg: false,
      style: {
        strokeDasharray: "5 4",
      },
      markerEnd: { type: "arrowclosed" },
    });
  });
});

describe("visualWorkflowViewCenter", () => {
  const reactFlow = {
    // A view panned by 100 and 50 at half zoom.
    screenToFlowPosition: ({ x, y }: { x: number; y: number }) => ({
      x: (x - 100) / 0.5,
      y: (y - 50) / 0.5,
    }),
  };

  it("gives the canvas position under the middle of the canvas's box", () => {
    expect(
      visualWorkflowViewCenter(reactFlow, { left: 300, top: 150, width: 800, height: 400 }),
    ).toEqual({ x: 1200, y: 600 });
  });

  it("gives nothing before the canvas is ready or while it has no size", () => {
    expect(visualWorkflowViewCenter(null, { left: 0, top: 0, width: 800, height: 400 })).toBeNull();
    expect(visualWorkflowViewCenter(reactFlow, undefined)).toBeNull();
    expect(
      visualWorkflowViewCenter(reactFlow, { left: 0, top: 0, width: 0, height: 0 }),
    ).toBeNull();
  });
});
