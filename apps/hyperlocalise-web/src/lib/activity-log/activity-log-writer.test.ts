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

import type { ActivityLogEventInput } from "./activity-log-contract";
import { enqueueActivityLogEvent, enqueueActivityLogEvents } from "./activity-log-writer";

const { sendMock } = vi.hoisted(() => ({
  sendMock: vi.fn(),
}));

vi.mock("@aws-sdk/client-sqs", () => ({
  SendMessageCommand: class {
    constructor(input: unknown) {
      Object.assign(this, input);
    }
  },
  SQSClient: class {
    send(input: unknown) {
      return sendMock(input);
    }
  },
}));

vi.mock("@/lib/env", () => ({
  env: {
    ACTIVITY_LOG_SQS_QUEUE_URL: "https://sqs.test.local/queue/activity-log",
    AWS_REGION: "us-east-1",
  },
}));

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

  it("enqueues a serialized SQS event without writing to the database", async () => {
    sendMock.mockResolvedValue({ MessageId: "message-1" });

    const result = await enqueueActivityLogEvent(projectCreatedEvent());

    expect(result).toMatchObject({ ok: true });
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock).toHaveBeenCalledWith({
      MessageBody: expect.any(String),
      QueueUrl: "https://sqs.test.local/queue/activity-log",
    });
    expect(JSON.parse(sendMock.mock.calls[0][0].MessageBody)).toEqual({
      event: expect.objectContaining({
        createdAt: expect.any(String),
        eventType: "project_created",
        id: expect.any(String),
        organizationId: "org-1",
        targetId: "project-1",
      }),
      messageType: "activity_log",
      schemaVersion: 1,
    });
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
    expect(sendMock).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({
        correlationId: "activity-log-test-validation",
        failure: "payload_validation",
      }),
      "workspace activity log enqueue failed",
    );
    expect(JSON.stringify(error.mock.calls)).not.toContain("must-not-leave-the-request");
  });

  it("contains SQS enqueue failures and returns a safe typed error", async () => {
    sendMock.mockRejectedValue(new Error("SQS infrastructure failure"));
    const error = vi.fn();

    const result = await enqueueActivityLogEvent(projectCreatedEvent(), {
      correlationId: "activity-log-test-sqs",
      logger: { error },
    });

    expect(result).toEqual({ ok: false, error: { code: "activity_log_enqueue_failed" } });
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({
        correlationId: "activity-log-test-sqs",
        failure: "sqs_enqueue",
      }),
      "workspace activity log enqueue failed",
    );
    expect(JSON.stringify(error.mock.calls)).not.toContain("SQS infrastructure failure");
  });

  it("enqueues multiple events with bounded fan-out", async () => {
    sendMock.mockResolvedValue({ MessageId: "message-1" });

    const result = await enqueueActivityLogEvents([
      projectCreatedEvent("org-1"),
      projectCreatedEvent("org-2"),
    ]);

    expect(result).toHaveLength(2);
    expect(result.every((entry) => entry.ok)).toBe(true);
    expect(sendMock).toHaveBeenCalledTimes(2);
  });
});
