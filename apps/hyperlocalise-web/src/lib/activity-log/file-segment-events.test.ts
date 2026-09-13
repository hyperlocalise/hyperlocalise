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

import { enqueueActivityLogEvent } from "./activity-log-writer";
import {
  enqueueFileTranslationsImportedActivity,
  enqueueFileUploadedActivity,
  enqueueStringSegmentApprovedActivity,
  enqueueStringSegmentHiddenActivity,
  fileActivityFileName,
  fileActivityTargetId,
  uploadActivityActor,
} from "./file-segment-events";

vi.mock("./activity-log-writer", () => ({
  enqueueActivityLogEvent: vi.fn(),
}));

vi.mock("@/lib/analytics/server", () => ({
  serverAnalytics: { track: vi.fn() },
}));

import { PRODUCT_USAGE_ANALYTICS_EVENTS } from "@/lib/analytics/events";
import { serverAnalytics } from "@/lib/analytics/server";

const enqueueMock = vi.mocked(enqueueActivityLogEvent);

const actor = {
  actorCredentialId: null,
  actorKind: "user" as const,
  actorUserId: "user-1",
};

describe("file and segment activity helpers", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("derives a stable file target from project and path", () => {
    expect(fileActivityFileName("./locales/en.json")).toBe("en.json");
    expect(fileActivityTargetId("project-1", "./locales/en.json")).toBe(
      "project-1:locales/en.json",
    );
  });

  it("records a file upload without linguistic content", async () => {
    await enqueueFileUploadedActivity({
      ...actor,
      organizationId: "org-1",
      projectId: "project-1",
      sourcePath: "locales/en.json",
      storedFileId: "file-1",
      versionId: "version-1",
    });

    expect(enqueueMock).toHaveBeenCalledWith({
      ...actor,
      eventType: "file_uploaded",
      organizationId: "org-1",
      payload: {
        fileName: "en.json",
        name: "en.json",
        projectId: "project-1",
        sourcePath: "locales/en.json",
        storedFileId: "file-1",
        versionId: "version-1",
      },
      targetId: "project-1:locales/en.json",
      targetKind: "file",
    });
    expect(JSON.stringify(enqueueMock.mock.calls)).not.toContain("sourceText");
    expect(JSON.stringify(enqueueMock.mock.calls)).not.toContain("targetText");
    expect(serverAnalytics.track).toHaveBeenCalledWith(PRODUCT_USAGE_ANALYTICS_EVENTS.fileUploaded, {
      status: "created",
      source: "web",
    });
  });

  it("records a translation import against the file", async () => {
    await enqueueFileTranslationsImportedActivity({
      ...actor,
      organizationId: "org-1",
      projectId: "project-1",
      sourcePath: "locales/en.json",
      targetLocale: "fr-FR",
    });

    expect(enqueueMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "file_translations_imported",
        payload: expect.objectContaining({
          fileName: "en.json",
          targetLocale: "fr-FR",
        }),
        targetKind: "file",
      }),
    );
  });

  it("records segment approval and hide batches with opaque identifiers", async () => {
    await enqueueStringSegmentApprovedActivity({
      ...actor,
      organizationId: "org-1",
      projectId: "project-1",
      segmentId: "segment-1",
      sourcePath: "locales/en.json",
      targetLocale: "fr-FR",
    });
    await enqueueStringSegmentHiddenActivity({
      ...actor,
      isHidden: true,
      itemCount: 4,
      organizationId: "org-1",
      projectId: "project-1",
      segmentId: "segment-1",
      sourcePath: "locales/en.json",
    });

    expect(enqueueMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        eventType: "string_segment_approved",
        payload: expect.objectContaining({
          segmentId: "segment-1",
          targetLocale: "fr-FR",
        }),
        targetId: "segment-1",
        targetKind: "string_segment",
      }),
    );
    expect(enqueueMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        eventType: "string_segment_hidden",
        payload: expect.objectContaining({ itemCount: 4 }),
      }),
    );
  });

  it("maps API uploads to api_key actors", () => {
    expect(
      uploadActivityActor({
        actorUserId: "user-1",
        uploadedByApiKeyId: "key-1",
      }),
    ).toEqual({
      actorCredentialId: "key-1",
      actorKind: "api_key",
      actorUserId: "user-1",
    });
  });
});
