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

const { enqueueFileTranslationsImportedActivityMock, extractSandboxEntriesMock } = vi.hoisted(
  () => ({
    enqueueFileTranslationsImportedActivityMock: vi.fn(),
    extractSandboxEntriesMock: vi.fn(),
  }),
);

vi.mock("@/lib/translation/sandbox", () => ({ extractSandboxEntries: extractSandboxEntriesMock }));

vi.mock("@/lib/activity-log/file-segment-events", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/activity-log/file-segment-events")>();
  return {
    ...actual,
    enqueueFileTranslationsImportedActivity: enqueueFileTranslationsImportedActivityMock,
  };
});

import {
  enqueueFileTranslationsImportedActivityStep,
  extractTranslationImportEntriesStep,
} from "./translation-file-import";

describe("extractTranslationImportEntriesStep", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("reads the target column of a workbook relative to the source column", async () => {
    extractSandboxEntriesMock.mockResolvedValue({ ok: true, entries: { "home.title": "Accueil" } });

    await expect(
      extractTranslationImportEntriesStep({
        sandboxId: "sbx",
        filePath: "strings.xlsx",
        targetLocale: "fr-FR",
        sourceLocale: "en-US",
      }),
    ).resolves.toEqual({ "home.title": "Accueil" });
    expect(extractSandboxEntriesMock).toHaveBeenCalledWith("sbx", "strings.xlsx", {
      sourceLocale: "en-US",
      locale: "fr-FR",
    });
  });

  it("passes only the target locale for other formats", async () => {
    extractSandboxEntriesMock.mockResolvedValue({ ok: true, entries: {} });

    await extractTranslationImportEntriesStep({
      sandboxId: "sbx",
      filePath: "fr.json",
      targetLocale: "fr-FR",
      sourceLocale: "en-US",
    });
    expect(extractSandboxEntriesMock).toHaveBeenCalledWith("sbx", "fr.json", { locale: "fr-FR" });
  });
});

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
