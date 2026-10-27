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

import type {
  VisualComparisonOperand,
  VisualComparisonOperator,
  VisualWorkflowV3Definition,
} from "../schema/types";
import { compileVisualWorkflowV3Definition } from "./compile-workflow-v3";

function definition(input: {
  operator?: VisualComparisonOperator;
  operands?: VisualComparisonOperand[];
}): VisualWorkflowV3Definition {
  return {
    schemaVersion: 3,
    name: "Compare compiler",
    nodes: [
      { id: "trigger", type: "trigger.manual", config: { kind: "trigger.manual" } },
      {
        id: "compare",
        type: "logic.compare",
        config: {
          kind: "logic.compare",
          operator: input.operator ?? "equal",
          operands: input.operands ?? [
            { id: "left", name: "Left", type: "string" },
            { id: "right", name: "Right", type: "string" },
          ],
        },
      },
    ],
    edges: [
      {
        id: "execute",
        kind: "execution",
        source: "trigger",
        target: "compare",
        sourcePortId: "success",
        targetPortId: "input",
      },
    ],
    editor: { positions: { trigger: { x: 0, y: 0 }, compare: { x: 240, y: 0 } } },
  };
}

describe("Compare compiler", () => {
  it("requires every configured operand", () => {
    const compiled = compileVisualWorkflowV3Definition(definition({}));

    expect(compiled.issues).toEqual(
      expect.arrayContaining([
        {
          code: "missing_required_input",
          nodeId: "compare",
          field: "value.left",
          reason: "required",
        },
        {
          code: "missing_required_input",
          nodeId: "compare",
          field: "value.right",
          reason: "required",
        },
      ]),
    );
  });

  it("compiles bindings against stable operand ids", () => {
    const workflow = definition({});
    workflow.edges.push({
      id: "left-data",
      kind: "data",
      source: "trigger",
      target: "compare",
      sourcePortId: "triggeredAt",
      targetPortId: "value.left",
    });
    workflow.nodes[1]!.inputs = {
      "value.right": { kind: "literal", value: "2026-01-01T00:00:00.000Z" },
    };

    const compiled = compileVisualWorkflowV3Definition(workflow);
    expect(compiled.issues).toEqual([]);
    expect(compiled.definition.nodes[1]?.inputs?.["value.left"]).toEqual({
      kind: "reference",
      nodeId: "trigger",
      path: ["triggeredAt"],
    });
  });

  it("rejects incompatible connected and configured operand types", () => {
    const workflow = definition({
      operator: "greater_than",
      operands: [
        { id: "left", name: "Left", type: "number" },
        { id: "right", name: "Right", type: "string" },
      ],
    });
    workflow.edges.push({
      id: "wrong-data",
      kind: "data",
      source: "trigger",
      target: "compare",
      sourcePortId: "triggeredAt",
      targetPortId: "value.left",
    });

    expect(compileVisualWorkflowV3Definition(workflow).issues).toEqual(
      expect.arrayContaining([
        { code: "incompatible_data_types", edgeId: "wrong-data", nodeId: "compare" },
        { code: "incompatible_data_types", nodeId: "compare" },
      ]),
    );
  });

  it("only allows locale-sensitive comparison for declared string operands", () => {
    const workflow = definition({
      operands: [
        { id: "left", name: "Left", type: "number" },
        { id: "right", name: "Right", type: "number" },
      ],
    });
    const compare = workflow.nodes[1];
    if (compare?.config.kind !== "logic.compare") throw new Error("Expected compare config");
    compare.config.locale = "en-AU";
    compare.inputs = {
      "value.left": { kind: "literal", value: 1 },
      "value.right": { kind: "literal", value: 2 },
    };

    expect(compileVisualWorkflowV3Definition(workflow).issues).toContainEqual({
      code: "incompatible_data_types",
      nodeId: "compare",
    });
  });

  it("accepts boolean group operators and rejects a non-boolean operand", () => {
    const andWorkflow = definition({
      operator: "and",
      operands: [
        { id: "one", name: "One", type: "boolean" },
        { id: "two", name: "Two", type: "boolean" },
        { id: "three", name: "Three", type: "boolean" },
      ],
    });
    andWorkflow.nodes[1]!.inputs = {
      "value.one": { kind: "literal", value: true },
      "value.two": { kind: "literal", value: false },
      "value.three": { kind: "literal", value: true },
    };
    expect(compileVisualWorkflowV3Definition(andWorkflow).issues).toEqual([]);

    const notWorkflow = definition({
      operator: "not",
      operands: [{ id: "left", name: "Left", type: "boolean" }],
    });
    notWorkflow.nodes[1]!.inputs = { "value.left": { kind: "literal", value: false } };
    expect(compileVisualWorkflowV3Definition(notWorkflow).issues).toEqual([]);

    const orWorkflow = definition({
      operator: "or",
      operands: [
        { id: "left", name: "Left", type: "boolean" },
        { id: "right", name: "Right", type: "number" },
      ],
    });
    orWorkflow.nodes[1]!.inputs = {
      "value.left": { kind: "literal", value: true },
      "value.right": { kind: "literal", value: 1 },
    };
    expect(compileVisualWorkflowV3Definition(orWorkflow).issues).toContainEqual({
      code: "incompatible_data_types",
      nodeId: "compare",
    });
  });

  it.each([
    ["equal", "object", "object"],
    ["not_equal", "string", "string"],
    ["contains", "array", "number"],
    ["starts_with", "string", "string"],
    ["less_than", "number", "number"],
    ["greater_than_or_equal", "string", "string"],
  ] as const)("accepts %s with %s and %s operands", (operator, leftType, rightType) => {
    const workflow = definition({
      operator,
      operands: [
        { id: "left", name: "Left", type: leftType },
        { id: "right", name: "Right", type: rightType },
      ],
    });
    workflow.nodes[1]!.inputs = {
      "value.left": { kind: "literal", value: null },
      "value.right": { kind: "literal", value: null },
    };

    expect(compileVisualWorkflowV3Definition(workflow).issues).toEqual([]);
  });
});
