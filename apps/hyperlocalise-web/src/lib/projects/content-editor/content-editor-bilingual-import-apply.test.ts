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

import { importCatBilingualRows } from "./content-editor-bilingual-import-apply";
import type { ContentEditorFilteredExportRow } from "./content-editor-filtered-export";
import { maxCatFilteredExportSegments } from "./content-editor-filtered-export";

const mocks = vi.hoisted(() => ({
  importApprovedProjectTranslationsFromEntries: vi.fn(),
  enqueueFileTranslationsImportedActivity: vi.fn(),
}));

vi.mock("@/lib/projects/translations/project-translation-service", () => ({
  importApprovedProjectTranslationsFromEntries: (...args: unknown[]) =>
    mocks.importApprovedProjectTranslationsFromEntries(...args),
}));

vi.mock("@/lib/activity-log/file-segment-events", () => ({
  enqueueFileTranslationsImportedActivity: (...args: unknown[]) =>
    mocks.enqueueFileTranslationsImportedActivity(...args),
}));

function row(
  overrides: Partial<ContentEditorFilteredExportRow> & Pick<ContentEditorFilteredExportRow, "key">,
): ContentEditorFilteredExportRow {
  return {
    sourceText: "Hello",
    targetText: "Bonjour",
    sourceLocale: "en",
    targetLocale: "fr",
    sourcePath: "a.json",
    ...overrides,
  };
}

describe("importCatBilingualRows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.importApprovedProjectTranslationsFromEntries.mockImplementation(
      async (input: { entries: Record<string, string> }) => ({
        matched: Object.keys(input.entries).length,
        imported: Object.keys(input.entries).length,
        skipped: 0,
      }),
    );
    mocks.enqueueFileTranslationsImportedActivity.mockResolvedValue(undefined);
  });

  it("imports each source path and keeps inline placeholder tags", async () => {
    const tagged = "Bonjour \u001eHLHTPH_1\u001f";

    await expect(
      importCatBilingualRows({
        organizationId: "org-1",
        projectId: "project-1",
        sourcePath: "*",
        targetLocale: "fr",
        actorUserId: "user-1",
        rows: [
          row({ key: "keep", sourcePath: "a.json", targetText: tagged }),
          row({ key: "other", sourcePath: "b.json", targetText: "Autre" }),
          row({ key: "empty", sourcePath: "a.json", targetText: "  " }),
        ],
      }),
    ).resolves.toEqual({ matched: 2, imported: 2, skipped: 1, files: 2 });

    expect(mocks.importApprovedProjectTranslationsFromEntries).toHaveBeenCalledTimes(2);
    expect(mocks.importApprovedProjectTranslationsFromEntries).toHaveBeenCalledWith({
      organizationId: "org-1",
      projectId: "project-1",
      sourcePath: "a.json",
      targetLocale: "fr",
      entries: { keep: tagged },
      actorUserId: "user-1",
    });
    expect(mocks.importApprovedProjectTranslationsFromEntries).toHaveBeenCalledWith({
      organizationId: "org-1",
      projectId: "project-1",
      sourcePath: "b.json",
      targetLocale: "fr",
      entries: { other: "Autre" },
      actorUserId: "user-1",
    });
    expect(mocks.enqueueFileTranslationsImportedActivity).toHaveBeenCalledTimes(2);
  });

  it("does not enqueue activity when a file imports nothing", async () => {
    mocks.importApprovedProjectTranslationsFromEntries.mockResolvedValue({
      matched: 1,
      imported: 0,
      skipped: 1,
    });

    await expect(
      importCatBilingualRows({
        organizationId: "org-1",
        projectId: "project-1",
        sourcePath: "a.json",
        targetLocale: "fr",
        rows: [row({ key: "keep" })],
      }),
    ).resolves.toEqual({ matched: 1, imported: 0, skipped: 1, files: 1 });
    expect(mocks.enqueueFileTranslationsImportedActivity).not.toHaveBeenCalled();
  });

  it("rejects oversized bilingual imports before applying translations", async () => {
    await expect(
      importCatBilingualRows({
        organizationId: "org-1",
        projectId: "project-1",
        sourcePath: "*",
        targetLocale: "fr",
        rows: Array.from({ length: maxCatFilteredExportSegments + 1 }, (_, index) =>
          row({ key: `k${index}` }),
        ),
      }),
    ).rejects.toThrow("too many rows");
    expect(mocks.importApprovedProjectTranslationsFromEntries).not.toHaveBeenCalled();
  });
});
