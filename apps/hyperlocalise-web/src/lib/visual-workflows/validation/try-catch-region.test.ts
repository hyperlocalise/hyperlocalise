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

import { computeTryCatchBodyNodeIdsFromV3Edges } from "../editor/for-each-body-membership";
import type { VisualWorkflowV3Definition, VisualWorkflowV3Edge } from "../schema/types";
import { compileVisualWorkflowV3Definition } from "./compile-workflow-v3";

function edge(
  id: string,
  source: string,
  sourcePortId: string,
  target: string,
): VisualWorkflowV3Edge {
  return {
    id,
    kind: "execution",
    source,
    target,
    sourcePortId,
    targetPortId: "input",
  };
}

function definition(
  boundaryIds: string[],
  otherNodeIds: string[],
  edges: VisualWorkflowV3Edge[],
): VisualWorkflowV3Definition {
  const nodes: VisualWorkflowV3Definition["nodes"] = [
    ...boundaryIds.map((id) => ({
      id,
      type: "logic.try_catch" as const,
      config: { kind: "logic.try_catch" as const },
    })),
    ...otherNodeIds.map((id) => ({
      id,
      type: "logic.set" as const,
      config: { kind: "logic.set" as const, assignments: [] },
    })),
  ];

  return {
    schemaVersion: 3,
    name: "Try / Catch regions",
    nodes,
    edges,
    editor: {
      positions: Object.fromEntries(
        nodes.map((node, index) => [node.id, { x: index * 200, y: 0 }]),
      ),
    },
  };
}

describe("Try / Catch owned regions", () => {
  it("derives the Try body without including boundary exits", () => {
    const edges = [
      edge("try-work", "boundary", "try", "work"),
      edge("work-child", "work", "success", "child"),
      edge("success-done", "boundary", "success", "done"),
    ];

    expect(computeTryCatchBodyNodeIdsFromV3Edges("boundary", edges)).toEqual(["child", "work"]);
  });

  it("rejects a boundary without an explicit Try region", () => {
    const result = compileVisualWorkflowV3Definition(
      definition(["boundary"], ["done"], [edge("success-done", "boundary", "success", "done")]),
    );

    expect(result.issues).toContainEqual({
      code: "invalid_try_catch_region",
      nodeId: "boundary",
    });
  });

  it("rejects ambiguous overlapping regions", () => {
    const result = compileVisualWorkflowV3Definition(
      definition(
        ["left", "right"],
        ["shared"],
        [
          edge("left-shared", "left", "try", "shared"),
          edge("right-shared", "right", "try", "shared"),
        ],
      ),
    );

    expect(result.issues).toContainEqual({
      code: "overlapping_try_catch_region",
      nodeId: "right",
    });
  });

  it("allows an explicitly nested boundary", () => {
    const result = compileVisualWorkflowV3Definition(
      definition(
        ["outer", "inner"],
        ["work"],
        [edge("outer-inner", "outer", "try", "inner"), edge("inner-work", "inner", "try", "work")],
      ),
    );

    expect(result.issues).toEqual([]);
  });
});
