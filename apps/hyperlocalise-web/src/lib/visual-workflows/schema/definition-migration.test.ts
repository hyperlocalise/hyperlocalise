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

import { parseVisualWorkflowV3Definition } from "./definition-migration";
import { visualWorkflowV3DefinitionSchema } from "./definition-schema";

const nodes = [
  { id: "trigger", type: "trigger.manual", config: { kind: "trigger.manual" } },
  {
    id: "set",
    type: "logic.set",
    config: { kind: "logic.set", assignments: [] },
    inputs: {
      value: { kind: "reference", nodeId: "trigger", path: ["triggeredAt"] },
    },
  },
];

const editor = { positions: { trigger: { x: 0, y: 0 }, set: { x: 240, y: 0 } } };

describe("visual workflow schema v3", () => {
  it("accepts discriminated execution and data edges", () => {
    const parsed = visualWorkflowV3DefinitionSchema.parse({
      schemaVersion: 3,
      name: "Edge kinds",
      nodes,
      edges: [
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
      ],
      editor,
    });

    expect(parsed.edges.map(({ kind }) => kind)).toEqual(["execution", "data"]);
  });

  it("rejects legacy handles and missing stable port IDs", () => {
    const parsed = visualWorkflowV3DefinitionSchema.safeParse({
      schemaVersion: 3,
      name: "Invalid v3",
      nodes,
      edges: [
        {
          id: "legacy",
          kind: "execution",
          source: "trigger",
          target: "set",
          sourceHandle: null,
          targetHandle: null,
        },
      ],
      editor,
    });

    expect(parsed.success).toBe(false);
  });
});

describe("parseVisualWorkflowV3Definition", () => {
  it("migrates v2 control edges to v3 execution edges and keeps bindings", () => {
    const definition = parseVisualWorkflowV3Definition({
      schemaVersion: 2,
      name: "Legacy workflow",
      nodes,
      edges: [
        {
          id: "edge",
          source: "trigger",
          target: "set",
          sourceHandle: null,
          targetHandle: null,
        },
      ],
      editor,
    });

    expect(definition.schemaVersion).toBe(3);
    expect(definition.edges).toEqual([
      {
        id: "edge",
        kind: "execution",
        source: "trigger",
        target: "set",
        sourcePortId: "success",
        targetPortId: "input",
      },
    ]);
    expect(definition.nodes[1]?.inputs).toEqual(nodes[1]?.inputs);
  });
});

it("returns an existing v3 definition without changing its edge kinds", () => {
  const input = {
    schemaVersion: 3,
    name: "Current workflow",
    nodes,
    edges: [
      {
        id: "data",
        kind: "data",
        source: "trigger",
        target: "set",
        sourcePortId: "triggeredAt",
        targetPortId: "value",
      },
    ],
    editor,
  };

  const definition = parseVisualWorkflowV3Definition(input);

  expect(definition).toEqual(input);
});

it("rejects malformed v2 definitions instead of partially migrating them", () => {
  expect(() =>
    parseVisualWorkflowV3Definition({
      schemaVersion: 2,
      name: "Malformed legacy workflow",
      nodes,
      edges: [
        {
          id: "missing-target",
          source: "trigger",
          sourceHandle: null,
          targetHandle: null,
        },
      ],
      editor,
    }),
  ).toThrow();
});
