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

const { enqueueActivityLogEventMock } = vi.hoisted(() => ({
  enqueueActivityLogEventMock: vi.fn(),
}));

vi.mock("./activity-log-writer", () => ({
  enqueueActivityLogEvent: enqueueActivityLogEventMock,
}));

const { trackMock } = vi.hoisted(() => ({
  trackMock: vi.fn(),
}));

vi.mock("@/lib/analytics/server", () => ({
  serverAnalytics: { track: trackMock },
}));

import { PRODUCT_USAGE_ANALYTICS_EVENTS } from "@/lib/analytics/events";
import {
  enqueueAutomationRunStartedActivity,
  enqueueAutomationStatusActivity,
  enqueueJobCancelledActivity,
  enqueueJobCreatedActivity,
  enqueueJobFailedActivity,
  stableJobFailureCode,
} from "./job-automation-events";

const userActor = {
  actorCredentialId: null,
  actorKind: "user" as const,
  actorUserId: "user_1",
};

describe("job and automation activity events", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("records the safe job lifecycle payload and actor", async () => {
    await enqueueJobCreatedActivity({
      ...userActor,
      jobId: "job_1",
      kind: "translation",
      organizationId: "org_1",
      projectId: "project_1",
      status: "queued",
    });
    await enqueueJobCancelledActivity({
      ...userActor,
      jobId: "job_1",
      kind: "translation",
      organizationId: "org_1",
      projectId: "project_1",
      status: "cancelled",
    });

    expect(enqueueActivityLogEventMock).toHaveBeenNthCalledWith(1, {
      ...userActor,
      eventType: "job_created",
      organizationId: "org_1",
      payload: {
        jobId: "job_1",
        kind: "translation",
        projectId: "project_1",
        status: "queued",
      },
      targetId: "job_1",
      targetKind: "job",
    });
    expect(enqueueActivityLogEventMock).toHaveBeenNthCalledWith(2, {
      ...userActor,
      eventType: "job_cancelled",
      organizationId: "org_1",
      payload: {
        jobId: "job_1",
        kind: "translation",
        projectId: "project_1",
        status: "cancelled",
      },
      targetId: "job_1",
      targetKind: "job",
    });
    expect(trackMock).toHaveBeenNthCalledWith(1, PRODUCT_USAGE_ANALYTICS_EVENTS.jobCreated, {
      feature: "translation",
      source: "web",
    });
    expect(trackMock).toHaveBeenNthCalledWith(2, PRODUCT_USAGE_ANALYTICS_EVENTS.jobCancelled, {
      feature: "translation",
      source: "web",
    });
  });

  it("keeps stable failure codes and rejects raw messages", async () => {
    expect(stableJobFailureCode("provider_rate_limited")).toBe("provider_rate_limited");
    expect(stableJobFailureCode("Provider said customer text was invalid")).toBe("unknown_error");

    await enqueueJobFailedActivity({
      actorCredentialId: null,
      actorKind: "system",
      actorUserId: null,
      errorCode: "Provider said customer text was invalid",
      jobId: "job_1",
      kind: "review",
      organizationId: "org_1",
      status: "failed",
    });

    expect(enqueueActivityLogEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "job_failed",
        payload: {
          errorCode: "unknown_error",
          jobId: "job_1",
          kind: "review",
          status: "failed",
        },
      }),
    );
  });

  it("records automation names and resulting statuses", async () => {
    await enqueueAutomationStatusActivity({
      ...userActor,
      automationId: "automation_1",
      name: "Daily localization check",
      organizationId: "org_1",
      status: "paused",
    });
    await enqueueAutomationRunStartedActivity({
      actorCredentialId: null,
      actorKind: "system",
      actorUserId: null,
      automationId: "automation_1",
      name: "Daily localization check",
      organizationId: "org_1",
      runId: "run_1",
      triggerSource: "scheduled",
    });

    expect(enqueueActivityLogEventMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        eventType: "automation_disabled",
        payload: {
          automationId: "automation_1",
          name: "Daily localization check",
          status: "paused",
        },
      }),
    );
    expect(enqueueActivityLogEventMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        eventType: "automation_run_started",
        payload: {
          automationId: "automation_1",
          name: "Daily localization check",
          runId: "run_1",
          status: "running",
          triggerSource: "scheduled",
        },
      }),
    );
  });
});
