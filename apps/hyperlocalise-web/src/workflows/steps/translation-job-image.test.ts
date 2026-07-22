/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const {
  getImageVariantMock,
  localizeAndStoreImageVariantMock,
  getRepositorySourceFileVersionMock,
} = vi.hoisted(() => ({
  getImageVariantMock: vi.fn(),
  localizeAndStoreImageVariantMock: vi.fn(),
  getRepositorySourceFileVersionMock: vi.fn(),
}));

vi.mock("@/lib/file-storage/records", () => ({
  getRepositorySourceFileVersionForStoredFile: getRepositorySourceFileVersionMock,
}));

vi.mock("@/lib/projects/files/image-variant-service", () => ({
  getImageVariant: getImageVariantMock,
  localizeAndStoreImageVariant: localizeAndStoreImageVariantMock,
}));

vi.mock("@/lib/agents/image-localization", () => ({
  localizedImageOutputFilename: vi.fn(
    (filename: string, targetLocale: string) =>
      `${filename.replace(/\.[^.]+$/, "")}-${targetLocale.toLowerCase()}.png`,
  ),
}));

import { localizeImageVariantForJobStep } from "@/workflows/steps/translation-job";

describe("localizeImageVariantForJobStep", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getRepositorySourceFileVersionMock.mockResolvedValue({ repositorySourceFileId: "repo_file_1" });
  });

  it("reuses an approved locale output instead of failing the whole job", async () => {
    localizeAndStoreImageVariantMock.mockResolvedValue({
      ok: false,
      error: { code: "approved_locked" },
    });
    getImageVariantMock.mockResolvedValue({
      storedFileId: "file_approved_fr",
      status: "approved",
    });

    await expect(
      localizeImageVariantForJobStep({
        organizationId: "org_1",
        projectId: "project_1",
        sourcePath: "assets/banner.png",
        targetLocale: "fr-FR",
        sourceLocale: "en-US",
        sourceStoredFileId: "file_source",
        sourceJobId: "job_1",
      }),
    ).resolves.toEqual({
      fileId: "file_approved_fr",
      locale: "fr-FR",
      filename: "banner-fr-fr.png",
    });
  });
});
