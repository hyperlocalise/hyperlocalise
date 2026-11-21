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

import { createDefaultConfig } from "../catalog/node-catalog";
import type { VisualWorkflowRfEdge, VisualWorkflowRfNode } from "../schema/types";
import { canvasDataHandleId } from "./canvas-handle-ids";
import {
  connectNewVisualWorkflowNode,
  duplicateVisualWorkflowSelection,
  pasteVisualWorkflowClipboard,
} from "./visual-workflow-add-node";
import { nextVisualWorkflowNodeId } from "./visual-workflow-node-id";

function node(id: string, type: VisualWorkflowRfNode["data"]["catalogType"]): VisualWorkflowRfNode {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data: { catalogType: type, config: createDefaultConfig(type), runStatus: "idle" },
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
    data: { kind: "execution" },
  };
}

describe("connectNewVisualWorkflowNode", () => {
  it("wires an execution output to the new step", () => {
    const trigger = node("trigger", "trigger.manual");
    const http = node("http", "action.http");
    const { edges } = connectNewVisualWorkflowNode([trigger, http], [], "http", {
      from: { nodeId: "trigger", handleId: "success", handleType: "source" },
    });

    expect(edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "trigger",
          target: "http",
          sourceHandle: "success",
          targetHandle: "input",
          data: { kind: "execution" },
        }),
      ]),
    );
  });

  it("adds an execution wire and a data wire when dropped from a data pin", () => {
    const http = node("http", "action.http");
    const slack = node("slack", "action.notify_slack");
    const { edges } = connectNewVisualWorkflowNode([http, slack], [], "slack", {
      from: {
        nodeId: "http",
        handleId: canvasDataHandleId("body"),
        handleType: "source",
      },
    });

    expect(edges.some((edge) => edge.data?.kind === "execution" && edge.target === "slack")).toBe(
      true,
    );
    expect(
      edges.some(
        (edge) =>
          edge.data?.kind === "data" &&
          edge.source === "http" &&
          edge.target === "slack" &&
          edge.sourceHandle === "body",
      ),
    ).toBe(true);
  });

  it("splices a step onto an execution wire", () => {
    const trigger = node("trigger", "trigger.manual");
    const slack = node("slack", "action.notify_slack");
    const http = node("http", "action.http");
    const original = executionEdge("e1", "trigger", "slack");
    const { edges } = connectNewVisualWorkflowNode([trigger, slack, http], [original], "http", {
      spliceEdgeId: "e1",
    });

    expect(edges.some((edge) => edge.id === "e1")).toBe(false);
    expect(edges.some((edge) => edge.source === "trigger" && edge.target === "http")).toBe(true);
    expect(edges.some((edge) => edge.source === "http" && edge.target === "slack")).toBe(true);
  });
});

describe("duplicateVisualWorkflowSelection", () => {
  it("pastes selected steps beside the originals with remapped wires", () => {
    const trigger = { ...node("trigger", "trigger.manual"), selected: true };
    const http = { ...node("http", "action.http"), selected: true, position: { x: 300, y: 0 } };
    const slack = node("slack", "action.notify_slack");
    const result = duplicateVisualWorkflowSelection({
      nodes: [trigger, http, slack],
      edges: [executionEdge("e1", "trigger", "http"), executionEdge("e2", "http", "slack")],
      selectedIds: new Set(["trigger", "http"]),
      nextId: (type, taken) => nextVisualWorkflowNodeId(type, taken),
    });

    expect(result.pastedIds).toEqual(["manual", "http_2"]);
    expect(result.nodes.find((item) => item.id === "manual")?.position).toEqual({
      x: 48,
      y: 48,
    });
    expect(result.edges.some((edge) => edge.source === "manual" && edge.target === "http_2")).toBe(
      true,
    );
    expect(result.edges.some((edge) => edge.source === "http_2" && edge.target === "slack")).toBe(
      false,
    );
  });

  it("pastes a copied subgraph without removing the originals", () => {
    const trigger = node("trigger", "trigger.manual");
    const http = node("http", "action.http");
    const result = pasteVisualWorkflowClipboard({
      nodes: [trigger, http],
      edges: [executionEdge("e1", "trigger", "http")],
      clipboard: {
        nodes: [http],
        edges: [],
      },
      nextId: (type, taken) => nextVisualWorkflowNodeId(type, taken),
    });

    expect(result.nodes.map((item) => item.id).toSorted()).toEqual(["http", "http_2", "trigger"]);
    expect(result.pastedIds).toEqual(["http_2"]);
  });
});
