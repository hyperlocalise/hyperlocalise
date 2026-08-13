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

const {
  getVideoVariantMock,
  localizeAndStoreVideoVariantMock,
  getRepositorySourceFileVersionMock,
} = vi.hoisted(() => ({
  getVideoVariantMock: vi.fn(),
  localizeAndStoreVideoVariantMock: vi.fn(),
  getRepositorySourceFileVersionMock: vi.fn(),
}));

vi.mock("@/lib/file-storage/records", () => ({
  getRepositorySourceFileVersionForStoredFile: getRepositorySourceFileVersionMock,
}));

vi.mock("@/lib/projects/files/video-variant-service", () => ({
  getVideoVariant: getVideoVariantMock,
  localizeAndStoreVideoVariant: localizeAndStoreVideoVariantMock,
}));

vi.mock("@/lib/agents/video-localization", () => ({
  localizedVideoOutputFilename: vi.fn(
    (filename: string, targetLocale: string) =>
      `${filename.replace(/\.[^.]+$/, "")}-${targetLocale.toLowerCase()}.mp4`,
  ),
}));

import { localizeVideoVariantForJobStep } from "@/workflows/steps/translation-job";

describe("localizeVideoVariantForJobStep", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getRepositorySourceFileVersionMock.mockResolvedValue({ repositorySourceFileId: "repo_file_1" });
  });

  it("reuses an approved locale output instead of failing the whole job", async () => {
    localizeAndStoreVideoVariantMock.mockResolvedValue({
      ok: false,
      error: { code: "approved_locked" },
    });
    getVideoVariantMock.mockResolvedValue({
      storedFileId: "file_approved_fr",
      status: "approved",
    });

    await expect(
      localizeVideoVariantForJobStep({
        organizationId: "org_1",
        projectId: "project_1",
        sourcePath: "assets/banner.mp4",
        targetLocale: "fr-FR",
        sourceLocale: "en-US",
        sourceStoredFileId: "file_source",
        sourceJobId: "job_1",
      }),
    ).resolves.toEqual({
      fileId: "file_approved_fr",
      locale: "fr-FR",
      filename: "banner-fr-fr.mp4",
    });
  });
});
