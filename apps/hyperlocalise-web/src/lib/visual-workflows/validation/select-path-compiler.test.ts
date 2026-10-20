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

import type { VisualWorkflowV3Definition } from "../schema/types";
import { compileVisualWorkflowV3Definition } from "./compile-workflow-v3";
import { validateVisualWorkflowV3Definition } from "./validate-workflow-v3";

function definition(): VisualWorkflowV3Definition {
  return {
    schemaVersion: 3,
    name: "Select path compiler",
    nodes: [
      {
        id: "trigger",
        type: "trigger.manual",
        config: { kind: "trigger.manual" },
      },
      {
        id: "select",
        type: "logic.select_path",
        config: {
          kind: "logic.select_path",
          path: ["customer", "locale"],
          outputType: "string",
          missingBehavior: "error",
        },
      },
    ],
    edges: [
      {
        id: "execute",
        kind: "execution",
        source: "trigger",
        target: "select",
        sourcePortId: "success",
        targetPortId: "input",
      },
    ],
    editor: { positions: { trigger: { x: 0, y: 0 }, select: { x: 240, y: 0 } } },
  };
}

describe("Select Path compiler", () => {
  it("requires a value binding but uses the configured static path", () => {
    const compiled = compileVisualWorkflowV3Definition(definition());

    expect(compiled.issues).toContainEqual({
      code: "missing_required_input",
      nodeId: "select",
      field: "value",
      reason: "required",
    });
    expect(compiled.issues).not.toContainEqual(expect.objectContaining({ field: "path" }));
  });

  it("compiles a value connection into a reference binding", () => {
    const workflow = definition();
    workflow.edges.push({
      id: "value",
      kind: "data",
      source: "trigger",
      target: "select",
      sourcePortId: "triggeredAt",
      targetPortId: "value",
    });

    const compiled = compileVisualWorkflowV3Definition(workflow);
    expect(compiled.issues).toEqual([]);
    expect(compiled.definition.nodes.find((node) => node.id === "select")?.inputs).toEqual({
      value: { kind: "reference", nodeId: "trigger", path: ["triggeredAt"] },
    });
  });

  it("rejects a dynamic path connection that is not an array", () => {
    const workflow = definition();
    workflow.edges.push(
      {
        id: "value",
        kind: "data",
        source: "trigger",
        target: "select",
        sourcePortId: "triggeredAt",
        targetPortId: "value",
      },
      {
        id: "path",
        kind: "data",
        source: "trigger",
        target: "select",
        sourcePortId: "triggeredAt",
        targetPortId: "path",
      },
    );

    expect(compileVisualWorkflowV3Definition(workflow).issues).toContainEqual({
      code: "incompatible_data_types",
      edgeId: "path",
      nodeId: "select",
    });
  });

  it("exposes the declared output type to downstream validation", () => {
    const workflow = definition();
    workflow.nodes.push({
      id: "create",
      type: "logic.create_object",
      config: {
        kind: "logic.create_object",
        fields: [{ id: "count", name: "count", type: "number" }],
      },
    });
    workflow.edges.push(
      {
        id: "value",
        kind: "data",
        source: "trigger",
        target: "select",
        sourcePortId: "triggeredAt",
        targetPortId: "value",
      },
      {
        id: "selected-value",
        kind: "data",
        source: "select",
        target: "create",
        sourcePortId: "value",
        targetPortId: "value.count",
      },
    );

    expect(compileVisualWorkflowV3Definition(workflow).issues).toContainEqual({
      code: "incompatible_data_types",
      edgeId: "selected-value",
      nodeId: "create",
    });
  });

  it("uses a safely inferred literal output type for downstream validation", () => {
    const workflow = definition();
    const select = workflow.nodes[1]!;
    if (select.config.kind !== "logic.select_path") throw new Error("expected_select_path");
    select.config.outputType = "unknown";
    select.config.path = ["customer", "active"];
    select.inputs = {
      value: { kind: "literal", value: { customer: { active: true } } },
    };
    workflow.nodes.push({
      id: "create",
      type: "logic.create_object",
      config: {
        kind: "logic.create_object",
        fields: [{ id: "count", name: "count", type: "number" }],
      },
    });
    workflow.edges.push({
      id: "selected-value",
      kind: "data",
      source: "select",
      target: "create",
      sourcePortId: "value",
      targetPortId: "value.count",
    });

    expect(compileVisualWorkflowV3Definition(workflow).issues).toContainEqual({
      code: "incompatible_data_types",
      edgeId: "selected-value",
      nodeId: "create",
    });
  });

  it("rejects malformed literal path overrides", () => {
    const workflow = definition();
    workflow.nodes[1]!.inputs = {
      value: { kind: "literal", value: {} },
      path: { kind: "literal", value: ["customer", -1, "__proto__"] },
    };

    expect(validateVisualWorkflowV3Definition(workflow)).toContainEqual({
      code: "invalid_binding",
      nodeId: "select",
      field: "path",
      reason: "invalid",
    });
  });
});
