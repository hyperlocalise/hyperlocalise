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
import {
  applyVisualWorkflowGraphConnection,
  removeVisualWorkflowNode,
} from "./visual-workflow-editor-graph";
import { fromVisualWorkflowDefinition, toVisualWorkflowDefinition } from "../schema/serializers";
import type { VisualWorkflowRfEdge, VisualWorkflowRfNode } from "../schema/types";
import { validateVisualWorkflowDefinition } from "../validation/validate-workflow";

function node(
  id: string,
  type: VisualWorkflowRfNode["data"]["catalogType"],
  extra?: Partial<VisualWorkflowRfNode["data"]>,
): VisualWorkflowRfNode {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data: {
      catalogType: type,
      config: createDefaultConfig(type),
      runStatus: "idle",
      ...extra,
    },
  };
}

function codes(issues: Array<{ code: string }>): string[] {
  return issues.map((issue) => issue.code).toSorted();
}

function definition(
  graph: { nodes: VisualWorkflowRfNode[]; edges: VisualWorkflowRfEdge[] },
  name = "Quick add",
) {
  return toVisualWorkflowDefinition({ name, nodes: graph.nodes, edges: graph.edges });
}

describe("applyVisualWorkflowGraphConnection", () => {
  it("preserves Switch case and default handles", () => {
    const switchNode = node("sw", "logic.switch", {
      config: {
        kind: "logic.switch",
        expression: "status",
        cases: [{ value: "pending" }, { value: "ready" }],
      },
    });
    const first = applyVisualWorkflowGraphConnection(
      [node("t", "trigger.manual"), switchNode, node("a", "logic.set")],
      [{ id: "e0", source: "t", target: "sw" }],
      { source: "sw", target: "a", sourceHandle: "1", targetHandle: null },
    );
    expect(first.edges.at(-1)?.sourceHandle).toBe("1");
    expect(codes(validateVisualWorkflowDefinition(definition(first)))).not.toContain(
      "invalid_handle",
    );

    const withDefault = applyVisualWorkflowGraphConnection(
      [node("t", "trigger.manual"), switchNode, node("b", "logic.set")],
      [{ id: "e0", source: "t", target: "sw" }],
      { source: "sw", target: "b", sourceHandle: "default", targetHandle: null },
    );
    expect(withDefault.edges.at(-1)?.sourceHandle).toBe("default");
    expect(codes(validateVisualWorkflowDefinition(definition(withDefault)))).not.toContain(
      "invalid_handle",
    );
  });

  it("does not connect a stale Switch case handle", () => {
    const switchNode = node("sw", "logic.switch", {
      config: {
        kind: "logic.switch",
        expression: "status",
        cases: [{ value: "pending" }, { value: "ready" }],
      },
    });
    const nodes = [node("t", "trigger.manual"), switchNode, node("a", "logic.set")];
    const edges: VisualWorkflowRfEdge[] = [{ id: "e0", source: "t", target: "sw" }];
    const next = applyVisualWorkflowGraphConnection(nodes, edges, {
      source: "sw",
      target: "a",
      sourceHandle: "3",
      targetHandle: null,
    });
    expect(next.edges).toBe(edges);
    expect(next.nodes).toBe(nodes);
    expect(next.edges).toEqual([{ id: "e0", source: "t", target: "sw" }]);
  });

  it("adds For Each each targets to bodyNodeIds", () => {
    const next = applyVisualWorkflowGraphConnection(
      [node("t", "trigger.manual"), node("loop", "logic.for_each"), node("body", "logic.set")],
      [{ id: "e0", source: "t", target: "loop" }],
      { source: "loop", target: "body", sourceHandle: "each", targetHandle: null },
    );
    const loop = next.nodes.find((entry) => entry.id === "loop");
    expect(next.edges.at(-1)?.sourceHandle).toBe("each");
    expect(loop?.data.bodyNodeIds).toEqual(["body"]);
    expect(codes(validateVisualWorkflowDefinition(definition(next)))).toEqual([]);
  });

  it("adds chained body nodes from If false to the owning For Each", () => {
    const seeded = applyVisualWorkflowGraphConnection(
      [
        node("t", "trigger.manual"),
        node("loop", "logic.for_each"),
        node("iff", "logic.if", { config: { kind: "logic.if", condition: "true" } }),
        node("no", "logic.set"),
      ],
      [{ id: "e0", source: "t", target: "loop" }],
      { source: "loop", target: "iff", sourceHandle: "each", targetHandle: null },
    );
    const chained = applyVisualWorkflowGraphConnection(seeded.nodes, seeded.edges, {
      source: "iff",
      target: "no",
      sourceHandle: "false",
      targetHandle: null,
    });
    expect(chained.nodes.find((entry) => entry.id === "loop")?.data.bodyNodeIds).toEqual([
      "iff",
      "no",
    ]);
    expect(chained.edges.at(-1)?.sourceHandle).toBe("false");
    expect(codes(validateVisualWorkflowDefinition(definition(chained)))).toEqual([]);
  });

  it("does not add For Each done targets to bodyNodeIds", () => {
    const withBody = applyVisualWorkflowGraphConnection(
      [node("t", "trigger.manual"), node("loop", "logic.for_each"), node("body", "logic.set")],
      [{ id: "e0", source: "t", target: "loop" }],
      { source: "loop", target: "body", sourceHandle: "each", targetHandle: null },
    );
    const next = applyVisualWorkflowGraphConnection(
      [...withBody.nodes, node("after", "logic.set")],
      withBody.edges,
      { source: "loop", target: "after", sourceHandle: "done", targetHandle: null },
    );
    expect(next.edges.at(-1)?.sourceHandle).toBe("done");
    expect(next.nodes.find((entry) => entry.id === "loop")?.data.bodyNodeIds).toEqual(["body"]);
    expect(codes(validateVisualWorkflowDefinition(definition(next)))).toEqual([]);
  });

  it("preserves HTTP error handles when onError is branch", () => {
    const http = node("http", "action.http", {
      config: {
        kind: "action.http",
        method: "GET",
        url: "https://example.test",
        onError: "branch",
      },
    });
    const next = applyVisualWorkflowGraphConnection(
      [node("t", "trigger.manual"), http, node("err", "logic.set")],
      [{ id: "e0", source: "t", target: "http" }],
      { source: "http", target: "err", sourceHandle: "error", targetHandle: null },
    );
    expect(next.edges.at(-1)?.sourceHandle).toBe("error");
    expect(codes(validateVisualWorkflowDefinition(definition(next)))).not.toContain(
      "invalid_handle",
    );
  });

  it("does not connect a foreign handle on a single-output node", () => {
    const nodes = [
      node("t", "trigger.manual"),
      node("http", "action.http"),
      node("a", "logic.set"),
    ];
    const edges: VisualWorkflowRfEdge[] = [{ id: "e0", source: "t", target: "http" }];
    const next = applyVisualWorkflowGraphConnection(nodes, edges, {
      source: "http",
      target: "a",
      sourceHandle: "true",
      targetHandle: null,
    });
    expect(next.edges).toBe(edges);
    expect(next.nodes).toBe(nodes);
  });

  it("preserves If true and false handles", () => {
    const iff = node("iff", "logic.if", {
      config: { kind: "logic.if", condition: "true" },
    });
    const next = applyVisualWorkflowGraphConnection(
      [node("t", "trigger.manual"), iff, node("ok", "logic.set"), node("no", "logic.set")],
      [{ id: "e0", source: "t", target: "iff" }],
      { source: "iff", target: "ok", sourceHandle: "true", targetHandle: null },
    );
    const withFalse = applyVisualWorkflowGraphConnection(next.nodes, next.edges, {
      source: "iff",
      target: "no",
      sourceHandle: "false",
      targetHandle: null,
    });
    expect(
      withFalse.edges.filter((edge) => edge.source === "iff").map((edge) => edge.sourceHandle),
    ).toEqual(["true", "false"]);
    expect(codes(validateVisualWorkflowDefinition(definition(withFalse)))).not.toContain(
      "invalid_handle",
    );
  });

  it("round-trips handles and bodyNodeIds through save/load", () => {
    const next = applyVisualWorkflowGraphConnection(
      [node("t", "trigger.manual"), node("loop", "logic.for_each"), node("body", "logic.set")],
      [{ id: "e0", source: "t", target: "loop" }],
      { source: "loop", target: "body", sourceHandle: "each", targetHandle: null },
    );
    const restored = fromVisualWorkflowDefinition(definition(next));
    expect(restored.edges.find((edge) => edge.target === "body")?.sourceHandle).toBe("each");
    expect(restored.nodes.find((entry) => entry.id === "loop")?.data.bodyNodeIds).toEqual(["body"]);
  });
});

describe("removeVisualWorkflowNode", () => {
  it("prunes deleted body members from For Each bodyNodeIds", () => {
    const nodes = [
      node("t", "trigger.manual"),
      node("loop", "logic.for_each", { bodyNodeIds: ["body"] }),
      node("body", "logic.set"),
    ];
    const edges: VisualWorkflowRfEdge[] = [
      { id: "e0", source: "t", target: "loop" },
      { id: "e1", source: "loop", target: "body", sourceHandle: "each" },
    ];
    const result = removeVisualWorkflowNode(nodes, edges, "body");
    expect(result.nodes.find((entry) => entry.id === "loop")?.data.bodyNodeIds).toEqual([]);
    expect(result.edges).toEqual([{ id: "e0", source: "t", target: "loop" }]);
  });
});
