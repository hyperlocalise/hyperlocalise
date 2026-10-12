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
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { CanonicalVisualWorkflowNode } from "../schema/types";

const mocks = vi.hoisted(() => ({
  createRun: vi.fn(),
  executeRun: vi.fn(),
}));

vi.mock("../visual-workflow-runs", () => ({
  createVisualWorkflowRun: mocks.createRun,
  executeVisualWorkflowRun: mocks.executeRun,
}));

import { executeSubworkflowNode } from "./execute-subworkflow-node";

const node: CanonicalVisualWorkflowNode = {
  id: "call-child",
  type: "flow.call_workflow",
  config: {
    kind: "flow.call_workflow",
    workflowId: "22222222-2222-4222-8222-222222222222",
    version: 7,
    inputFields: [{ id: "customer", name: "customerId", type: "string", required: true }],
    outputFields: [{ id: "result", name: "result", type: "object", required: true }],
    "value.customer": "customer-123",
  } as CanonicalVisualWorkflowNode["config"],
};

const childRun = {
  id: "33333333-3333-4333-8333-333333333333",
  visualWorkflowId: "22222222-2222-4222-8222-222222222222",
  traceId: "44444444-4444-4444-8444-444444444444",
  definitionVersion: 7,
};

describe("executeSubworkflowNode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createRun.mockResolvedValue(childRun);
  });

  it("pins the immutable version and propagates input, trace and idempotency", async () => {
    mocks.executeRun.mockResolvedValue({
      ...childRun,
      status: "succeeded",
      outputSummary: { returnedOutputs: { result: { accepted: true } } },
      error: null,
    });

    const result = await executeSubworkflowNode({
      node,
      organizationId: "organization",
      parentRunId: "11111111-1111-4111-8111-111111111111",
      traceId: childRun.traceId,
      iteration: 2,
    });

    expect(mocks.createRun).toHaveBeenCalledWith(
      expect.objectContaining({
        immutableDefinitionVersion: 7,
        inputSnapshot: { customerId: "customer-123" },
        parentRunId: "11111111-1111-4111-8111-111111111111",
        parentNodeId: "call-child",
        traceId: childRun.traceId,
        idempotencyKey: "subworkflow:11111111-1111-4111-8111-111111111111:call-child:2",
        enqueue: false,
      }),
    );
    expect(result).toEqual({
      ok: true,
      output: {
        value: { result: { accepted: true } },
        childRunId: childRun.id,
        traceId: childRun.traceId,
        definitionVersion: 7,
      },
    });
  });

  it("durably yields while the child is paused", async () => {
    mocks.executeRun.mockResolvedValue({
      ...childRun,
      status: "running",
      executionPausedUntil: "2026-10-13T00:00:00.000Z",
    });

    await expect(
      executeSubworkflowNode({
        node,
        organizationId: "organization",
        parentRunId: "parent",
        traceId: childRun.traceId,
      }),
    ).resolves.toEqual({
      ok: false,
      error: {
        code: "yield_execution",
        message: "The child workflow is still running.",
        wakeAt: "2026-10-13T00:00:00.000Z",
      },
    });
  });

  it.each([
    ["failed", "CHILD_FAILED"],
    ["needs_attention", "needs_attention"],
    ["cancelled", "cancelled"],
  ])("propagates a %s child outcome", async (status, expectedCode) => {
    mocks.executeRun.mockResolvedValue({
      ...childRun,
      status,
      outputSummary: {},
      error: {
        code: status === "failed" ? "CHILD_FAILED" : status,
        message: "Child did not complete.",
      },
    });

    const result = await executeSubworkflowNode({
      node,
      organizationId: "organization",
      parentRunId: "parent",
      traceId: childRun.traceId,
    });

    expect(result).toEqual({
      ok: false,
      error: { code: expectedCode, message: "Child did not complete." },
    });
  });
});
