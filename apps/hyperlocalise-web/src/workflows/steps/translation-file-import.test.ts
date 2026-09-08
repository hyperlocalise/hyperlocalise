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

const { enqueueFileTranslationsImportedActivityMock } = vi.hoisted(() => ({
  enqueueFileTranslationsImportedActivityMock: vi.fn(),
}));

vi.mock("@/lib/activity-log/file-segment-events", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/activity-log/file-segment-events")>();
  return {
    ...actual,
    enqueueFileTranslationsImportedActivity: enqueueFileTranslationsImportedActivityMock,
  };
});

import { enqueueFileTranslationsImportedActivityStep } from "./translation-file-import";

describe("enqueueFileTranslationsImportedActivityStep", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("records a completed translation import for the original actor", async () => {
    enqueueFileTranslationsImportedActivityMock.mockResolvedValue(undefined);

    await enqueueFileTranslationsImportedActivityStep({
      actorUserId: "user-1",
      organizationId: "org-1",
      projectId: "project-1",
      sourcePath: "locales/en.json",
      storedFileId: "file-1",
      targetLocale: "fr",
    });

    expect(enqueueFileTranslationsImportedActivityMock).toHaveBeenCalledWith({
      actorCredentialId: null,
      actorKind: "user",
      actorUserId: "user-1",
      organizationId: "org-1",
      projectId: "project-1",
      sourcePath: "locales/en.json",
      storedFileId: "file-1",
      targetLocale: "fr",
    });
  });
});
