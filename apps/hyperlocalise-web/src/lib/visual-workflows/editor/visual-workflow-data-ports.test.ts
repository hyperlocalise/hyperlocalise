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
import {
  getVisualWorkflowDataEdgeBinding,
  getVisualWorkflowDataPorts,
} from "./visual-workflow-data-ports";

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

describe("getVisualWorkflowDataPorts", () => {
  it("returns typed contract inputs and outputs", () => {
    const ports = getVisualWorkflowDataPorts({
      node: node("request", "action.http"),
      edges: [],
    });

    expect(ports.inputs).toEqual([
      {
        id: "url",
        label: "url",
        type: "string",
        optional: false,
        connectionCount: 0,
      },
      {
        id: "body",
        label: "body",
        type: "unknown",
        optional: true,
        connectionCount: 0,
      },
    ]);

    expect(ports.outputs).toContainEqual({
      id: "status",
      label: "status",
      type: "number",
      optional: false,
      connectionCount: 0,
    });

    expect(ports.outputs).toContainEqual({
      id: "ok",
      label: "ok",
      type: "boolean",
      optional: false,
      connectionCount: 0,
    });
  });

  it("returns dynamic Set ports without duplicates", () => {
    const ports = getVisualWorkflowDataPorts({
      node: node("set", "logic.set", {
        config: {
          kind: "logic.set",
          assignments: [
            { key: "status", value: "ready" },
            { key: "status", value: "complete" },
          ],
        },
        inputs: {
          status: { kind: "literal", value: "ready" },
          count: { kind: "literal", value: 1 },
        },
      }),
      edges: [],
    });

    expect(ports.inputs.map((port) => port.id)).toEqual(["status", "count"]);

    expect(ports.outputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "status",
          type: "string",
        }),
        expect.objectContaining({
          id: "count",
          type: "number",
        }),
      ]),
    );
  });

  it("counts only data-edge connections", () => {
    const edges: VisualWorkflowRfEdge[] = [
      {
        id: "data-edge",
        source: "trigger",
        target: "request",
        sourceHandle: "triggeredAt",
        targetHandle: "url",
        data: { kind: "data" },
      },
      {
        id: "execution-edge",
        source: "trigger",
        target: "request",
        sourceHandle: "success",
        targetHandle: "input",
        data: { kind: "execution" },
      },
    ];

    const requestPorts = getVisualWorkflowDataPorts({
      node: node("request", "action.http"),
      edges,
    });

    const triggerPorts = getVisualWorkflowDataPorts({
      node: node("trigger", "trigger.manual"),
      edges,
    });

    expect(requestPorts.inputs).toContainEqual(
      expect.objectContaining({
        id: "url",
        connectionCount: 1,
      }),
    );

    expect(triggerPorts.outputs).toContainEqual(
      expect.objectContaining({
        id: "triggeredAt",
        connectionCount: 1,
      }),
    );
  });

  it("includes declared custom output fields", () => {
    const ports = getVisualWorkflowDataPorts({
      node: node("agent", "ai.agent", {
        outputFields: [
          {
            path: "metadata.score",
            type: "number",
            optional: true,
          },
        ],
      }),
      edges: [],
    });

    expect(ports.outputs).toContainEqual({
      id: "metadata.score",
      label: "metadata.score",
      type: "number",
      optional: true,
      connectionCount: 0,
    });
  });

  it("does not expose an empty dynamic Set port", () => {
    const ports = getVisualWorkflowDataPorts({
      node: node("set", "logic.set"),
      edges: [],
    });

    expect(ports.inputs).toEqual([]);
    expect(ports.outputs).toEqual([]);
  });

  it("does not expose secret bindings as output ports", () => {
    const ports = getVisualWorkflowDataPorts({
      node: node("set", "logic.set", {
        inputs: {
          publicValue: {
            kind: "literal",
            value: "visible",
          },
          apiToken: {
            kind: "secret",
            credentialId: "00000000-0000-4000-8000-000000000001",
          },
        },
      }),
      edges: [],
    });

    expect(ports.outputs).toContainEqual(
      expect.objectContaining({
        id: "publicValue",
      }),
    );

    expect(ports.outputs).not.toContainEqual(
      expect.objectContaining({
        id: "apiToken",
      }),
    );
  });
});

describe("getVisualWorkflowDataEdgeBinding", () => {
  it("derives a reference binding from an incoming data edge", () => {
    const binding = getVisualWorkflowDataEdgeBinding({
      nodeId: "request",
      portId: "url",
      edges: [
        {
          id: "data-edge",
          source: "trigger",
          target: "request",
          sourceHandle: "payload.urls.0",
          targetHandle: "url",
          data: { kind: "data" },
        },
      ],
    });

    expect(binding).toEqual({
      kind: "reference",
      nodeId: "trigger",
      path: ["payload", "urls", 0],
    });
  });

  it("ignores execution edges", () => {
    const binding = getVisualWorkflowDataEdgeBinding({
      nodeId: "request",
      portId: "url",
      edges: [
        {
          id: "execution-edge",
          source: "trigger",
          target: "request",
          sourceHandle: "success",
          targetHandle: "url",
          data: { kind: "execution" },
        },
      ],
    });

    expect(binding).toBeUndefined();
  });

  it("returns undefined after the data edge is removed", () => {
    expect(
      getVisualWorkflowDataEdgeBinding({
        nodeId: "request",
        portId: "url",
        edges: [],
      }),
    ).toBeUndefined();
  });
});
