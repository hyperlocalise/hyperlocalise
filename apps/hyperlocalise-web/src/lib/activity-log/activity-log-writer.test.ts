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
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { start } from "workflow/api";

import type { ActivityLogEventInput } from "./activity-log-contract";
import { enqueueActivityLogEvent, enqueueActivityLogEvents } from "./activity-log-writer";

vi.mock("workflow/api", () => ({
  start: vi.fn(),
}));

const startMock = vi.mocked(start);

function workflowRun() {
  return { runId: "workflow-run-1" } as Awaited<ReturnType<typeof start>>;
}

function projectCreatedEvent(organizationId = "org-1"): ActivityLogEventInput {
  return {
    actorCredentialId: null,
    actorKind: "user",
    actorUserId: null,
    eventType: "project_created",
    organizationId,
    payload: {
      name: "Website",
      providerKind: "native",
      resourceId: "project-1",
    },
    targetId: "project-1",
    targetKind: "project",
  };
}

describe("enqueueActivityLogEvent", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("enqueues a serialized workflow event without writing to the database", async () => {
    startMock.mockResolvedValue(workflowRun());

    const result = await enqueueActivityLogEvent(projectCreatedEvent());

    expect(result).toMatchObject({ ok: true });
    expect(startMock).toHaveBeenCalledTimes(1);
    expect(startMock).toHaveBeenCalledWith(expect.anything(), [
      expect.objectContaining({
        createdAt: expect.any(String),
        eventType: "project_created",
        id: expect.any(String),
        organizationId: "org-1",
        targetId: "project-1",
      }),
    ]);
  });

  it("rejects unsafe payloads before enqueueing", async () => {
    const error = vi.fn();
    const input = {
      ...projectCreatedEvent(),
      payload: { secret: "must-not-leave-the-request" },
    } as unknown as ActivityLogEventInput;

    const result = await enqueueActivityLogEvent(input, {
      correlationId: "activity-log-test-validation",
      logger: { error },
    });

    expect(result).toEqual({ ok: false, error: { code: "activity_log_enqueue_failed" } });
    expect(startMock).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({
        correlationId: "activity-log-test-validation",
        failure: "payload_validation",
      }),
      "workspace activity log enqueue failed",
    );
    expect(JSON.stringify(error.mock.calls)).not.toContain("must-not-leave-the-request");
  });

  it("contains workflow enqueue failures and returns a safe typed error", async () => {
    startMock.mockRejectedValue(new Error("workflow infrastructure failure"));
    const error = vi.fn();

    const result = await enqueueActivityLogEvent(projectCreatedEvent(), {
      correlationId: "activity-log-test-workflow",
      logger: { error },
    });

    expect(result).toEqual({ ok: false, error: { code: "activity_log_enqueue_failed" } });
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({
        correlationId: "activity-log-test-workflow",
        failure: "workflow_enqueue",
      }),
      "workspace activity log enqueue failed",
    );
    expect(JSON.stringify(error.mock.calls)).not.toContain("workflow infrastructure failure");
  });

  it("enqueues multiple events with bounded fan-out", async () => {
    startMock.mockResolvedValue(workflowRun());

    const result = await enqueueActivityLogEvents([
      projectCreatedEvent("org-1"),
      projectCreatedEvent("org-2"),
    ]);

    expect(result).toHaveLength(2);
    expect(result.every((entry) => entry.ok)).toBe(true);
    expect(startMock).toHaveBeenCalledTimes(2);
  });
});
