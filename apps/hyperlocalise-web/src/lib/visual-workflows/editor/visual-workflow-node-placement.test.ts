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
import type { VisualWorkflowRfNode } from "../schema/types";
import { placeNewVisualWorkflowNode } from "./visual-workflow-node-placement";

function node(id: string, position: { x: number; y: number }): VisualWorkflowRfNode {
  return {
    id,
    type: "logic.set",
    position,
    data: { catalogType: "logic.set", config: createDefaultConfig("logic.set"), runStatus: "idle" },
  };
}

const size = { width: 280, height: 104 };

describe("placeNewVisualWorkflowNode", () => {
  it("puts a step added without a source in the middle of the view", () => {
    expect(
      placeNewVisualWorkflowNode({ nodes: [], viewCenter: { x: 1000, y: 500 }, size }),
    ).toEqual({ x: 860, y: 448 });
  });

  it("rounds a position that falls between pixels", () => {
    expect(
      placeNewVisualWorkflowNode({ nodes: [], viewCenter: { x: 100.4, y: 60.6 }, size }),
    ).toEqual({ x: -40, y: 9 });
  });

  it("moves off a step already at that spot, as often as it takes", () => {
    const first = placeNewVisualWorkflowNode({ nodes: [], viewCenter: { x: 1000, y: 500 }, size });
    const second = placeNewVisualWorkflowNode({
      nodes: [node("a", first)],
      viewCenter: { x: 1000, y: 500 },
      size,
    });
    const third = placeNewVisualWorkflowNode({
      nodes: [node("a", first), node("b", second)],
      viewCenter: { x: 1000, y: 500 },
      size,
    });

    expect(second).toEqual({ x: first.x + 24, y: first.y + 16 });
    expect(third).toEqual({ x: first.x + 48, y: first.y + 32 });
  });

  it("keeps a step added from another step beside it, whatever the view shows", () => {
    const source = node("source", { x: 40, y: 80 });

    expect(
      placeNewVisualWorkflowNode({
        nodes: [source],
        source,
        viewCenter: { x: 1000, y: 500 },
        size,
      }),
    ).toEqual({ x: 380, y: 80 });
  });

  it("falls back to a fixed spot when the view is not known", () => {
    expect(placeNewVisualWorkflowNode({ nodes: [node("a", { x: 0, y: 0 })] })).toEqual({
      x: 144,
      y: 176,
    });
  });
});
