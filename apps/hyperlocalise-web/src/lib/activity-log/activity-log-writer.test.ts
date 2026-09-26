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
import {
  ACTIVITY_LOG_SQS_SEND_TIMEOUT_MS,
  enqueueActivityLogEvent,
  enqueueActivityLogEvents,
} from "./activity-log-writer";

const { awsCredentialsProviderMock, sendMock } = vi.hoisted(() => ({
  awsCredentialsProviderMock: vi.fn(() => vi.fn()),
  sendMock: vi.fn(),
}));

vi.mock("@aws-sdk/client-sqs", () => ({
  SendMessageCommand: class {
    constructor(input: unknown) {
      Object.assign(this, input);
    }
  },
  SQSClient: class {
    send(input: unknown, options: unknown) {
      return sendMock(input, options);
    }
  },
}));

vi.mock("@vercel/oidc-aws-credentials-provider", () => ({
  awsCredentialsProvider: awsCredentialsProviderMock,
}));

vi.mock("@/lib/env", () => ({
  env: {
    ACTIVITY_LOG_SQS_QUEUE_URL: "https://sqs.test.local/queue/activity-log",
    AWS_REGION: "us-east-1",
    AWS_ROLE_ARN: "arn:aws:iam::123456789012:role/test-role",
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
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("enqueues a serialized SQS event without writing to the database", async () => {
    sendMock.mockResolvedValue({ MessageId: "message-1" });

    const result = await enqueueActivityLogEvent(projectCreatedEvent());

    expect(result).toMatchObject({ ok: true });
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(awsCredentialsProviderMock).toHaveBeenCalledWith({
      audience: "sts.amazonaws.com",
      roleArn: "arn:aws:iam::123456789012:role/test-role",
    });
    expect(sendMock).toHaveBeenCalledWith(
      {
        MessageBody: expect.any(String),
        QueueUrl: "https://sqs.test.local/queue/activity-log",
      },
      { abortSignal: expect.any(AbortSignal) },
    );
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

  it("contains SQS enqueue failures and logs safe diagnostics", async () => {
    sendMock.mockRejectedValue(
      Object.assign(new Error("SQS infrastructure failure"), {
        code: "AccessDenied",
        $metadata: { requestId: "request-1" },
      }),
    );
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
        error: expect.objectContaining({
          message: "SQS infrastructure failure",
        }),
      }),
      "workspace activity log enqueue failed",
    );
  });

  it("bounds a stalled SQS send with the default timeout", async () => {
    vi.useFakeTimers();
    sendMock.mockImplementation(
      (_command: unknown, { abortSignal }: { abortSignal: AbortSignal }) =>
        new Promise((_, reject) => {
          abortSignal.addEventListener("abort", () => reject(abortSignal.reason), { once: true });
        }),
    );

    const resultPromise = enqueueActivityLogEvent(projectCreatedEvent());
    await vi.advanceTimersByTimeAsync(ACTIVITY_LOG_SQS_SEND_TIMEOUT_MS);

    await expect(resultPromise).resolves.toEqual({
      ok: false,
      error: { code: "activity_log_enqueue_failed" },
    });
  });

  it("combines the caller signal with the default timeout", async () => {
    sendMock.mockImplementation(
      (_command: unknown, { abortSignal }: { abortSignal: AbortSignal }) =>
        new Promise((_, reject) => {
          abortSignal.addEventListener("abort", () => reject(abortSignal.reason), { once: true });
        }),
    );
    const controller = new AbortController();

    const resultPromise = enqueueActivityLogEvent(projectCreatedEvent(), {
      signal: controller.signal,
    });
    controller.abort();

    await expect(resultPromise).resolves.toEqual({
      ok: false,
      error: { code: "activity_log_enqueue_failed" },
    });
    expect(sendMock).toHaveBeenCalledWith(expect.anything(), {
      abortSignal: expect.any(AbortSignal),
    });
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
