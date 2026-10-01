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

import { visualWorkflowV3DefinitionSchema } from "./definition-schema";
import { fromVisualWorkflowV3Definition, toVisualWorkflowV3Definition } from "./serializers";
import type { VisualWorkflowV3Definition } from "./types";

type SequenceOutput = { id: string; label: string };

const validOutputSets: Array<{ outputs: SequenceOutput[] }> = [
  { outputs: [] },
  { outputs: [{ id: "email", label: "Email" }] },
  {
    outputs: [
      { id: "email", label: "Email" },
      { id: "slack", label: "Slack" },
    ],
  },
];

function createDefinition(outputs: unknown) {
  return {
    schemaVersion: 3,
    name: "Sequence workflow",
    nodes: [
      {
        id: "sequence",
        type: "logic.sequence",
        config: {
          kind: "logic.sequence",
          outputs,
        },
      },
    ],
    edges: [],
    editor: {
      positions: {
        sequence: { x: 0, y: 0 },
      },
    },
  };
}

describe("logic.sequence configuration", () => {
  it.each(validOutputSets)("accepts zero, one, or many outputs", ({ outputs }) => {
    const result = visualWorkflowV3DefinitionSchema.safeParse(createDefinition(outputs));
    expect(result.success).toBe(true);
  });

  it("rejects duplicate stable output IDs", () => {
    expect(
      visualWorkflowV3DefinitionSchema.safeParse(
        createDefinition([
          { id: "same", label: "Email" },
          { id: "same", label: "Slack" },
        ]),
      ).success,
    ).toBe(false);
  });

  it("rejects an empty output label", () => {
    expect(
      visualWorkflowV3DefinitionSchema.safeParse(createDefinition([{ id: "email", label: "" }]))
        .success,
    ).toBe(false);
  });

  it("rejects more than 32 outputs", () => {
    const outputs = Array.from({ length: 33 }, (_, index) => ({
      id: `output-${index}`,
      label: `Output ${index + 1}`,
    }));

    expect(visualWorkflowV3DefinitionSchema.safeParse(createDefinition(outputs)).success).toBe(
      false,
    );
  });

  it("round-trips stable output IDs, order, and wires through editor state", () => {
    const definition: VisualWorkflowV3Definition = {
      schemaVersion: 3,
      name: "Sequence round trip",
      nodes: [
        {
          id: "sequence",
          type: "logic.sequence",
          config: {
            kind: "logic.sequence",
            outputs: [
              { id: "notify", label: "Notify" },
              { id: "audit", label: "Audit" },
            ],
          },
        },
        {
          id: "target",
          type: "logic.set",
          config: { kind: "logic.set", assignments: [] },
        },
      ],
      edges: [
        {
          id: "sequence-target",
          kind: "execution",
          source: "sequence",
          target: "target",
          sourcePortId: "audit",
          targetPortId: "input",
        },
      ],
      editor: { positions: {} },
    };

    const roundTrip = toVisualWorkflowV3Definition(fromVisualWorkflowV3Definition(definition));

    expect(roundTrip.nodes.find((node) => node.id === "sequence")?.config).toEqual(
      definition.nodes[0]?.config,
    );
    expect(roundTrip.edges).toEqual(definition.edges);
  });
});
