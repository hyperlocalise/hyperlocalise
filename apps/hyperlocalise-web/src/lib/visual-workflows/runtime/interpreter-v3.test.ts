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
import { parseVisualWorkflowV3Definition } from "../schema/definition-migration";
import { runVisualWorkflowV3Interpreter } from "./interpreter-v3";
import type { VisualWorkflowV3Definition, VisualWorkflowV3Edge } from "../schema/types";

function definition(edges: VisualWorkflowV3Edge[]): VisualWorkflowV3Definition {
  return {
    schemaVersion: 3,
    name: "V3 interpreter",
    nodes: [
      {
        id: "trigger",
        type: "trigger.manual",
        config: {
          kind: "trigger.manual",
        },
      },
      {
        id: "set",
        type: "logic.set",
        config: {
          kind: "logic.set",
          assignments: [],
        },
      },
    ],
    edges,
    editor: {
      positions: {
        trigger: { x: 0, y: 0 },
        set: { x: 240, y: 0 },
      },
    },
  };
}

const executionEdge: VisualWorkflowV3Edge = {
  id: "execution",
  kind: "execution",
  source: "trigger",
  target: "set",
  sourcePortId: "success",
  targetPortId: "input",
};

const dataEdge: VisualWorkflowV3Edge = {
  id: "data",
  kind: "data",
  source: "trigger",
  target: "set",
  sourcePortId: "triggeredAt",
  targetPortId: "value",
};

describe("runVisualWorkflowV3Interpreter", () => {
  it("uses a data edge as a binding when an execution edge schedules the target", async () => {
    const result = await runVisualWorkflowV3Interpreter({
      definition: definition([executionEdge, dataEdge]),
      organizationId: "00000000-0000-4000-8000-000000000001",
      triggerInput: {
        triggeredAt: "2026-09-22T00:00:00.000Z",
      },
    });

    expect(result.ok).toBe(true);
    expect(result.nodeResults.set).toEqual({
      value: "2026-09-22T00:00:00.000Z",
    });
  });

  it("does not schedule a target connected only by a data edge", async () => {
    const result = await runVisualWorkflowV3Interpreter({
      definition: definition([dataEdge]),
      organizationId: "00000000-0000-4000-8000-000000000001",
      triggerInput: {
        triggeredAt: "2026-09-22T00:00:00.000Z",
      },
    });

    expect(result.ok).toBe(false);
    expect(result.nodeResults.set).toBeUndefined();

    if (result.ok) {
      throw new Error("expected the data-only workflow to fail validation");
    }

    expect(result.error).toMatchObject({
      code: "invalid_graph",
    });
  });
});

it("runs a migrated v2 workflow through the v3 execution path", async () => {
  const migrated = parseVisualWorkflowV3Definition({
    schemaVersion: 2,
    name: "Legacy workflow",
    nodes: [
      {
        id: "trigger",
        type: "trigger.manual",
        config: {
          kind: "trigger.manual",
        },
      },
      {
        id: "set",
        type: "logic.set",
        config: {
          kind: "logic.set",
          assignments: [
            {
              key: "message",
              value: "migrated",
            },
          ],
        },
      },
    ],
    edges: [
      {
        id: "legacy-execution",
        source: "trigger",
        target: "set",
        sourceHandle: null,
        targetHandle: null,
      },
    ],
    editor: {
      positions: {
        trigger: { x: 0, y: 0 },
        set: { x: 240, y: 0 },
      },
    },
  });

  const result = await runVisualWorkflowV3Interpreter({
    definition: migrated,
    organizationId: "00000000-0000-4000-8000-000000000001",
    triggerInput: {
      triggeredAt: "2026-09-22T00:00:00.000Z",
    },
  });

  expect(result.ok).toBe(true);
  expect(result.nodeResults.set).toEqual({
    message: "migrated",
  });
});
