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
import { createVisualWorkflowExecutionContext } from "./context";
import { evaluateVisualWorkflowCondition, resolveVisualWorkflowTemplate } from "./expressions";
import { runVisualWorkflowInterpreter } from "./interpreter";
import type { VisualWorkflowDefinition } from "../schema/types";

describe("visual workflow expressions", () => {
  it("resolves trigger and node template paths", () => {
    const context = createVisualWorkflowExecutionContext({
      triggerInput: { name: "Lead" },
    });
    context.nodes.trigger = { name: "Lead" };
    context.nodes.http = { status: 200 };

    expect(resolveVisualWorkflowTemplate("Hello {{trigger.name}}", context)).toBe("Hello Lead");
    expect(resolveVisualWorkflowTemplate("Status {{nodes.http.status}}", context)).toBe(
      "Status 200",
    );
  });

  it("evaluates simple truthy and comparison conditions", () => {
    const context = createVisualWorkflowExecutionContext({
      triggerInput: { score: 10 },
    });
    context.nodes.check = { value: "5" };

    expect(evaluateVisualWorkflowCondition("true", context)).toBe(true);
    expect(evaluateVisualWorkflowCondition("{{nodes.check.value}} == 5", context)).toBe(true);
    expect(evaluateVisualWorkflowCondition("{{trigger.score}} > 5", context)).toBe(true);
  });
});

describe("visual workflow interpreter", () => {
  it("walks trigger and if nodes without following the false branch", async () => {
    const definition: VisualWorkflowDefinition = {
      schemaVersion: 1,
      name: "Branching",
      nodes: [
        { id: "t", type: "trigger.manual", config: createDefaultConfig("trigger.manual") },
        { id: "iff", type: "logic.if", config: { kind: "logic.if", condition: "true" } },
        { id: "ok", type: "ai.agent", config: { kind: "ai.agent", prompt: "noop" } },
        { id: "no", type: "ai.agent", config: { kind: "ai.agent", prompt: "noop" } },
      ],
      edges: [
        { id: "e1", source: "t", target: "iff", sourceHandle: null, targetHandle: null },
        { id: "e2", source: "iff", target: "ok", sourceHandle: "true", targetHandle: null },
        { id: "e3", source: "iff", target: "no", sourceHandle: "false", targetHandle: null },
      ],
      editor: { positions: {} },
    };

    const updates: string[] = [];
    const result = await runVisualWorkflowInterpreter({
      definition,
      organizationId: "00000000-0000-4000-8000-000000000001",
      onNodeUpdate: async (update) => {
        if (update.status === "succeeded") {
          updates.push(update.nodeId);
        }
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected failed interpreter result");
    }
    expect(updates).toEqual(["t", "iff"]);
    expect(result.failedNodeId).toBe("ok");
  });
});
