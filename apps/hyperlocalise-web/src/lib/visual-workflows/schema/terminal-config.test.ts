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
import type { VisualNodeConfig, VisualWorkflowV3Definition } from "./types";

function definition(config: VisualNodeConfig): VisualWorkflowV3Definition {
  return {
    schemaVersion: 3,
    name: "Terminal node",
    nodes: [{ id: "terminal", type: config.kind, config }],
    edges: [],
    editor: { positions: { terminal: { x: 0, y: 0 } } },
  };
}

describe("terminal node configuration", () => {
  it("accepts completed and cancelled Stop outcomes", () => {
    expect(
      visualWorkflowV3DefinitionSchema.safeParse(
        definition({ kind: "flow.stop", outcome: "completed" }),
      ).success,
    ).toBe(true);
    expect(
      visualWorkflowV3DefinitionSchema.safeParse(
        definition({ kind: "flow.stop", outcome: "cancelled", reason: "No work required" }),
      ).success,
    ).toBe(true);
  });

  it("accepts unique typed Return outputs", () => {
    expect(
      visualWorkflowV3DefinitionSchema.safeParse(
        definition({
          kind: "flow.return",
          outputs: [
            { id: "order-id", name: "orderId", type: "string" },
            { id: "item-count", name: "itemCount", type: "number" },
          ],
        }),
      ).success,
    ).toBe(true);
  });

  it("rejects duplicate Return output ids and names", () => {
    const result = visualWorkflowV3DefinitionSchema.safeParse(
      definition({
        kind: "flow.return",
        outputs: [
          { id: "result", name: "result", type: "string" },
          { id: "result", name: "result", type: "number" },
        ],
      }),
    );

    expect(result.success).toBe(false);
  });

  it("requires a stable uppercase Fail code and safe message", () => {
    expect(
      visualWorkflowV3DefinitionSchema.safeParse(
        definition({
          kind: "flow.fail",
          errorCode: "INVALID_ORDER",
          message: "The order cannot be processed",
        }),
      ).success,
    ).toBe(true);
    expect(
      visualWorkflowV3DefinitionSchema.safeParse(
        definition({ kind: "flow.fail", errorCode: "invalid-order", message: "Unsafe code" }),
      ).success,
    ).toBe(false);
  });

  it("rejects malformed names and terminal configuration limits", () => {
    expect(
      visualWorkflowV3DefinitionSchema.safeParse(
        definition({
          kind: "flow.return",
          outputs: [{ id: "bad-name", name: "not a valid name", type: "string" }],
        }),
      ).success,
    ).toBe(false);
    expect(
      visualWorkflowV3DefinitionSchema.safeParse(
        definition({
          kind: "flow.return",
          outputs: Array.from({ length: 33 }, (_, index) => ({
            id: `output-${index}`,
            name: `output${index}`,
            type: "unknown" as const,
          })),
        }),
      ).success,
    ).toBe(false);
    expect(
      visualWorkflowV3DefinitionSchema.safeParse(
        definition({ kind: "flow.stop", outcome: "cancelled", reason: "x".repeat(501) }),
      ).success,
    ).toBe(false);
  });

  it("round-trips Return stable IDs, types, values, and order", () => {
    const original: VisualWorkflowV3Definition = {
      schemaVersion: 3,
      name: "Return round trip",
      nodes: [
        { id: "trigger", type: "trigger.manual", config: { kind: "trigger.manual" } },
        {
          id: "return",
          type: "flow.return",
          config: {
            kind: "flow.return",
            outputs: [
              { id: "order-id", name: "orderId", type: "string" },
              { id: "accepted", name: "accepted", type: "boolean" },
            ],
          },
          inputs: {
            "value.order-id": { kind: "literal", value: "order-123" },
            "value.accepted": { kind: "literal", value: true },
          },
        },
      ],
      edges: [
        {
          id: "trigger-return",
          kind: "execution",
          source: "trigger",
          target: "return",
          sourcePortId: "success",
          targetPortId: "input",
        },
      ],
      editor: { positions: {} },
    };

    const roundTrip = toVisualWorkflowV3Definition(fromVisualWorkflowV3Definition(original));
    const returned = roundTrip.nodes.find((node) => node.id === "return");

    expect(returned?.config).toEqual(original.nodes[1]?.config);
    expect(returned?.inputs).toEqual(original.nodes[1]?.inputs);
    expect(roundTrip.edges).toEqual(original.edges);
  });
});
