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

import type { VisualArrayTransformOperation, VisualWorkflowDefinition } from "../schema/types";
import { executeVisualWorkflowNode } from "./execute-node";
import { runVisualWorkflowInterpreter } from "./interpreter-server";

function transformDefinition(
  operation: VisualArrayTransformOperation,
  items: unknown[],
): VisualWorkflowDefinition {
  return {
    schemaVersion: 2,
    name: `Array ${operation}`,
    nodes: [
      { id: "trigger", type: "trigger.manual", config: { kind: "trigger.manual" } },
      {
        id: "transform",
        type: "logic.array_transform",
        config: {
          kind: "logic.array_transform",
          operation,
          collection: JSON.stringify(items),
          itemType: "number",
          resultType: "number",
          ...(operation === "reduce" ? { initialValue: 0 } : {}),
        },
        bodyNodeIds: ["body"],
        collect: {
          result: { kind: "reference", nodeId: "body", path: ["value"] },
        },
      },
      {
        id: "body",
        type: "logic.select_path",
        config: {
          kind: "logic.select_path",
          path: ["value"],
          outputType: "unknown",
          missingBehavior: "error",
        },
        inputs: { value: { kind: "literal", value: { value: null } } },
      },
      {
        id: "after",
        type: "logic.set",
        config: { kind: "logic.set", assignments: [] },
      },
    ],
    edges: [
      {
        id: "trigger-transform",
        source: "trigger",
        target: "transform",
        sourceHandle: null,
        targetHandle: null,
      },
      {
        id: "transform-body",
        source: "transform",
        target: "body",
        sourceHandle: "each",
        targetHandle: null,
      },
      {
        id: "transform-after",
        source: "transform",
        target: "after",
        sourceHandle: "done",
        targetHandle: null,
      },
    ],
    editor: { positions: {} },
  };
}

async function runTransform(operation: VisualArrayTransformOperation, items: number[]) {
  let bodyExecutions = 0;
  const result = await runVisualWorkflowInterpreter({
    definition: transformDefinition(operation, items),
    organizationId: "00000000-0000-4000-8000-000000000001",
    executeNode: async (args) => {
      if (args.node.id !== "body") {
        return executeVisualWorkflowNode({ ...args, inputsResolved: true });
      }
      bodyExecutions += 1;
      const state = args.context.nodes.transform ?? {};
      const item = Number(state.item);
      const resultValue =
        operation === "filter"
          ? item % 2 === 0
          : operation === "map"
            ? item * 2
            : operation === "reduce"
              ? Number(state.accumulator) + item
              : item === 2;
      return { ok: true, output: { value: resultValue, found: true } };
    },
  });
  return { result, bodyExecutions };
}

describe("Array Transform runtime", () => {
  it("filters values without changing their relative order", async () => {
    const { result } = await runTransform("filter", [3, 2, 4, 1]);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.nodeResults.transform).toEqual({ count: 4, items: [2, 4] });
  });

  it("maps one body result per item in input order", async () => {
    const { result } = await runTransform("map", [3, 1, 2]);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.nodeResults.transform).toEqual({ count: 3, items: [6, 2, 4] });
  });

  it("reduces sequentially from the explicit initial value", async () => {
    const { result } = await runTransform("reduce", [3, 1, 2]);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.nodeResults.transform).toEqual({ count: 3, value: 6 });
  });

  it("returns the initial value when reducing an empty array", async () => {
    const { result, bodyExecutions } = await runTransform("reduce", []);

    expect(result.ok).toBe(true);
    expect(bodyExecutions).toBe(0);
    if (result.ok) expect(result.nodeResults.transform).toEqual({ count: 0, value: 0 });
  });

  it("finds the first match and stops evaluating later items", async () => {
    const { result, bodyExecutions } = await runTransform("find", [1, 2, 2, 3]);

    expect(result.ok).toBe(true);
    expect(bodyExecutions).toBe(2);
    if (result.ok) {
      expect(result.nodeResults.transform).toEqual({ count: 4, found: true, value: 2 });
    }
  });

  it("defines a missing Find match without inventing a value", async () => {
    const { result } = await runTransform("find", [1, 3]);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.nodeResults.transform).toEqual({ count: 2, found: false });
  });

  it("rejects collections above the shared loop limit", async () => {
    const { result } = await runTransform(
      "map",
      Array.from({ length: 101 }, (_, index) => index),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("loop_limit");
  });

  it("propagates a failure from inside the transform body", async () => {
    const result = await runVisualWorkflowInterpreter({
      definition: transformDefinition("map", [1]),
      organizationId: "00000000-0000-4000-8000-000000000001",
      executeNode: async (args) =>
        args.node.id === "body"
          ? { ok: false, error: { code: "body_failed", message: "Body failed." } }
          : executeVisualWorkflowNode({ ...args, inputsResolved: true }),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failedNodeId).toBe("body");
      expect(result.error.code).toBe("body_failed");
    }
  });

  it("rejects collection items that do not match the declared item type", async () => {
    const result = await runVisualWorkflowInterpreter({
      definition: transformDefinition("map", ["not-a-number"]),
      organizationId: "00000000-0000-4000-8000-000000000001",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("invalid_array_transform_input");
  });

  it("rejects a missing collected body result binding during validation", async () => {
    const definition = transformDefinition("map", [1]);
    const transform = definition.nodes.find((node) => node.id === "transform");
    if (transform) delete transform.collect;

    const result = await runVisualWorkflowInterpreter({
      definition,
      organizationId: "00000000-0000-4000-8000-000000000001",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("invalid_graph");
      expect(result.error.issues).toContainEqual(
        expect.objectContaining({ code: "invalid_binding", nodeId: "transform", field: "result" }),
      );
    }
  });

  it("rejects a downstream binding to a result port the operation does not produce", async () => {
    const definition = transformDefinition("reduce", [1]);
    definition.nodes.push({
      id: "reader",
      type: "logic.set",
      config: { kind: "logic.set", assignments: [] },
      inputs: {
        items: { kind: "reference", nodeId: "transform", path: ["items"] },
      },
    });
    definition.edges.push({
      id: "after-reader",
      source: "after",
      target: "reader",
      sourceHandle: null,
      targetHandle: null,
    });

    const result = await runVisualWorkflowInterpreter({
      definition,
      organizationId: "00000000-0000-4000-8000-000000000001",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("invalid_graph");
      expect(result.error.issues).toContainEqual(
        expect.objectContaining({ code: "invalid_binding", nodeId: "reader", field: "items" }),
      );
    }
  });

  it("requires boolean predicate results for Filter and Find", async () => {
    const result = await runVisualWorkflowInterpreter({
      definition: transformDefinition("filter", [1]),
      organizationId: "00000000-0000-4000-8000-000000000001",
      executeNode: async (args) =>
        args.node.id === "body"
          ? { ok: true, output: { value: "yes", found: true } }
          : executeVisualWorkflowNode({ ...args, inputsResolved: true }),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("invalid_array_transform_result");
  });
});
