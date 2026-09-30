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

import { buildVisualWorkflowV3GraphIndex } from "./graph-index";
import type { VisualWorkflowV3Definition } from "../schema/types";

function definition(edges: VisualWorkflowV3Definition["edges"]): VisualWorkflowV3Definition {
  return {
    schemaVersion: 3,
    name: "V3 graph index",
    nodes: [
      {
        id: "trigger",
        type: "trigger.manual",
        config: {
          kind: "trigger.manual",
        },
      },
      {
        id: "set",
        type: "logic.set",
        config: {
          kind: "logic.set",
          assignments: [],
        },
      },
    ],
    edges,
    editor: {
      positions: {
        trigger: { x: 0, y: 0 },
        set: { x: 240, y: 0 },
      },
    },
  };
}

describe("buildVisualWorkflowV3GraphIndex", () => {
  it("indexes execution edges and ignores data edges between the same nodes", () => {
    const graph = buildVisualWorkflowV3GraphIndex(
      definition([
        {
          id: "execution",
          kind: "execution",
          source: "trigger",
          target: "set",
          sourcePortId: "success",
          targetPortId: "input",
        },
        {
          id: "data",
          kind: "data",
          source: "trigger",
          target: "set",
          sourcePortId: "triggeredAt",
          targetPortId: "value",
        },
      ]),
    );

    expect(graph).not.toBeNull();
    expect(graph?.incomingCountByNodeId.get("set")).toBe(1);
    expect(graph?.outgoingByNodeId.get("trigger")).toEqual([
      expect.objectContaining({
        id: "execution",
        kind: "execution",
      }),
    ]);
  });

  it("does not make a target executable from a data-only connection", () => {
    const graph = buildVisualWorkflowV3GraphIndex(
      definition([
        {
          id: "data-only",
          kind: "data",
          source: "trigger",
          target: "set",
          sourcePortId: "triggeredAt",
          targetPortId: "value",
        },
      ]),
    );

    expect(graph).not.toBeNull();
    expect(graph?.incomingCountByNodeId.get("set")).toBe(0);
    expect(graph?.outgoingByNodeId.get("trigger")).toEqual([]);
  });
});
