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

import type { VisualSubworkflowField, VisualWorkflowV3Definition } from "../schema/types";
import {
  deriveReusableWorkflowContract,
  validateSubworkflowCalls,
  type ResolveSubworkflowVersion,
} from "./subworkflow-validation";

const inputFields: VisualSubworkflowField[] = [
  { id: "customerId", name: "customerId", type: "string", required: true },
];
const outputFields: VisualSubworkflowField[] = [
  { id: "result", name: "result", type: "object", required: true },
];

function reusableDefinition(
  calls: Array<{ workflowId: string; version?: number }> = [],
): VisualWorkflowV3Definition {
  return {
    schemaVersion: 3,
    name: "Reusable workflow",
    nodes: [
      {
        id: "trigger",
        type: "trigger.manual",
        config: { kind: "trigger.manual" },
        outputFields: [{ path: "customerId", type: "string" }],
      },
      ...calls.map(({ workflowId, version = 1 }, index) => ({
        id: `call-${index}`,
        type: "flow.call_workflow" as const,
        config: {
          kind: "flow.call_workflow" as const,
          workflowId,
          version,
          inputFields,
          outputFields,
        },
      })),
      {
        id: "return",
        type: "flow.return",
        config: {
          kind: "flow.return",
          outputs: outputFields.map(({ id, name, type }) => ({ id, name, type })),
        },
      },
    ],
    edges: [],
    editor: { positions: {} },
  };
}

function resolver(
  definitions: Record<string, VisualWorkflowV3Definition>,
): ResolveSubworkflowVersion {
  return async ({ workflowId, version }) => {
    const definition = definitions[`${workflowId}:${version}`];
    return definition
      ? { status: "found", workflowId, version, definition }
      : { status: "version_missing" };
  };
}

describe("subworkflow validation", () => {
  it("derives typed inputs and outputs from the immutable target definition", () => {
    expect(deriveReusableWorkflowContract(reusableDefinition())).toEqual({
      inputs: inputFields,
      outputs: outputFields,
    });
  });

  it("rejects non-manual workflows and workflows without a Return node", () => {
    const scheduled = reusableDefinition();
    scheduled.nodes[0] = {
      id: "trigger",
      type: "trigger.scheduled",
      config: {
        kind: "trigger.scheduled",
        schedule: { cadence: "daily", timezone: "UTC" },
      },
    };
    const withoutReturn = reusableDefinition();
    withoutReturn.nodes = withoutReturn.nodes.filter((node) => node.type !== "flow.return");

    expect(deriveReusableWorkflowContract(scheduled)).toBeNull();
    expect(deriveReusableWorkflowContract(withoutReturn)).toBeNull();
  });

  it("accepts a call pinned to an existing compatible version", async () => {
    const child = reusableDefinition();
    const parent = reusableDefinition([{ workflowId: "child" }]);

    await expect(
      validateSubworkflowCalls({
        definition: parent,
        workflowId: "parent",
        resolveVersion: resolver({ "child:1": child }),
      }),
    ).resolves.toEqual([]);
  });

  it.each([
    ["workflow_missing", "subworkflow_not_found"],
    ["version_missing", "subworkflow_version_not_found"],
    ["invalid_version", "subworkflow_contract_mismatch"],
  ] as const)("reports %s targets", async (status, code) => {
    const issues = await validateSubworkflowCalls({
      definition: reusableDefinition([{ workflowId: "child" }]),
      workflowId: "parent",
      resolveVersion: async () => ({ status }),
    });

    expect(issues).toContainEqual({ code, nodeId: "call-0" });
  });

  it("rejects a stale snapshotted contract", async () => {
    const parent = reusableDefinition([{ workflowId: "child" }]);
    const call = parent.nodes.find((node) => node.config.kind === "flow.call_workflow");
    if (call?.config.kind === "flow.call_workflow") call.config.inputFields[0]!.type = "number";

    const issues = await validateSubworkflowCalls({
      definition: parent,
      workflowId: "parent",
      resolveVersion: resolver({ "child:1": reusableDefinition() }),
    });

    expect(issues).toContainEqual({ code: "subworkflow_contract_mismatch", nodeId: "call-0" });
  });

  it("rejects direct and indirect recursion", async () => {
    const direct = await validateSubworkflowCalls({
      definition: reusableDefinition([{ workflowId: "parent" }]),
      workflowId: "parent",
      resolveVersion: resolver({ "parent:1": reusableDefinition() }),
    });
    const indirect = await validateSubworkflowCalls({
      definition: reusableDefinition([{ workflowId: "child" }]),
      workflowId: "parent",
      resolveVersion: resolver({
        "child:1": reusableDefinition([{ workflowId: "parent" }]),
        "parent:1": reusableDefinition(),
      }),
    });

    expect(direct).toContainEqual({ code: "recursive_subworkflow", nodeId: "call-0" });
    expect(indirect).toContainEqual({ code: "recursive_subworkflow", nodeId: "call-0" });
  });

  it("bounds nested calls", async () => {
    const issues = await validateSubworkflowCalls({
      definition: reusableDefinition([{ workflowId: "child" }]),
      workflowId: "parent",
      maxDepth: 2,
      resolveVersion: resolver({
        "child:1": reusableDefinition([{ workflowId: "grandchild" }]),
        "grandchild:1": reusableDefinition(),
      }),
    });

    expect(issues).toContainEqual({ code: "subworkflow_depth_exceeded", nodeId: "call-0" });
  });
});
