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
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { AuthVariables } from "@/api/auth/workos";

const mocks = vi.hoisted(() => ({
  decide: vi.fn(),
  enqueue: vi.fn(),
  enqueueActivity: vi.fn(),
  selectLimit: vi.fn(),
  updateReturning: vi.fn(),
}));

vi.mock("@/api/auth/workos", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/auth/workos")>();
  const { createMiddleware } = await import("hono/factory");

  return {
    ...actual,
    workosAuthMiddleware: createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
      c.set("auth", {
        user: {
          localUserId: "11111111-1111-4111-8111-111111111111",
          workosUserId: "user_test",
          email: "reviewer@example.com",
        },
        organization: {
          localOrganizationId: "22222222-2222-4222-8222-222222222222",
          workosOrganizationId: "org_test",
          name: "Test organization",
          slug: "test-organization",
          membership: { role: "reviewer" },
        },
      } as AuthVariables["auth"]);
      await next();
    }),
  };
});

vi.mock("@/lib/visual-workflows/human-approval-requests", () => ({
  decideAuthorizedHumanApprovalRequest: mocks.decide,
}));

vi.mock("@/lib/activity-log/visual-workflow-events", () => ({
  enqueueVisualWorkflowApprovalDecidedActivity: mocks.enqueueActivity,
}));

vi.mock("@/workflows/adapters", () => ({
  createVisualWorkflowExecutionQueue: () => ({ enqueue: mocks.enqueue }),
}));

vi.mock("@/lib/database/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/database/client")>();
  return {
    ...actual,
    db: {
      select: () => ({
        from: () => ({
          where: () => ({ limit: mocks.selectLimit }),
        }),
      }),
      update: () => ({
        set: () => ({
          where: () => ({ returning: mocks.updateReturning }),
        }),
      }),
    },
  };
});

import { createHumanApprovalRoutes } from "./human-approval.route";

const requestId = "33333333-3333-4333-8333-333333333333";
const runId = "44444444-4444-4444-8444-444444444444";
const workflowId = "55555555-5555-4555-8555-555555555555";

const app = new Hono().route("/workflow-approvals", createHumanApprovalRoutes());

describe("Human Approval routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.selectLimit.mockResolvedValue([{ id: runId, visualWorkflowId: workflowId }]);
    mocks.updateReturning.mockResolvedValue([{ id: runId }]);
    mocks.decide.mockResolvedValue({
      ok: true,
      value: {
        id: requestId,
        runId,
        nodeId: "approval-node",
        reviewerId: "11111111-1111-4111-8111-111111111111",
        status: "approved",
        commentReference: "comment-1",
        decidedAt: new Date("2026-10-28T10:00:00.000Z"),
      },
    });
  });

  it("records the decision and resumes the paused workflow", async () => {
    const response = await app.request(`/workflow-approvals/${requestId}/decision`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision: "approved", commentReference: "comment-1" }),
    });

    expect(response.status).toBe(200);
    expect(mocks.decide).toHaveBeenCalledWith({
      requestId,
      organizationId: "22222222-2222-4222-8222-222222222222",
      userId: "11111111-1111-4111-8111-111111111111",
      decision: "approved",
      commentReference: "comment-1",
    });
    expect(mocks.enqueueActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        approvalRequestId: requestId,
        decision: "approved",
        visualWorkflowId: workflowId,
      }),
    );
    expect(mocks.enqueue).toHaveBeenCalledWith({
      visualWorkflowRunId: runId,
      visualWorkflowId: workflowId,
      organizationId: "22222222-2222-4222-8222-222222222222",
    });
  });

  it("returns conflict for a replayed decision without enqueueing again", async () => {
    mocks.decide.mockResolvedValue({
      ok: false,
      error: { code: "approval_already_decided", status: "approved" },
    });

    const response = await app.request(`/workflow-approvals/${requestId}/decision`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision: "rejected" }),
    });

    expect(response.status).toBe(409);
    expect(mocks.enqueue).not.toHaveBeenCalled();
    expect(mocks.enqueueActivity).not.toHaveBeenCalled();
  });

  it("returns forbidden for an unauthorized reviewer", async () => {
    mocks.decide.mockResolvedValue({
      ok: false,
      error: { code: "approval_reviewer_forbidden" },
    });

    const response = await app.request(`/workflow-approvals/${requestId}/decision`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision: "approved" }),
    });

    expect(response.status).toBe(403);
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it("rejects malformed decision payloads", async () => {
    const response = await app.request(`/workflow-approvals/${requestId}/decision`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision: "maybe" }),
    });

    expect(response.status).toBe(400);
    expect(mocks.decide).not.toHaveBeenCalled();
  });
});
