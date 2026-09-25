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

import type { VisualWorkflowRfEdge } from "../schema/types";
import {
  computeForEachBodyNodeIds,
  computeRetryBodyNodeIds,
  deriveForEachLoopRegion,
  computeForEachBodyNodeIdsFromV3Edges,
} from "./for-each-body-membership";

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

function dataEdge(id: string, source: string, target: string): VisualWorkflowRfEdge {
  return {
    id,
    source,
    target,
    sourceHandle: "output",
    targetHandle: "value",
    data: {
      kind: "data",
    },
  };
}

describe("deriveForEachLoopRegion", () => {
  it("returns an empty body and exit region for an unconnected loop", () => {
    expect(deriveForEachLoopRegion("loop", [])).toEqual({
      bodyNodeIds: [],
      exitNodeIds: [],
    });
  });

  it("derives a chained loop body from the each branch", () => {
    const edges = [
      executionEdge("each-first", "loop", "first", "each"),
      executionEdge("first-second", "first", "second"),
    ];

    expect(deriveForEachLoopRegion("loop", edges)).toEqual({
      bodyNodeIds: ["first", "second"],
      exitNodeIds: [],
    });
  });

  it("derives multiple branches and an internal join", () => {
    const edges = [
      executionEdge("each-branch", "loop", "branch", "each"),
      executionEdge("branch-left", "branch", "left", "true"),
      executionEdge("branch-right", "branch", "right", "false"),
      executionEdge("left-join", "left", "join"),
      executionEdge("right-join", "right", "join"),
    ];

    expect(computeForEachBodyNodeIds("loop", edges)).toEqual(["branch", "join", "left", "right"]);
  });

  it("excludes the done region from the loop body", () => {
    const edges = [
      executionEdge("each-body", "loop", "body", "each"),
      executionEdge("body-shared", "body", "shared"),
      executionEdge("done-shared", "loop", "shared", "done"),
      executionEdge("shared-after", "shared", "after"),
    ];

    expect(deriveForEachLoopRegion("loop", edges)).toEqual({
      bodyNodeIds: ["body"],
      exitNodeIds: ["after", "shared"],
    });
  });

  it("ignores data edges when deriving membership", () => {
    const edges = [
      executionEdge("each-body", "loop", "body", "each"),
      dataEdge("body-unrelated", "body", "unrelated"),
    ];

    expect(computeForEachBodyNodeIds("loop", edges)).toEqual(["body"]);
  });

  it("does not loop forever when malformed edges point back to the owner", () => {
    const edges = [
      executionEdge("each-first", "loop", "first", "each"),
      executionEdge("first-loop", "first", "loop"),
    ];

    expect(computeForEachBodyNodeIds("loop", edges)).toEqual(["first"]);
  });

  it("returns stable membership regardless of edge ordering", () => {
    const edges = [
      executionEdge("each-second", "loop", "second", "each"),
      executionEdge("each-first", "loop", "first", "each"),
    ];

    expect(computeForEachBodyNodeIds("loop", edges)).toEqual(["first", "second"]);
    expect(computeForEachBodyNodeIds("loop", [...edges].reverse())).toEqual(["first", "second"]);
  });
});

describe("computeRetryBodyNodeIds", () => {
  it("continues to derive Retry membership from the attempt branch", () => {
    const edges = [
      executionEdge("attempt-first", "retry", "first", "attempt"),
      executionEdge("first-second", "first", "second"),
      executionEdge("retry-done", "retry", "after", "done"),
    ];

    expect(computeRetryBodyNodeIds("retry", edges)).toEqual(["first", "second"]);
  });

  it("derives membership from v3 execution edges and ignores data edges", () => {
    expect(
      computeForEachBodyNodeIdsFromV3Edges("loop", [
        {
          id: "loop-body",
          kind: "execution",
          source: "loop",
          target: "body",
          sourcePortId: "each",
          targetPortId: "input",
        },
        {
          id: "loop-after",
          kind: "execution",
          source: "loop",
          target: "after",
          sourcePortId: "done",
          targetPortId: "input",
        },
        {
          id: "body-unrelated",
          kind: "data",
          source: "body",
          target: "unrelated",
          sourcePortId: "value",
          targetPortId: "value",
        },
      ]),
    ).toEqual(["body"]);
  });
});
