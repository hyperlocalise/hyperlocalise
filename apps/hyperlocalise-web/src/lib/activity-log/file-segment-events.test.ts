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

const { enqueueActivityLogEventMock, enqueueActivityLogEventsMock } = vi.hoisted(() => ({
  enqueueActivityLogEventMock: vi.fn(),
  enqueueActivityLogEventsMock: vi.fn(),
}));

vi.mock("./activity-log-writer", () => ({
  enqueueActivityLogEvent: enqueueActivityLogEventMock,
  enqueueActivityLogEvents: enqueueActivityLogEventsMock,
}));

import {
  enqueueFileActivity,
  enqueueSegmentActivities,
  enqueueSegmentActivity,
  fileActivityTargetId,
  safeFileActivityName,
  safeSegmentActivityName,
  segmentActivityTargetId,
} from "./file-segment-events";

const userActor = {
  actorCredentialId: null,
  actorKind: "user" as const,
  actorUserId: "user_1",
};

describe("file and segment activity events", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds stable file and segment target ids", () => {
    expect(fileActivityTargetId("project_1", "locales/en.json")).toBe(
      "project_1:locales/en.json",
    );
    expect(segmentActivityTargetId("project_1", "string_home_title")).toBe(
      "project_1:string_home_title",
    );
  });

  it("uses the basename as the safe file display name", () => {
    expect(safeFileActivityName("marketing/home.json")).toBe("home.json");
    expect(safeSegmentActivityName("home.title")).toBe("home.title");
    expect(safeSegmentActivityName("")).toBe("string");
  });

  it("records a file upload without linguistic content", async () => {
    await enqueueFileActivity("file_uploaded", {
      ...userActor,
      organizationId: "org_1",
      projectId: "project_1",
      sourcePath: "locales/en.json",
    });

    expect(enqueueActivityLogEventMock).toHaveBeenCalledWith({
      ...userActor,
      eventType: "file_uploaded",
      organizationId: "org_1",
      payload: {
        name: "en.json",
        projectId: "project_1",
        sourcePath: "locales/en.json",
      },
      targetId: "project_1:locales/en.json",
      targetKind: "file",
    });
  });

  it("records a segment approval with the string key, not source text", async () => {
    await enqueueSegmentActivity("segment_approved", {
      ...userActor,
      externalStringId: "key_1",
      organizationId: "org_1",
      projectId: "project_1",
      sourcePath: "locales/en.json",
      stringKey: "home.title",
      targetLocale: "fr",
    });

    expect(enqueueActivityLogEventMock).toHaveBeenCalledWith({
      ...userActor,
      eventType: "segment_approved",
      organizationId: "org_1",
      payload: {
        externalStringId: "key_1",
        name: "home.title",
        projectId: "project_1",
        sourcePath: "locales/en.json",
        targetLocale: "fr",
      },
      targetId: "project_1:key_1",
      targetKind: "segment",
    });
  });

  it("enqueues one event per string for bulk lock changes", async () => {
    await enqueueSegmentActivities("segment_locked", [
      {
        ...userActor,
        externalStringId: "key_1",
        organizationId: "org_1",
        projectId: "project_1",
        sourcePath: "locales/en.json",
        stringKey: "home.title",
        targetLocale: "fr",
      },
      {
        ...userActor,
        externalStringId: "key_2",
        organizationId: "org_1",
        projectId: "project_1",
        sourcePath: "locales/en.json",
        stringKey: "home.cta",
        targetLocale: "fr",
      },
    ]);

    expect(enqueueActivityLogEventsMock).toHaveBeenCalledWith([
      expect.objectContaining({
        eventType: "segment_locked",
        targetId: "project_1:key_1",
        targetKind: "segment",
      }),
      expect.objectContaining({
        eventType: "segment_locked",
        targetId: "project_1:key_2",
        targetKind: "segment",
      }),
    ]);
  });
});
