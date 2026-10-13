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
import type {
  VisualCatalogType,
  VisualWorkflowRfEdge,
  VisualWorkflowRfNode,
} from "../schema/types";
import {
  describeVisualWorkflowGraphChange,
  isVisualWorkflowGraphEqual,
  type VisualWorkflowGraph,
} from "./visual-workflow-undo";

function node(
  id: string,
  type: VisualCatalogType,
  extra: Partial<VisualWorkflowRfNode> = {},
): VisualWorkflowRfNode {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data: { catalogType: type, config: createDefaultConfig(type), runStatus: "idle" },
    ...extra,
  };
}

function edge(
  source: string,
  target: string,
  sourceHandle: string | null = "success",
): VisualWorkflowRfEdge {
  return {
    id: `${source}-${target}`,
    source,
    target,
    sourceHandle,
    targetHandle: "input",
    data: { kind: "execution" },
  };
}

const base: VisualWorkflowGraph = {
  name: "Sync",
  nodes: [
    node("trigger", "trigger.manual"),
    node("set", "logic.set", { position: { x: 300, y: 0 } }),
  ],
  edges: [edge("trigger", "set")],
};

describe("isVisualWorkflowGraphEqual", () => {
  it("ignores run markers and React Flow's own flags", () => {
    const marked: VisualWorkflowGraph = {
      ...base,
      nodes: base.nodes.map((entry) => ({
        ...entry,
        selected: true,
        dragging: false,
        measured: { width: 10, height: 10 },
        data: { ...entry.data, runStatus: "succeeded", lastOutput: { ok: true } },
      })),
    };

    expect(isVisualWorkflowGraphEqual(base, marked)).toBe(true);
  });

  it("sees a moved node, a changed setting and a changed edge", () => {
    expect(
      isVisualWorkflowGraphEqual(base, {
        ...base,
        nodes: [base.nodes[0]!, { ...base.nodes[1]!, position: { x: 301, y: 0 } }],
      }),
    ).toBe(false);
    expect(
      isVisualWorkflowGraphEqual(base, {
        ...base,
        nodes: [
          base.nodes[0]!,
          {
            ...base.nodes[1]!,
            data: {
              ...base.nodes[1]!.data,
              config: { kind: "logic.set", assignments: [{ key: "a", value: "1" }] },
            },
          },
        ],
      }),
    ).toBe(false);
    expect(
      isVisualWorkflowGraphEqual(base, { ...base, edges: [edge("trigger", "set", "error")] }),
    ).toBe(false);
  });
});

describe("describeVisualWorkflowGraphChange", () => {
  it("names an added node, with its edge, as an addition", () => {
    const after: VisualWorkflowGraph = {
      ...base,
      nodes: [...base.nodes, node("slack", "action.notify_slack")],
      edges: [...base.edges, edge("set", "slack")],
    };

    expect(describeVisualWorkflowGraphChange(base, after)).toEqual({
      kind: "add",
      nodeIds: ["slack"],
    });
  });

  it("names a removed node, with its edges, as a removal", () => {
    expect(
      describeVisualWorkflowGraphChange(base, { ...base, nodes: [base.nodes[0]!], edges: [] }),
    ).toEqual({ kind: "remove", nodeIds: ["set"] });
  });

  it("names edge changes when the nodes stay", () => {
    expect(describeVisualWorkflowGraphChange(base, { ...base, edges: [] })).toEqual({
      kind: "disconnect",
      nodeIds: [],
    });
    expect(describeVisualWorkflowGraphChange({ ...base, edges: [] }, base)).toEqual({
      kind: "connect",
      nodeIds: [],
    });
  });

  it("merges nudges of the same node and typing in the same node's settings", () => {
    const moved = describeVisualWorkflowGraphChange(base, {
      ...base,
      nodes: [base.nodes[0]!, { ...base.nodes[1]!, position: { x: 310, y: 0 } }],
    });
    expect(moved).toEqual({ kind: "move", nodeIds: ["set"], coalesceKey: "move:set" });

    const configured = describeVisualWorkflowGraphChange(base, {
      ...base,
      nodes: [
        base.nodes[0]!,
        {
          ...base.nodes[1]!,
          data: {
            ...base.nodes[1]!.data,
            config: { kind: "logic.set", assignments: [{ key: "a", value: "1" }] },
          },
        },
      ],
    });
    expect(configured).toEqual({
      kind: "configure",
      nodeIds: ["set"],
      coalesceKey: "configure:set",
    });
  });

  it("merges typing in the name", () => {
    expect(describeVisualWorkflowGraphChange(base, { ...base, name: "Sync n" })).toEqual({
      kind: "rename",
      nodeIds: [],
      coalesceKey: "rename",
    });
  });

  it("names a type change and keeps several changes apart", () => {
    const retyped = node("set", "action.http", { position: { x: 300, y: 0 } });
    expect(
      describeVisualWorkflowGraphChange(base, { ...base, nodes: [base.nodes[0]!, retyped] }),
    ).toEqual({ kind: "retype", nodeIds: ["set"] });

    expect(
      describeVisualWorkflowGraphChange(base, {
        name: "Other",
        nodes: [base.nodes[0]!, { ...base.nodes[1]!, position: { x: 1, y: 1 } }],
        edges: base.edges,
      }),
    ).toEqual({ kind: "edit", nodeIds: ["set"] });
  });
});
