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
import type { VisualWorkflowRfEdge, VisualWorkflowRfNode } from "../schema/types";
import { validateVisualWorkflowConnection } from "./validate-connection";

function node(
  id: string,
  type: VisualWorkflowRfNode["data"]["catalogType"],
  data: Partial<VisualWorkflowRfNode["data"]> = {},
): VisualWorkflowRfNode {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data: {
      catalogType: type,
      config: createDefaultConfig(type),
      runStatus: "idle",
      ...data,
    },
  };
}

function executionEdge(
  id: string,
  source: string,
  target: string,
  sourceHandle = "success",
): VisualWorkflowRfEdge {
  return {
    id,
    source,
    target,
    sourceHandle,
    targetHandle: "input",
    data: {
      kind: "execution",
    },
  };
}

const trigger = node("trigger", "trigger.manual");
const set = node("set", "logic.set");
const request = node("request", "action.http");

describe("validateVisualWorkflowConnection", () => {
  it.each([
    {
      name: "accepts an execution connection",
      nodes: [trigger, set],
      edges: [],
      connection: {
        source: "trigger",
        target: "set",
        sourceHandle: "success",
        targetHandle: "input",
      },
      expectedKind: "execution",
    },
    {
      name: "accepts a compatible data connection",
      nodes: [trigger, request],
      edges: [
        {
          id: "trigger-request",
          source: "trigger",
          target: "request",
          sourceHandle: "success",
          targetHandle: "input",
          data: { kind: "execution" as const },
        },
      ],
      connection: {
        source: "trigger",
        target: "request",
        sourceHandle: "triggeredAt",
        targetHandle: "url",
      },
      expectedKind: "data",
    },
  ])("$name", ({ nodes, edges, connection, expectedKind }) => {
    const result = validateVisualWorkflowConnection({
      nodes,
      edges,
      connection,
    });

    expect(result).toMatchObject({
      valid: true,
      edgeKind: expectedKind,
    });
  });

  it.each([
    {
      name: "rejects a connection without an endpoint",
      nodes: [trigger, set],
      edges: [],
      connection: {
        source: "trigger",
        target: null,
        sourceHandle: "success",
        targetHandle: "input",
      },
      expectedCode: "missing_endpoint",
    },
    {
      name: "rejects a self connection",
      nodes: [set],
      edges: [],
      connection: {
        source: "set",
        target: "set",
        sourceHandle: "success",
        targetHandle: "input",
      },
      expectedCode: "self_connection",
    },
    {
      name: "rejects an execution connection into a trigger",
      nodes: [trigger, set],
      edges: [],
      connection: {
        source: "set",
        target: "trigger",
        sourceHandle: "success",
        targetHandle: "input",
      },
      expectedCode: "invalid_target_port",
    },
    {
      name: "rejects a data port used as an execution source",
      nodes: [trigger, set],
      edges: [],
      connection: {
        source: "trigger",
        target: "set",
        sourceHandle: "triggeredAt",
        targetHandle: "input",
      },
      expectedCode: "invalid_source_port",
    },
  ])("$name", ({ nodes, edges, connection, expectedCode }) => {
    const result = validateVisualWorkflowConnection({
      nodes,
      edges,
      connection,
    });

    expect(result).toMatchObject({
      valid: false,
      code: expectedCode,
    });
  });

  it("rejects incompatible concrete data types", () => {
    const numberSource = node("number-source", "logic.set", {
      outputFields: [
        {
          path: "count",
          type: "number",
        },
      ],
    });

    const result = validateVisualWorkflowConnection({
      nodes: [numberSource, request],
      edges: [],
      connection: {
        source: "number-source",
        target: "request",
        sourceHandle: "count",
        targetHandle: "url",
      },
    });

    expect(result).toMatchObject({
      valid: false,
      code: "incompatible_data_types",
      sourcePortId: "count",
      targetPortId: "url",
    });
  });

  it("rejects a second data source for the same target port", () => {
    const edges: VisualWorkflowRfEdge[] = [
      {
        id: "existing-data",
        source: "trigger",
        target: "request",
        sourceHandle: "triggeredAt",
        targetHandle: "url",
        data: {
          kind: "data",
        },
      },
    ];

    const secondSource = node("second-trigger", "trigger.manual");

    const result = validateVisualWorkflowConnection({
      nodes: [trigger, secondSource, request],
      edges,
      connection: {
        source: "second-trigger",
        target: "request",
        sourceHandle: "triggeredAt",
        targetHandle: "url",
      },
    });

    expect(result).toMatchObject({
      valid: false,
      code: "target_already_connected",
      targetPortId: "url",
    });
  });

  it("rejects an execution connection that creates a cycle", () => {
    const first = node("first", "logic.set");
    const second = node("second", "logic.set");

    const edges: VisualWorkflowRfEdge[] = [
      {
        id: "first-second",
        source: "first",
        target: "second",
        sourceHandle: "success",
        targetHandle: "input",
        data: {
          kind: "execution",
        },
      },
    ];

    const result = validateVisualWorkflowConnection({
      nodes: [first, second],
      edges,
      connection: {
        source: "second",
        target: "first",
        sourceHandle: "success",
        targetHandle: "input",
      },
    });

    expect(result).toMatchObject({
      valid: false,
      code: "execution_cycle",
    });
  });

  it("ignores the replaced edge when validating reconnection", () => {
    const edges: VisualWorkflowRfEdge[] = [
      {
        id: "existing-data",
        source: "trigger",
        target: "request",
        sourceHandle: "triggeredAt",
        targetHandle: "url",
        data: {
          kind: "data",
        },
      },
    ];

    const result = validateVisualWorkflowConnection({
      nodes: [trigger, request],
      edges: [
        ...edges,
        {
          id: "trigger-request",
          source: "trigger",
          target: "request",
          sourceHandle: "success",
          targetHandle: "input",
          data: { kind: "execution" },
        },
      ],
      replacingEdgeId: "existing-data",
      connection: {
        source: "trigger",
        target: "request",
        sourceHandle: "triggeredAt",
        targetHandle: "url",
      },
    });

    expect(result).toMatchObject({
      valid: true,
      edgeKind: "data",
    });
  });

  it("recomputes loop membership after removing the replaced edge", () => {
    const loop = node("loop", "logic.for_each", {
      bodyNodeIds: ["body"],
    });
    const outside = node("outside", "logic.set");
    const body = node("body", "logic.set");
    const edges: VisualWorkflowRfEdge[] = [
      {
        id: "loop-body",
        source: "loop",
        target: "body",
        sourceHandle: "each",
        targetHandle: "input",
        data: {
          kind: "execution",
        },
      },
    ];

    const result = validateVisualWorkflowConnection({
      nodes: [loop, outside, body],
      edges,
      replacingEdgeId: "loop-body",
      connection: {
        source: "outside",
        target: "body",
        sourceHandle: "success",
        targetHandle: "input",
      },
    });

    expect(result).toMatchObject({
      valid: true,
      edgeKind: "execution",
    });
  });
});

it("allows execution fan-out from one source", () => {
  const first = node("first", "logic.set");
  const second = node("second", "logic.set");

  const edges: VisualWorkflowRfEdge[] = [
    {
      id: "trigger-first",
      source: "trigger",
      target: "first",
      sourceHandle: "success",
      targetHandle: "input",
      data: {
        kind: "execution",
      },
    },
  ];

  const result = validateVisualWorkflowConnection({
    nodes: [trigger, first, second],
    edges,
    connection: {
      source: "trigger",
      target: "second",
      sourceHandle: "success",
      targetHandle: "input",
    },
  });

  expect(result).toMatchObject({
    valid: true,
    edgeKind: "execution",
  });
});

it("allows multiple execution paths to join the same node", () => {
  const first = node("first", "logic.set");
  const second = node("second", "logic.set");
  const target = node("target", "logic.set");

  const edges: VisualWorkflowRfEdge[] = [
    {
      id: "first-target",
      source: "first",
      target: "target",
      sourceHandle: "success",
      targetHandle: "input",
      data: {
        kind: "execution",
      },
    },
  ];

  const result = validateVisualWorkflowConnection({
    nodes: [first, second, target],
    edges,
    connection: {
      source: "second",
      target: "target",
      sourceHandle: "success",
      targetHandle: "input",
    },
  });

  expect(result).toMatchObject({
    valid: true,
    edgeKind: "execution",
  });
});

it("allows an explicitly configured error route", () => {
  const http = node("http", "action.http", {
    config: {
      kind: "action.http",
      method: "GET",
      url: "https://example.test",
      onError: "branch",
    },
  });

  const result = validateVisualWorkflowConnection({
    nodes: [http, set],
    edges: [],
    connection: {
      source: "http",
      target: "set",
      sourceHandle: "error",
      targetHandle: "input",
    },
  });

  expect(result).toMatchObject({
    valid: true,
    edgeKind: "execution",
  });
});

it("allows a compatible optional data input", () => {
  const result = validateVisualWorkflowConnection({
    nodes: [trigger, request],
    edges: [
      {
        id: "trigger-request",
        source: "trigger",
        target: "request",
        sourceHandle: "success",
        targetHandle: "input",
        data: { kind: "execution" },
      },
    ],
    connection: {
      source: "trigger",
      target: "request",
      sourceHandle: "triggeredAt",
      targetHandle: "body",
    },
  });

  expect(result).toMatchObject({
    valid: true,
    edgeKind: "data",
  });
});

it("rejects entering a For Each body from outside the loop", () => {
  const loop = node("loop", "logic.for_each");
  const outside = node("outside", "logic.set");
  const body = node("body", "logic.set");

  const result = validateVisualWorkflowConnection({
    nodes: [loop, outside, body],
    edges: [executionEdge("loop-body", "loop", "body", "each")],
    connection: {
      source: "outside",
      target: "body",
      sourceHandle: "success",
      targetHandle: "input",
    },
  });

  expect(result).toMatchObject({
    valid: false,
    code: "loop_boundary",
  });
});

it("allows connections between nodes in the same For Each body", () => {
  const loop = node("loop", "logic.for_each");
  const first = node("first", "logic.set");
  const second = node("second", "logic.set");

  const result = validateVisualWorkflowConnection({
    nodes: [loop, first, second],
    edges: [
      executionEdge("loop-first", "loop", "first", "each"),
      executionEdge("loop-second", "loop", "second", "each"),
    ],
    connection: {
      source: "first",
      target: "second",
      sourceHandle: "success",
      targetHandle: "input",
    },
  });

  expect(result).toMatchObject({
    valid: true,
    edgeKind: "execution",
  });
});

it("rejects connecting a loop body back to its owner", () => {
  const loop = node("loop", "logic.for_each");
  const body = node("body", "logic.set");

  const result = validateVisualWorkflowConnection({
    nodes: [loop, body],
    edges: [executionEdge("loop-body", "loop", "body", "each")],
    connection: {
      source: "body",
      target: "loop",
      sourceHandle: "success",
      targetHandle: "input",
    },
  });

  expect(result).toMatchObject({
    valid: false,
    code: "loop_boundary",
  });
});

it("rejects nested For Each loop regions", () => {
  const outer = node("outer", "logic.for_each");
  const inner = node("inner", "logic.for_each");

  const result = validateVisualWorkflowConnection({
    nodes: [outer, inner],
    edges: [],
    connection: {
      source: "outer",
      target: "inner",
      sourceHandle: "each",
      targetHandle: "input",
    },
  });

  expect(result).toMatchObject({
    valid: false,
    code: "loop_boundary",
  });
});

it("rejects a For Each reached from an existing loop body", () => {
  const outer = node("outer", "logic.for_each");
  const body = node("body", "logic.set");
  const inner = node("inner", "logic.for_each");

  const result = validateVisualWorkflowConnection({
    nodes: [outer, body, inner],
    edges: [executionEdge("outer-body", "outer", "body", "each")],
    connection: {
      source: "body",
      target: "inner",
      sourceHandle: "success",
      targetHandle: "input",
    },
  });

  expect(result).toMatchObject({
    valid: false,
    code: "loop_boundary",
  });
});

it.each([
  {
    name: "downstream",
    executionSource: "target",
    executionTarget: "source",
  },
  {
    name: "unrelated",
    executionSource: "trigger",
    executionTarget: "target",
  },
])("rejects a $name node as a data source", ({ executionSource, executionTarget }) => {
  const source = node("source", "logic.set", {
    outputFields: [{ path: "value", type: "string" }],
  });
  const target = node("target", "action.http");
  const edges: VisualWorkflowRfEdge[] = [
    {
      id: "execution",
      source: executionSource,
      target: executionTarget,
      sourceHandle: "success",
      targetHandle: "input",
      data: { kind: "execution" },
    },
  ];

  const result = validateVisualWorkflowConnection({
    nodes: [trigger, source, target],
    edges,
    connection: {
      source: "source",
      target: "target",
      sourceHandle: "value",
      targetHandle: "url",
    },
  });

  expect(result).toMatchObject({
    valid: false,
    code: "invalid_data_source",
    sourcePortId: "value",
    targetPortId: "url",
  });
});
