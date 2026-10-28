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
  createRequest: vi.fn(),
  getRequest: vi.fn(),
  timeoutRequest: vi.fn(),
  enqueueRequestedActivity: vi.fn(),
}));

vi.mock("@/lib/activity-log/visual-workflow-events", () => ({
  enqueueVisualWorkflowApprovalRequestedActivity: mocks.enqueueRequestedActivity,
}));

vi.mock("../human-approval-requests", () => ({
  createHumanApprovalRequest: mocks.createRequest,
  getHumanApprovalRequestByNodeRun: mocks.getRequest,
  timeoutHumanApprovalRequest: mocks.timeoutRequest,
}));

import { executeHumanApprovalNode } from "./execute-human-approval-node";

const expiresAt = new Date("2026-11-01T10:00:00.000Z");
const decidedAt = new Date("2026-10-31T10:00:00.000Z");

const humanApprovalConfig: Extract<
  CanonicalVisualWorkflowNode["config"],
  { kind: "flow.human_approval" }
> = {
  kind: "flow.human_approval",
  reviewerType: "user",
  reviewerId: "user-1",
  prompt: "Approve the release",
  artifactReference: "artifact://release",
  jobReference: "job-1",
  deadline: expiresAt.toISOString(),
};

const node: CanonicalVisualWorkflowNode = {
  id: "approval",
  type: "flow.human_approval",
  config: humanApprovalConfig,
};

function request(
  status: "pending" | "approved" | "rejected" | "changes_requested" | "timed_out" | "cancelled",
) {
  return {
    id: "request-1",
    organizationId: "organization-1",
    runId: "run-1",
    nodeRunId: "node-run-1",
    nodeId: "approval",
    reviewerType: "user",
    reviewerId: "user-1",
    status,
    expiresAt,
    interactionId: "interaction-1",
    decidedByUserId: status === "pending" ? null : "user-2",
    commentReference: status === "pending" ? null : "comment-1",
    decidedAt: status === "pending" ? null : decidedAt,
  };
}

function execute(now = new Date("2026-10-30T10:00:00.000Z")) {
  return executeHumanApprovalNode({
    node,
    organizationId: "organization-1",
    runId: "run-1",
    nodeRunId: "node-run-1",
    visualWorkflowId: "workflow-1",
    now,
  });
}

describe("executeHumanApprovalNode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates one durable request and yields until its deadline", async () => {
    mocks.getRequest.mockResolvedValue(null);
    mocks.createRequest.mockResolvedValue({ ok: true, value: request("pending") });

    await expect(execute()).resolves.toEqual({
      ok: false,
      error: {
        code: "yield_execution",
        message: "The workflow is waiting for a human approval decision.",
        approvalRequestId: "request-1",
        wakeAt: expiresAt.toISOString(),
      },
    });

    expect(mocks.createRequest).toHaveBeenCalledWith({
      organizationId: "organization-1",
      runId: "run-1",
      nodeRunId: "node-run-1",
      nodeId: "approval",
      reviewerType: "user",
      reviewerId: "user-1",
      prompt: "Approve the release",
      artifactReference: "artifact://release",
      jobReference: "job-1",
      expiresAt,
    });
    expect(mocks.enqueueRequestedActivity).toHaveBeenCalledWith({
      approvalRequestId: "request-1",
      nodeId: "approval",
      organizationId: "organization-1",
      reviewerType: "user",
      runId: "run-1",
      visualWorkflowId: "workflow-1",
    });
  });

  it("rejects a missing or malformed deadline before creating a request", async () => {
    await expect(
      executeHumanApprovalNode({
        node: {
          ...node,
          config: { ...humanApprovalConfig, deadline: "not-a-date" },
        },
        organizationId: "organization-1",
        runId: "run-1",
        nodeRunId: "node-run-1",
        visualWorkflowId: "workflow-1",
      }),
    ).resolves.toEqual({
      ok: false,
      error: {
        code: "invalid_approval_deadline",
        message: "Human Approval requires a valid deadline.",
      },
    });
    expect(mocks.createRequest).not.toHaveBeenCalled();
  });

  it("returns a stable error when durable request creation fails", async () => {
    mocks.getRequest.mockResolvedValue(null);
    mocks.createRequest.mockResolvedValue({
      ok: false,
      error: { code: "approval_node_run_not_found" },
    });

    await expect(execute()).resolves.toEqual({
      ok: false,
      error: {
        code: "approval_node_run_not_found",
        message: "The Human Approval request could not be created.",
      },
    });
    expect(mocks.enqueueRequestedActivity).not.toHaveBeenCalled();
  });

  it("reuses an existing pending request when the durable slice resumes", async () => {
    mocks.getRequest.mockResolvedValue(request("pending"));

    await expect(execute()).resolves.toMatchObject({
      ok: false,
      error: { code: "yield_execution", approvalRequestId: "request-1" },
    });
    expect(mocks.createRequest).not.toHaveBeenCalled();
    expect(mocks.enqueueRequestedActivity).not.toHaveBeenCalled();
  });

  it.each(["approved", "rejected", "changes_requested", "timed_out"] as const)(
    "returns output and selects the %s branch",
    async (status) => {
      mocks.getRequest.mockResolvedValue(request(status));

      await expect(execute()).resolves.toEqual({
        ok: true,
        switchCase: status,
        output: {
          reviewerId: "user-1",
          decision: status,
          commentReference: "comment-1",
          decidedAt: decidedAt.toISOString(),
        },
      });
    },
  );

  it("atomically times out a pending request at its deadline", async () => {
    mocks.getRequest.mockResolvedValue(request("pending"));
    mocks.timeoutRequest.mockResolvedValue(request("timed_out"));

    await expect(execute(expiresAt)).resolves.toMatchObject({
      ok: true,
      switchCase: "timed_out",
      output: { decision: "timed_out" },
    });
    expect(mocks.timeoutRequest).toHaveBeenCalledWith({
      organizationId: "organization-1",
      requestId: "request-1",
      now: expiresAt,
    });
  });

  it("propagates cancellation instead of selecting an approval branch", async () => {
    mocks.getRequest.mockResolvedValue(request("cancelled"));

    await expect(execute()).resolves.toEqual({
      ok: false,
      error: {
        code: "cancelled",
        message: "The Human Approval request was cancelled.",
      },
    });
  });
});
