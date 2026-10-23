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

import type { VisualCoalesceInput, VisualWorkflowV3Definition } from "../schema/types";
import { compileVisualWorkflowV3Definition } from "./compile-workflow-v3";

const missingPolicy = {
  treatNullAsMissing: true,
  treatEmptyStringAsMissing: false,
  treatEmptyArrayAsMissing: false,
  treatEmptyObjectAsMissing: false,
};

function createDefinition(inputs: VisualCoalesceInput[]): VisualWorkflowV3Definition {
  return {
    schemaVersion: 3,
    name: "Coalesce compiler",
    nodes: [
      {
        id: "trigger",
        type: "trigger.manual",
        config: { kind: "trigger.manual" },
      },
      {
        id: "coalesce",
        type: "logic.coalesce",
        config: { kind: "logic.coalesce", inputs, ...missingPolicy },
      },
    ],
    edges: [
      {
        id: "execute",
        kind: "execution",
        source: "trigger",
        target: "coalesce",
        sourcePortId: "success",
        targetPortId: "input",
      },
    ],
    editor: { positions: { trigger: { x: 0, y: 0 }, coalesce: { x: 240, y: 0 } } },
  };
}

describe("Coalesce compiler", () => {
  it("compiles connected inputs as optional references", () => {
    const definition = createDefinition([
      { id: "primary", name: "Primary", type: "string" },
      { id: "fallback", name: "Fallback", type: "string", defaultValue: "en" },
    ]);
    definition.edges.push({
      id: "primary-data",
      kind: "data",
      source: "trigger",
      target: "coalesce",
      sourcePortId: "triggeredAt",
      targetPortId: "value.primary",
    });

    const compiled = compileVisualWorkflowV3Definition(definition);
    expect(compiled.issues).toEqual([]);
    expect(compiled.definition.nodes.find((node) => node.id === "coalesce")?.inputs).toEqual({
      "value.primary": {
        kind: "reference",
        nodeId: "trigger",
        path: ["triggeredAt"],
        optional: true,
      },
    });
  });

  it("keeps bindings attached to stable ids across rename and reorder", () => {
    const inputs: VisualCoalesceInput[] = [
      { id: "primary", name: "Primary", type: "string" },
      { id: "fallback", name: "Fallback", type: "string", defaultValue: "en" },
    ];
    const original = createDefinition(inputs);
    original.edges.push({
      id: "primary-data",
      kind: "data",
      source: "trigger",
      target: "coalesce",
      sourcePortId: "triggeredAt",
      targetPortId: "value.primary",
    });
    const edited = createDefinition([
      { ...inputs[1]!, name: "Default locale" },
      { ...inputs[0]!, name: "Requested locale" },
    ]);
    edited.edges.push(original.edges[1]!);

    for (const definition of [original, edited]) {
      const compiled = compileVisualWorkflowV3Definition(definition);
      expect(compiled.issues).toEqual([]);
      expect(
        compiled.definition.nodes.find((node) => node.id === "coalesce")?.inputs,
      ).toHaveProperty("value.primary");
    }
  });

  it("rejects incompatible concrete input types", () => {
    const definition = createDefinition([
      { id: "count", name: "Count", type: "number" },
      { id: "fallback", name: "Fallback", type: "number", defaultValue: 0 },
    ]);
    definition.edges.push({
      id: "wrong-type",
      kind: "data",
      source: "trigger",
      target: "coalesce",
      sourcePortId: "triggeredAt",
      targetPortId: "value.count",
    });

    expect(compileVisualWorkflowV3Definition(definition).issues).toContainEqual({
      code: "incompatible_data_types",
      edgeId: "wrong-type",
      nodeId: "coalesce",
    });
  });
});
