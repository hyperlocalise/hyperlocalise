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

import type { VisualNodeConfig, VisualWorkflowDefinition } from "../schema/types";
import { shouldReuseDurableExecution } from "./durable-execution-reuse";
import { runVisualWorkflowInterpreter } from "./interpreter-server";

const organizationId = "00000000-0000-4000-8000-000000000001";

function terminalDefinition(
  config: VisualNodeConfig,
  options: { inputs?: VisualWorkflowDefinition["nodes"][number]["inputs"]; sibling?: boolean } = {},
): VisualWorkflowDefinition {
  const nodes: VisualWorkflowDefinition["nodes"] = [
    { id: "trigger", type: "trigger.manual", config: { kind: "trigger.manual" } },
    { id: "terminal", type: config.kind, config, inputs: options.inputs },
  ];
  const edges: VisualWorkflowDefinition["edges"] = [
    {
      id: "trigger-terminal",
      source: "trigger",
      target: "terminal",
      sourceHandle: null,
      targetHandle: null,
    },
  ];
  if (options.sibling) {
    nodes.push({
      id: "sibling",
      type: "logic.set",
      config: { kind: "logic.set", assignments: [{ key: "ran", value: "yes" }] },
    });
    edges.push({
      id: "trigger-sibling",
      source: "trigger",
      target: "sibling",
      sourceHandle: null,
      targetHandle: null,
    });
  }
  return { schemaVersion: 2, name: "Terminal workflow", nodes, edges, editor: { positions: {} } };
}

describe("terminal workflow nodes", () => {
  it("reuses persisted terminal failures during durable recovery", () => {
    expect(
      shouldReuseDurableExecution("failed", {
        ok: false,
        error: { code: "CONTROLLED_FAILURE", message: "Stop here", terminal: true },
      }),
    ).toBe(true);
    expect(
      shouldReuseDurableExecution("failed", {
        ok: false,
        error: { code: "node_execution_failed", message: "Try again" },
      }),
    ).toBe(false);
  });

  it("completes explicitly and cancels unsettled parallel branches", async () => {
    const updates: { nodeId: string; status: string }[] = [];
    const result = await runVisualWorkflowInterpreter({
      definition: terminalDefinition(
        { kind: "flow.stop", outcome: "completed", reason: "Nothing else to do" },
        { sibling: true },
      ),
      organizationId,
      onNodeUpdate: (update) => {
        updates.push(update);
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected success");
    expect(result.terminal).toEqual({ kind: "completed", nodeId: "terminal" });
    expect(updates).toContainEqual(
      expect.objectContaining({ nodeId: "sibling", status: "cancelled" }),
    );
    expect(result.nodeResults.sibling).toBeUndefined();
  });

  it("returns declared outputs by public name", async () => {
    const result = await runVisualWorkflowInterpreter({
      definition: terminalDefinition(
        {
          kind: "flow.return",
          outputs: [{ id: "finished-at", name: "finishedAt", type: "string" }],
        },
        {
          inputs: {
            "value.finished-at": {
              kind: "reference",
              nodeId: "trigger",
              path: ["triggeredAt"],
            },
          },
        },
      ),
      organizationId,
      triggerInput: { triggeredAt: "2026-10-06T00:00:00.000Z" },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected success");
    expect(result.terminal).toEqual({
      kind: "returned",
      nodeId: "terminal",
      outputs: { finishedAt: "2026-10-06T00:00:00.000Z" },
    });
  });

  it("cancels intentionally with the configured safe reason", async () => {
    const result = await runVisualWorkflowInterpreter({
      definition: terminalDefinition({
        kind: "flow.stop",
        outcome: "cancelled",
        reason: "The request no longer needs processing",
      }),
      organizationId,
    });

    expect(result).toMatchObject({
      ok: false,
      failedNodeId: "terminal",
      error: {
        code: "cancelled",
        message: "The request no longer needs processing",
        terminal: true,
      },
    });
  });

  it("records a configured failure and cancels unsettled branches", async () => {
    const updates: { nodeId: string; status: string }[] = [];
    const result = await runVisualWorkflowInterpreter({
      definition: terminalDefinition(
        {
          kind: "flow.fail",
          errorCode: "INVALID_ORDER",
          message: "The order cannot be processed",
        },
        { sibling: true },
      ),
      organizationId,
      onNodeUpdate: (update) => {
        updates.push(update);
      },
    });

    expect(result).toMatchObject({
      ok: false,
      failedNodeId: "terminal",
      error: {
        code: "INVALID_ORDER",
        message: "The order cannot be processed",
        terminal: true,
      },
    });
    expect(updates).toContainEqual(
      expect.objectContaining({ nodeId: "sibling", status: "cancelled" }),
    );
  });

  it("propagates Return from inside a For Each body", async () => {
    const definition: VisualWorkflowDefinition = {
      schemaVersion: 2,
      name: "Return from loop",
      nodes: [
        { id: "trigger", type: "trigger.manual", config: { kind: "trigger.manual" } },
        {
          id: "loop",
          type: "logic.for_each",
          config: { kind: "logic.for_each", collection: "[1,2]" },
          bodyNodeIds: ["return"],
        },
        {
          id: "return",
          type: "flow.return",
          config: {
            kind: "flow.return",
            outputs: [{ id: "result", name: "result", type: "string" }],
          },
          inputs: { "value.result": { kind: "literal", value: "first iteration" } },
        },
      ],
      edges: [
        {
          id: "trigger-loop",
          source: "trigger",
          target: "loop",
          sourceHandle: null,
          targetHandle: null,
        },
        {
          id: "loop-return",
          source: "loop",
          target: "return",
          sourceHandle: "each",
          targetHandle: null,
        },
      ],
      editor: { positions: {} },
    };

    const result = await runVisualWorkflowInterpreter({ definition, organizationId });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected success");
    expect(result.terminal).toEqual({
      kind: "returned",
      nodeId: "return",
      outputs: { result: "first iteration" },
    });
  });

  it("does not retry an explicit Fail terminal", async () => {
    const definition: VisualWorkflowDefinition = {
      schemaVersion: 2,
      name: "Fail from retry",
      nodes: [
        { id: "trigger", type: "trigger.manual", config: { kind: "trigger.manual" } },
        {
          id: "retry",
          type: "logic.retry",
          config: { kind: "logic.retry", maxAttempts: 3 },
          bodyNodeIds: ["fail"],
        },
        {
          id: "fail",
          type: "flow.fail",
          config: {
            kind: "flow.fail",
            errorCode: "PAYMENT_DECLINED",
            message: "The payment was declined",
          },
        },
      ],
      edges: [
        {
          id: "trigger-retry",
          source: "trigger",
          target: "retry",
          sourceHandle: null,
          targetHandle: null,
        },
        {
          id: "retry-fail",
          source: "retry",
          target: "fail",
          sourceHandle: "attempt",
          targetHandle: null,
        },
      ],
      editor: { positions: {} },
    };
    const failStarts: number[] = [];
    const result = await runVisualWorkflowInterpreter({
      definition,
      organizationId,
      onNodeUpdate: (update) => {
        if (update.nodeId === "fail" && update.status === "running") {
          failStarts.push(update.iteration ?? -1);
        }
      },
    });

    expect(result).toMatchObject({
      ok: false,
      failedNodeId: "fail",
      error: { code: "PAYMENT_DECLINED", terminal: true },
    });
    expect(failStarts).toHaveLength(1);
  });
});
