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
import { getWorkflowInputFields, getWorkflowOutputFields } from "../catalog/node-contracts";
import { visualWorkflowV3DefinitionSchema } from "./definition-schema";
import { fromVisualWorkflowV3Definition, toVisualWorkflowV3Definition } from "./serializers";
import type { CanonicalVisualWorkflowNode, VisualNodeConfig, VisualWorkflowV3Edge } from "./types";

const workflowId = "00000000-0000-4000-8000-000000000001";

function definition(config: VisualNodeConfig) {
  return {
    schemaVersion: 3 as const,
    name: "Call workflow contract",
    nodes: [
      {
        id: "trigger",
        type: "trigger.manual" as const,
        config: { kind: "trigger.manual" as const },
      },
      { id: "call", type: "flow.call_workflow" as const, config },
    ],
    edges: [
      {
        id: "trigger-call",
        kind: "execution" as const,
        source: "trigger",
        target: "call",
        sourcePortId: "success",
        targetPortId: "input",
      },
    ],
    editor: { positions: { trigger: { x: 0, y: 0 }, call: { x: 240, y: 0 } } },
  };
}

describe("flow.call_workflow configuration", () => {
  it("creates an unconfigured pinned-version node", () => {
    expect(createDefaultConfig("flow.call_workflow")).toEqual({
      kind: "flow.call_workflow",
      workflowId: "",
      version: 1,
      inputFields: [],
      outputFields: [],
      onError: "stop",
    });
  });

  it("accepts stable typed input and output contracts", () => {
    const result = visualWorkflowV3DefinitionSchema.safeParse(
      definition({
        kind: "flow.call_workflow",
        workflowId,
        version: 7,
        inputFields: [
          { id: "customer-id", name: "customerId", type: "string" },
          { id: "metadata", name: "metadata", type: "object", required: false },
        ],
        outputFields: [{ id: "result", name: "result", type: "object" }],
        onError: "branch",
      }),
    );

    expect(result.success).toBe(true);
  });

  it("rejects missing versions and duplicate stable field IDs or names", () => {
    const result = visualWorkflowV3DefinitionSchema.safeParse(
      definition({
        kind: "flow.call_workflow",
        workflowId,
        version: 0,
        inputFields: [
          { id: "same", name: "first", type: "string" },
          { id: "same", name: "first", type: "number" },
        ],
        outputFields: [],
      }),
    );

    expect(result.success).toBe(false);
  });

  it("exposes data ports by stable field ID independently of display names", () => {
    const node: CanonicalVisualWorkflowNode = {
      id: "call",
      type: "flow.call_workflow",
      config: {
        kind: "flow.call_workflow",
        workflowId,
        version: 3,
        inputFields: [{ id: "customer-id", name: "Renamed customer", type: "string" }],
        outputFields: [{ id: "result-id", name: "Renamed result", type: "object" }],
      },
    };

    expect(getWorkflowInputFields(node)).toEqual([
      { name: "value.customer-id", type: "string", required: true },
    ]);
    expect(getWorkflowOutputFields(node)).toContainEqual({
      path: "value.result-id",
      type: "object",
      optional: false,
    });
  });

  it("round-trips the pinned version, contract and data bindings through the editor serializer", () => {
    const base = definition({
      kind: "flow.call_workflow",
      workflowId,
      version: 7,
      inputFields: [{ id: "customer-id", name: "customerId", type: "string" }],
      outputFields: [{ id: "result-id", name: "result", type: "object" }],
      onError: "branch",
    });
    const dataEdge: VisualWorkflowV3Edge = {
      id: "customer-binding",
      kind: "data",
      source: "trigger",
      target: "call",
      sourcePortId: "customerId",
      targetPortId: "value.customer-id",
    };
    const original = { ...base, edges: [...base.edges, dataEdge] };

    const parsed = visualWorkflowV3DefinitionSchema.parse(original);
    const serialized = toVisualWorkflowV3Definition(fromVisualWorkflowV3Definition(parsed));
    const call = serialized.nodes.find((node) => node.id === "call");

    expect(call?.config).toEqual(original.nodes[1]?.config);
    expect(serialized.edges).toContainEqual(original.edges[1]);
  });
});
