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

const { getRepositorySourceFileByPath, captureAnalysis, captureCompletions, selectResults } =
  vi.hoisted(() => ({
    getRepositorySourceFileByPath: vi.fn(),
    captureAnalysis: vi.fn(async () => undefined),
    captureCompletions: vi.fn(async () => undefined),
    selectResults: [] as unknown[][],
  }));

vi.mock("@/lib/projects/translations/project-translation-service", () => ({
  ProjectTranslationService: class {
    getRepositorySourceFileByPath = getRepositorySourceFileByPath;
  },
}));

vi.mock("@/lib/reporting/capture", () => ({
  captureAnalysis,
  captureCompletions,
}));

vi.mock("@/lib/database/client", () => {
  const nextResult = async () => selectResults.shift() ?? [];
  const createSelectBuilder = () => {
    const promise = nextResult();
    const builder = Object.assign(promise, {
      from: vi.fn(() => builder),
      where: vi.fn(() => builder),
      limit: vi.fn(() => promise),
    });
    return builder;
  };

  return {
    db: {
      select: vi.fn(() => createSelectBuilder()),
    },
    schema: {
      projectTranslationKeys: {
        id: "id",
        sourceText: "sourceText",
        projectId: "projectId",
        repositorySourceFileId: "repositorySourceFileId",
      },
      projectTranslations: {
        sourceJobId: "sourceJobId",
        translationKeyId: "translationKeyId",
        targetLocale: "targetLocale",
      },
      projects: {
        id: "id",
        sourceLocale: "sourceLocale",
      },
    },
  };
});

import { captureNativeCatTranslationReporting } from "./native-cat-reporting-capture";

const baseInput = {
  organizationId: "org_1",
  projectId: "project_1",
  sourcePath: "locales/en.json",
  translationKeyId: "key_1",
  targetLocale: "fr-FR",
  text: "Bonjour",
};

describe("captureNativeCatTranslationReporting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectResults.length = 0;
    getRepositorySourceFileByPath.mockReset();
  });

  it("returns false when the source file is missing", async () => {
    getRepositorySourceFileByPath.mockResolvedValue(null);

    await expect(captureNativeCatTranslationReporting(baseInput)).resolves.toBe(false);
    expect(captureAnalysis).not.toHaveBeenCalled();
    expect(captureCompletions).not.toHaveBeenCalled();
  });

  it("returns false when the translation key is missing for the file", async () => {
    getRepositorySourceFileByPath.mockResolvedValue({ id: "file_1" });
    selectResults.push([]);

    await expect(captureNativeCatTranslationReporting(baseInput)).resolves.toBe(false);
    expect(captureAnalysis).not.toHaveBeenCalled();
  });

  it("records billable draft analysis and human completions for manual saves", async () => {
    getRepositorySourceFileByPath.mockResolvedValue({ id: "file_1" });
    selectResults.push(
      [{ id: "key_1", sourceText: "Hello" }],
      [{ sourceJobId: "job_existing" }],
      [{ sourceLocale: "en-AU" }],
    );

    await expect(captureNativeCatTranslationReporting(baseInput)).resolves.toBe(true);

    expect(captureAnalysis).toHaveBeenCalledWith({
      organizationId: "org_1",
      projectId: "project_1",
      jobId: "job_existing",
      sourceLocale: "en-AU",
      targetLocale: "fr-FR",
      sourceEntries: { key_1: "Hello" },
      billable: true,
      step: "translation",
    });
    expect(captureCompletions).toHaveBeenCalledWith({
      organizationId: "org_1",
      jobId: "job_existing",
      targetLocale: "fr-FR",
      sourceEntries: { key_1: "Hello" },
      provenance: "human",
      step: "translation",
    });
  });

  it("uses approve as review, prefers explicit job id, and skips blank completions", async () => {
    getRepositorySourceFileByPath.mockResolvedValue({ id: "file_1" });
    selectResults.push(
      [{ id: "key_1", sourceText: "Hello" }],
      [{ sourceJobId: "job_existing" }],
      [{ sourceLocale: "en" }],
    );

    await expect(
      captureNativeCatTranslationReporting({
        ...baseInput,
        text: "   ",
        approve: true,
        provenance: "translation_job",
        sourceJobId: "job_explicit",
      }),
    ).resolves.toBe(true);

    expect(captureAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: "job_explicit",
        billable: false,
        step: "review",
        sourceLocale: "en",
      }),
    );
    expect(captureCompletions).not.toHaveBeenCalled();
  });

  it("defaults missing project source locale to en and maps agent provenance as automated", async () => {
    getRepositorySourceFileByPath.mockResolvedValue({ id: "file_1" });
    selectResults.push([{ id: "key_1", sourceText: "Hello" }], [], []);

    await expect(
      captureNativeCatTranslationReporting({
        ...baseInput,
        provenance: "agent",
      }),
    ).resolves.toBe(true);

    expect(captureAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: undefined,
        sourceLocale: "en",
        billable: false,
        step: "translation",
      }),
    );
    expect(captureCompletions).toHaveBeenCalledWith(
      expect.objectContaining({
        provenance: "automated",
        step: "translation",
      }),
    );
  });
});
