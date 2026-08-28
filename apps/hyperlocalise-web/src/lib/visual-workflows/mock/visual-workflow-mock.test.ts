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

import { visualWorkflowDemoDraft } from "./demo-draft";
import { createDefaultConfig } from "./node-catalog";
import { fromCanonicalDraft, toCanonicalDraft } from "./to-canonical-draft";
import { validateMockWorkflow } from "./validate-mock-workflow";
import { nodeFailsInFakeRun, orderNodesForFakeRun } from "./fake-run";
import type { VisualWorkflowRfEdge, VisualWorkflowRfNode } from "./types";

function node(
  id: string,
  type: VisualWorkflowRfNode["data"]["catalogType"],
  x = 0,
  y = 0,
): VisualWorkflowRfNode {
  return {
    id,
    type,
    position: { x, y },
    data: {
      catalogType: type,
      config: createDefaultConfig(type),
      runStatus: "idle",
    },
  };
}

describe("toCanonicalDraft", () => {
  it("exports schema-versioned nodes, edges, and editor positions", () => {
    const nodes = [node("a", "trigger.manual", 10, 20), node("b", "action.http", 280, 20)];
    const edges: VisualWorkflowRfEdge[] = [
      { id: "e1", source: "a", target: "b", sourceHandle: "out" },
    ];

    const draft = toCanonicalDraft({ name: "Lead ping", nodes, edges });

    expect(draft.schemaVersion).toBe(1);
    expect(draft.name).toBe("Lead ping");
    expect(draft.nodes).toEqual([
      { id: "a", type: "trigger.manual", config: { kind: "trigger.manual" } },
      {
        id: "b",
        type: "action.http",
        config: { kind: "action.http", method: "GET", url: "" },
      },
    ]);
    expect(draft.edges).toEqual([
      { id: "e1", source: "a", target: "b", sourceHandle: "out", targetHandle: null },
    ]);
    expect(draft.editor.positions).toEqual({
      a: { x: 10, y: 20 },
      b: { x: 280, y: 20 },
    });
  });

  it("round-trips through fromCanonicalDraft", () => {
    const original = {
      name: "Round trip",
      nodes: [node("a", "logic.if", 8, 16)],
      edges: [] as VisualWorkflowRfEdge[],
    };
    const restored = fromCanonicalDraft(toCanonicalDraft(original));
    expect(restored.name).toBe("Round trip");
    expect(restored.nodes[0]?.id).toBe("a");
    expect(restored.nodes[0]?.data.catalogType).toBe("logic.if");
    expect(restored.nodes[0]?.position).toEqual({ x: 8, y: 16 });
  });
});

describe("validateMockWorkflow", () => {
  it("reports a missing trigger on an empty canvas", () => {
    expect(validateMockWorkflow([], [])).toEqual([{ code: "missing_trigger" }]);
  });

  it("reports orphan action nodes and multiple triggers", () => {
    const issues = validateMockWorkflow(
      [node("t1", "trigger.manual"), node("t2", "trigger.manual"), node("http", "action.http")],
      [],
    );
    expect(issues.map((issue) => issue.code)).toEqual(["multiple_triggers", "orphan_node"]);
  });

  it("accepts the shipped sample graph", () => {
    expect(
      validateMockWorkflow(visualWorkflowDemoDraft.nodes, visualWorkflowDemoDraft.edges),
    ).toEqual([]);
    expect(visualWorkflowDemoDraft.name).toBe("Lead ping");
  });

  it("accepts a connected trigger to http graph", () => {
    expect(
      validateMockWorkflow(
        [node("t", "trigger.manual"), node("h", "action.http")],
        [{ id: "e", source: "t", target: "h" }],
      ),
    ).toEqual([]);
  });

  it("reports a self-looped action that is not reachable from the trigger", () => {
    const issues = validateMockWorkflow(
      [node("t", "trigger.manual"), node("h", "action.http")],
      [{ id: "loop", source: "h", target: "h" }],
    );
    expect(issues).toEqual([{ code: "orphan_node", nodeId: "h" }]);
  });
});

describe("fake-run ordering", () => {
  it("walks trigger then branches then remaining nodes", () => {
    const nodes = [
      node("t", "trigger.manual"),
      node("h", "action.http"),
      node("iff", "logic.if"),
      node("ok", "ai.agent"),
    ];
    const edges: VisualWorkflowRfEdge[] = [
      { id: "e1", source: "t", target: "h" },
      { id: "e2", source: "h", target: "iff" },
      { id: "e3", source: "iff", target: "ok", sourceHandle: "true" },
    ];
    expect(orderNodesForFakeRun(nodes, edges)).toEqual(["t", "h", "iff", "ok"]);
  });

  it("fails http nodes without a URL", () => {
    const http = node("h", "action.http");
    expect(nodeFailsInFakeRun(http)).toBe(true);
    http.data.config = { kind: "action.http", method: "GET", url: "https://example.test" };
    expect(nodeFailsInFakeRun(http)).toBe(false);
  });
});
