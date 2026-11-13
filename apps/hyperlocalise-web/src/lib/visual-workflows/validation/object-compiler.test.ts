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

import type { VisualObjectField, VisualWorkflowV3Definition } from "../schema/types";
import { compileVisualWorkflowV3Definition } from "./compile-workflow-v3";

function createDefinition(fields: VisualObjectField[]): VisualWorkflowV3Definition {
  return {
    schemaVersion: 3,
    name: "Object compiler",
    nodes: [
      {
        id: "trigger",
        type: "trigger.manual",
        config: { kind: "trigger.manual" },
      },
      {
        id: "create",
        type: "logic.create_object",
        config: { kind: "logic.create_object", fields },
      },
    ],
    edges: [
      {
        id: "execute",
        kind: "execution",
        source: "trigger",
        target: "create",
        sourcePortId: "success",
        targetPortId: "input",
      },
    ],
    editor: { positions: { trigger: { x: 0, y: 0 }, create: { x: 240, y: 0 } } },
  };
}

describe("object node compiler", () => {
  it("requires dynamic fields without defaults", () => {
    const result = compileVisualWorkflowV3Definition(
      createDefinition([
        { id: "customer", name: "customer", type: "string" },
        { id: "locale", name: "locale", type: "string", defaultValue: "en" },
      ]),
    );

    expect(result.issues).toContainEqual({
      code: "missing_required_input",
      nodeId: "create",
      field: "value.customer",
      reason: "required",
    });
    expect(result.issues).not.toContainEqual(expect.objectContaining({ field: "value.locale" }));
  });

  it("compiles bindings by stable ID across rename and reorder", () => {
    const fields: VisualObjectField[] = [
      { id: "customer", name: "Customer", type: "string" },
      { id: "locale", name: "Locale", type: "string", defaultValue: "en" },
    ];
    const first = createDefinition(fields);
    first.edges.push({
      id: "customer-data",
      kind: "data",
      source: "trigger",
      target: "create",
      sourcePortId: "triggeredAt",
      targetPortId: "value.customer",
    });
    const renamed = createDefinition([
      { ...fields[1]!, name: "Language" },
      { ...fields[0]!, name: "Renamed customer" },
    ]);
    renamed.edges.push(first.edges[1]!);

    for (const definition of [first, renamed]) {
      const compiled = compileVisualWorkflowV3Definition(definition);
      expect(compiled.issues).toEqual([]);
      expect(compiled.definition.nodes.find((node) => node.id === "create")?.inputs).toEqual({
        "value.customer": {
          kind: "reference",
          nodeId: "trigger",
          path: ["triggeredAt"],
        },
      });
    }
  });

  it("rejects incompatible connections into typed fields", () => {
    const definition = createDefinition([{ id: "count", name: "count", type: "number" }]);
    definition.edges.push({
      id: "wrong-type",
      kind: "data",
      source: "trigger",
      target: "create",
      sourcePortId: "triggeredAt",
      targetPortId: "value.count",
    });

    expect(compileVisualWorkflowV3Definition(definition).issues).toContainEqual({
      code: "incompatible_data_types",
      edgeId: "wrong-type",
      nodeId: "create",
    });
  });

  it("requires every Merge Objects input", () => {
    const definition = createDefinition([]);
    definition.nodes.push({
      id: "merge",
      type: "logic.merge_objects",
      config: {
        kind: "logic.merge_objects",
        inputs: [
          { id: "base", name: "Base" },
          { id: "override", name: "Override" },
        ],
        conflictPolicy: "last_wins",
      },
    });
    definition.edges.push(
      {
        id: "execute-merge",
        kind: "execution",
        source: "create",
        target: "merge",
        sourcePortId: "success",
        targetPortId: "input",
      },
      {
        id: "base-data",
        kind: "data",
        source: "create",
        target: "merge",
        sourcePortId: "value",
        targetPortId: "value.base",
      },
    );

    const compiled = compileVisualWorkflowV3Definition(definition);
    expect(compiled.issues).toContainEqual({
      code: "missing_required_input",
      nodeId: "merge",
      field: "value.override",
      reason: "required",
    });
    expect(compiled.issues).not.toContainEqual(expect.objectContaining({ edgeId: "base-data" }));
  });
});
