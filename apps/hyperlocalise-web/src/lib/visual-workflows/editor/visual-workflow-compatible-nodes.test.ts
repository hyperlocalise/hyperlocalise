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
  listCompatibleVisualWorkflowNodeTypes,
  listSpliceCompatibleVisualWorkflowNodeTypes,
} from "./visual-workflow-compatible-nodes";

function node(id: string, type: VisualWorkflowRfNode["data"]["catalogType"]): VisualWorkflowRfNode {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data: { catalogType: type, config: createDefaultConfig(type), runStatus: "idle" },
  };
}

describe("listCompatibleVisualWorkflowNodeTypes", () => {
  it("offers actions after an execution output, not another trigger", () => {
    const types = listCompatibleVisualWorkflowNodeTypes({
      nodes: [node("trigger", "trigger.manual")],
      edges: [],
      from: { nodeId: "trigger", handleId: "success", handleType: "source" },
    });

    expect(types).toContain("action.http");
    expect(types).toContain("logic.if");
    expect(types).not.toContain("trigger.scheduled");
  });

  it("offers nodes with a data input after an HTTP body pin", () => {
    const types = listCompatibleVisualWorkflowNodeTypes({
      nodes: [node("http", "action.http")],
      edges: [],
      from: {
        nodeId: "http",
        handleId: canvasDataHandleId("body"),
        handleType: "source",
      },
    });

    expect(types).toContain("action.notify_slack");
    expect(types).not.toContain("trigger.manual");
  });

  it("does not offer a terminal node as a splice", () => {
    const types = listSpliceCompatibleVisualWorkflowNodeTypes();
    expect(types).toContain("action.http");
    expect(types).not.toContain("flow.stop");
    expect(types).not.toContain("trigger.manual");
  });
});

describe("listCompatibleVisualWorkflowNodeTypes reverse", () => {
  it("offers a step that can feed an execution input", () => {
    const http = node("http", "action.http");
    const types = listCompatibleVisualWorkflowNodeTypes({
      nodes: [http],
      edges: [] as VisualWorkflowRfEdge[],
      from: { nodeId: "http", handleId: "input", handleType: "target" },
    });

    expect(types).toContain("action.notify_slack");
    expect(types).not.toContain("flow.stop");
  });
});
