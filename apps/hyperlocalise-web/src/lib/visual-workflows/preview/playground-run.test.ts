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
import { runPlaygroundWorkflow } from "./playground-run";
import type { VisualWorkflowRfEdge, VisualWorkflowRfNode } from "../schema/types";

function node(id: string, type: VisualWorkflowRfNode["data"]["catalogType"]): VisualWorkflowRfNode {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data: {
      catalogType: type,
      config: createDefaultConfig(type),
      runStatus: "idle",
    },
  };
}

describe("playground workflow runner", () => {
  it("executes branching logic with simulated action outputs", async () => {
    const nodes: VisualWorkflowRfNode[] = [
      node("trigger", "trigger.manual"),
      {
        ...node("set", "logic.set"),
        data: {
          ...node("set", "logic.set").data,
          config: {
            kind: "logic.set",
            assignments: [{ key: "status", value: "ready" }],
          },
        },
      },
      {
        ...node("switch", "logic.switch"),
        data: {
          ...node("switch", "logic.switch").data,
          config: {
            kind: "logic.switch",
            expression: "{{nodes.set.status}}",
            cases: [{ value: "ready" }, { value: "blocked" }],
          },
        },
      },
      {
        ...node("taken", "action.notify_slack"),
        data: {
          ...node("taken", "action.notify_slack").data,
          config: {
            kind: "action.notify_slack",
            channelId: "C123",
            message: "Ready branch reached",
            onError: "stop",
          },
        },
      },
    ];
    const edges: VisualWorkflowRfEdge[] = [
      { id: "e1", source: "trigger", target: "set" },
      { id: "e2", source: "set", target: "switch" },
      { id: "e3", source: "switch", target: "taken", sourceHandle: "0" },
    ];

    const statuses: string[] = [];
    const outputs: Record<string, Record<string, unknown>> = {};

    const result = await runPlaygroundWorkflow({
      name: "Playground",
      nodes,
      edges,
      onStatus: (nodeId, status) => {
        statuses.push(`${nodeId}:${status}`);
      },
      onOutput: (nodeId, output) => {
        if (output) {
          outputs[nodeId] = output;
        }
      },
    });

    expect(result).toBe("completed");
    expect(statuses).toContain("set:succeeded");
    expect(statuses).toContain("taken:succeeded");
    expect(outputs.set?.status).toBe("ready");
    expect(outputs.taken?.simulated).toBe(true);
  });
});
