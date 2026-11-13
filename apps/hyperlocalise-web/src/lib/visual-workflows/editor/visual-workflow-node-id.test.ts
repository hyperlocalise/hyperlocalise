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
import { nextVisualWorkflowNodeId, reservedVisualWorkflowNodeIds } from "./visual-workflow-node-id";
import { EMPTY_VISUAL_WORKFLOW_TEST_SETUP } from "./visual-workflow-test-data";

describe("nextVisualWorkflowNodeId", () => {
  it("names a step by its kind", () => {
    expect(nextVisualWorkflowNodeId("action.notify_slack", [])).toBe("notify_slack");
    expect(nextVisualWorkflowNodeId("trigger.manual", [])).toBe("manual");
    expect(nextVisualWorkflowNodeId("logic.for_each", [])).toBe("for_each");
  });

  it("numbers a second step of the same kind, skipping numbers in use", () => {
    const nodes = [{ id: "http" }, { id: "http_2" }, { id: "slack" }];
    expect(nextVisualWorkflowNodeId("action.http", nodes)).toBe("http_3");
    expect(nextVisualWorkflowNodeId("action.notify_slack", nodes)).toBe("notify_slack");
  });

  it("skips a reserved id although no step on the canvas has it", () => {
    expect(nextVisualWorkflowNodeId("action.http", [], ["http"])).toBe("http_2");
  });
});

describe("reservedVisualWorkflowNodeIds", () => {
  const slack: VisualWorkflowRfNode = {
    id: "notify_slack",
    type: "action.notify_slack",
    position: { x: 0, y: 0 },
    data: {
      catalogType: "action.notify_slack",
      config: {
        ...createDefaultConfig("action.notify_slack"),
        message: "Got {{ nodes.http.body }}",
      } as VisualWorkflowRfNode["data"]["config"],
      runStatus: "idle",
    },
  };

  it("keeps a deleted step's id from a new step of the same kind", () => {
    // `http` was deleted: the Slack step still reads it and its test setup is still held.
    const reserved = reservedVisualWorkflowNodeIds({
      nodes: [slack],
      edges: [],
      setup: {
        ...EMPTY_VISUAL_WORKFLOW_TEST_SETUP,
        data: { http_2: { status: 200 } },
        failures: { http_3: { message: "Down" } },
        realNodeIds: ["http_4"],
      },
      seenNodeIds: ["http_5"],
    });
    expect([...reserved].toSorted()).toEqual(["http", "http_2", "http_3", "http_4", "http_5"]);
    expect(nextVisualWorkflowNodeId("action.http", [slack], reserved)).toBe("http_6");
  });
});
