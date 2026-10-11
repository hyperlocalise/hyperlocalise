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
  enqueueQueryCreatedActivity,
  enqueueQueryDeletedActivity,
  enqueueQueryImportedActivity,
} from "./query-events";

const userActor = {
  actorCredentialId: null,
  actorKind: "user" as const,
  actorUserId: "user_1",
};

describe("query activity events", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("records create, delete, and import payloads", async () => {
    await enqueueQueryCreatedActivity({
      ...userActor,
      identifier: "WEB-21",
      organizationId: "org_1",
      projectId: "project_1",
      queryId: "query_1",
      source: "manual",
    });
    await enqueueQueryDeletedActivity({
      ...userActor,
      identifier: "WEB-21",
      organizationId: "org_1",
      projectId: "project_1",
      queryId: "query_1",
    });
    await enqueueQueryImportedActivity({
      ...userActor,
      itemCount: 12,
      organizationId: "org_1",
      projectId: "project_1",
    });

    expect(enqueueActivityLogEventMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        eventType: "query_created",
        payload: {
          identifier: "WEB-21",
          name: "WEB-21",
          projectId: "project_1",
          queryId: "query_1",
          source: "manual",
        },
        targetId: "query_1",
        targetKind: "query",
      }),
    );
    expect(enqueueActivityLogEventMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        eventType: "query_deleted",
        payload: {
          identifier: "WEB-21",
          name: "WEB-21",
          projectId: "project_1",
          queryId: "query_1",
        },
        targetKind: "query",
      }),
    );
    expect(enqueueActivityLogEventMock).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        eventType: "query_imported",
        payload: {
          itemCount: 12,
          projectId: "project_1",
        },
        targetId: "project_1",
        targetKind: "project",
      }),
    );
  });

  it("records MCP and QA-promoted creates", async () => {
    await enqueueQueryCreatedActivity({
      actorCredentialId: null,
      actorKind: "user",
      actorUserId: "user_1",
      identifier: "WEB-22",
      organizationId: "org_1",
      projectId: "project_1",
      queryId: "query_2",
      source: "qa_promote",
    });
    await enqueueQueryCreatedActivity({
      ...userActor,
      identifier: "WEB-23",
      organizationId: "org_1",
      projectId: "project_1",
      queryId: "query_3",
      source: "mcp",
    });

    expect(enqueueActivityLogEventMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        payload: expect.objectContaining({ source: "qa_promote" }),
      }),
    );
    expect(enqueueActivityLogEventMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        payload: expect.objectContaining({ source: "mcp" }),
      }),
    );
  });
});
