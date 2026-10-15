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

import {
  enqueueVisualWorkflowCreatedActivity,
  enqueueVisualWorkflowDeletedActivity,
  enqueueVisualWorkflowPublishedActivity,
  enqueueVisualWorkflowRunStartedActivity,
  enqueueVisualWorkflowStatusActivity,
} from "./visual-workflow-events";

const userActor = {
  actorCredentialId: null,
  actorKind: "user" as const,
  actorUserId: "user_1",
};

describe("visual workflow activity events", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("records create, publish, status, and run payloads", async () => {
    await enqueueVisualWorkflowCreatedActivity({
      ...userActor,
      name: "Campaign pages",
      organizationId: "org_1",
      visualWorkflowId: "workflow_1",
    });
    await enqueueVisualWorkflowPublishedActivity({
      ...userActor,
      name: "Campaign pages",
      organizationId: "org_1",
      publishedVersion: 2,
      visualWorkflowId: "workflow_1",
    });
    await enqueueVisualWorkflowStatusActivity({
      ...userActor,
      name: "Campaign pages",
      organizationId: "org_1",
      status: "paused",
      visualWorkflowId: "workflow_1",
    });
    await enqueueVisualWorkflowRunStartedActivity({
      actorCredentialId: null,
      actorKind: "system",
      actorUserId: null,
      name: "Campaign pages",
      organizationId: "org_1",
      runId: "run_1",
      triggerSource: "scheduled",
      visualWorkflowId: "workflow_1",
    });
    await enqueueVisualWorkflowDeletedActivity({
      ...userActor,
      name: "Campaign pages",
      organizationId: "org_1",
      visualWorkflowId: "workflow_1",
    });

    expect(enqueueActivityLogEventMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        eventType: "visual_workflow_created",
        payload: {
          name: "Campaign pages",
          status: "draft",
          visualWorkflowId: "workflow_1",
        },
        targetKind: "visual_workflow",
      }),
    );
    expect(enqueueActivityLogEventMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        eventType: "visual_workflow_published",
        payload: {
          name: "Campaign pages",
          publishedVersion: 2,
          visualWorkflowId: "workflow_1",
        },
      }),
    );
    expect(enqueueActivityLogEventMock).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        eventType: "visual_workflow_disabled",
        payload: {
          name: "Campaign pages",
          status: "paused",
          visualWorkflowId: "workflow_1",
        },
      }),
    );
    expect(enqueueActivityLogEventMock).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({
        eventType: "visual_workflow_run_started",
        payload: {
          name: "Campaign pages",
          runId: "run_1",
          status: "queued",
          triggerSource: "scheduled",
          visualWorkflowId: "workflow_1",
        },
      }),
    );
    expect(enqueueActivityLogEventMock).toHaveBeenNthCalledWith(
      5,
      expect.objectContaining({
        eventType: "visual_workflow_deleted",
        payload: {
          name: "Campaign pages",
          status: "archived",
          visualWorkflowId: "workflow_1",
        },
      }),
    );
  });

  it("records enable when status becomes active", async () => {
    await enqueueVisualWorkflowStatusActivity({
      ...userActor,
      name: "Campaign pages",
      organizationId: "org_1",
      status: "active",
      visualWorkflowId: "workflow_1",
    });

    expect(enqueueActivityLogEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "visual_workflow_enabled",
        payload: {
          name: "Campaign pages",
          status: "active",
          visualWorkflowId: "workflow_1",
        },
      }),
    );
  });
});
