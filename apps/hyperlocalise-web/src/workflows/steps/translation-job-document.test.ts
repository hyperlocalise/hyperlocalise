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

const { getImageVariantMock, replaceImageVariantBytesMock } = vi.hoisted(() => ({
  getImageVariantMock: vi.fn(),
  replaceImageVariantBytesMock: vi.fn(),
}));

vi.mock("@/lib/projects/files/image-variant-service", () => ({
  getImageVariant: getImageVariantMock,
  replaceImageVariantBytes: replaceImageVariantBytesMock,
}));

import { persistDocumentVariantBytesStep } from "@/workflows/steps/translation-job";

describe("persistDocumentVariantBytesStep", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reuses an approved locale document instead of failing the whole job", async () => {
    replaceImageVariantBytesMock.mockResolvedValue({
      ok: false,
      error: { code: "approved_locked" },
    });
    const existing = {
      storedFileId: "file_approved_fr",
      status: "approved",
    };
    getImageVariantMock.mockResolvedValue(existing);

    await expect(
      persistDocumentVariantBytesStep({
        organizationId: "org_1",
        projectId: "project_1",
        sourcePath: "docs/guide.md",
        targetLocale: "fr-FR",
        content: Buffer.from("# Bonjour\n", "utf8"),
        contentType: "text/markdown",
        filename: "guide.md",
        sourceJobId: "job_1",
      }),
    ).resolves.toEqual(existing);
  });

  it("throws when an approved locale has no stored document to reuse", async () => {
    replaceImageVariantBytesMock.mockResolvedValue({
      ok: false,
      error: { code: "approved_locked" },
    });
    getImageVariantMock.mockResolvedValue(null);

    await expect(
      persistDocumentVariantBytesStep({
        organizationId: "org_1",
        projectId: "project_1",
        sourcePath: "docs/guide.md",
        targetLocale: "fr-FR",
        content: Buffer.from("# Bonjour\n", "utf8"),
        contentType: "text/markdown",
        filename: "guide.md",
        sourceJobId: "job_1",
      }),
    ).rejects.toThrow("failed to persist document variant: approved_locked");
  });
});
