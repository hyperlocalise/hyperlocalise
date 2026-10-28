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

const mocks = vi.hoisted(() => ({
  where: vi.fn(),
  importApproved: vi.fn(async (..._args: unknown[]) => ({
    matched: 1,
    imported: 1,
    skipped: 0,
  })),
}));

vi.mock("@/lib/database/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/database/client")>();
  return {
    ...actual,
    db: {
      select: () => ({
        from: () => ({
          where: (...args: unknown[]) => mocks.where(...args),
        }),
      }),
    },
  };
});

vi.mock("@/lib/projects/translations/project-translation-service", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/lib/projects/translations/project-translation-service")
    >();
  return {
    ...actual,
    importApprovedProjectTranslationsFromEntries: (...args: unknown[]) =>
      mocks.importApproved(...args),
  };
});

import { importWebflowTargetTranslation } from "./import-webflow-target-translations";

function rowsWithLimit<T extends Record<string, unknown>>(rows: T[]): T[] {
  return Object.assign(rows, { limit: () => rows });
}

function queuePresenceQueries(input: {
  keys: Array<{ id: string; key: string }>;
  translations: Array<{
    translationKeyId: string;
    text: string;
    status: string;
    provenance: string;
  }>;
}) {
  mocks.where.mockReturnValueOnce(rowsWithLimit([{ id: "source-file-1" }]));
  mocks.where.mockReturnValueOnce(rowsWithLimit(input.keys));
  mocks.where.mockReturnValueOnce(rowsWithLimit(input.translations));
}

const baseInput = {
  organizationId: "org_1",
  projectId: "project_1",
  sourcePath: "webflow/site/collection/item.json",
  targetLocale: "fr",
};

describe("importWebflowTargetTranslation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("seeds secondary-locale content when the project has no translations", async () => {
    queuePresenceQueries({ keys: [{ id: "key-1", key: "title" }], translations: [] });

    const result = await importWebflowTargetTranslation({
      ...baseInput,
      incomingEntries: { title: "Bonjour" },
      policy: "seed_empty",
    });

    expect(result.status).toBe("imported");
    expect(mocks.importApproved).toHaveBeenCalledWith(
      expect.objectContaining({
        sourcePath: baseInput.sourcePath,
        targetLocale: "fr",
        entries: { title: "Bonjour" },
      }),
    );
  });

  it("leaves human translations alone under seed_empty", async () => {
    queuePresenceQueries({
      keys: [{ id: "key-1", key: "title" }],
      translations: [
        { translationKeyId: "key-1", text: "Salut", status: "approved", provenance: "manual" },
      ],
    });

    const result = await importWebflowTargetTranslation({
      ...baseInput,
      incomingEntries: { title: "Bonjour" },
      policy: "seed_empty",
    });

    expect(result.status).toBe("skipped");
    expect(mocks.importApproved).not.toHaveBeenCalled();
  });

  it("overwrites everything under overwrite_all", async () => {
    queuePresenceQueries({
      keys: [{ id: "key-1", key: "title" }],
      translations: [
        { translationKeyId: "key-1", text: "Salut", status: "approved", provenance: "manual" },
      ],
    });

    const result = await importWebflowTargetTranslation({
      ...baseInput,
      incomingEntries: { title: "Bonjour" },
      policy: "overwrite_all",
    });

    expect(result.status).toBe("imported");
    expect(mocks.importApproved).toHaveBeenCalledOnce();
  });

  it("refreshes import-provenance translations when remote content changed", async () => {
    queuePresenceQueries({
      keys: [{ id: "key-1", key: "title" }],
      translations: [
        { translationKeyId: "key-1", text: "Salut", status: "approved", provenance: "import" },
      ],
    });

    const result = await importWebflowTargetTranslation({
      ...baseInput,
      incomingEntries: { title: "Bonjour" },
      policy: "refresh_imported",
    });

    expect(result.status).toBe("imported");
    expect(mocks.importApproved).toHaveBeenCalledOnce();
  });

  it("keeps identical import-provenance translations under refresh_imported", async () => {
    queuePresenceQueries({
      keys: [{ id: "key-1", key: "title" }],
      translations: [
        { translationKeyId: "key-1", text: "Bonjour", status: "approved", provenance: "import" },
      ],
    });

    const result = await importWebflowTargetTranslation({
      ...baseInput,
      incomingEntries: { title: "Bonjour" },
      policy: "refresh_imported",
    });

    expect(result.status).toBe("skipped");
    expect(mocks.importApproved).not.toHaveBeenCalled();
  });

  it("skips empty incoming content without touching the database", async () => {
    const result = await importWebflowTargetTranslation({
      ...baseInput,
      incomingEntries: {},
      policy: "overwrite_all",
    });

    expect(result.status).toBe("skipped");
    expect(mocks.where).not.toHaveBeenCalled();
    expect(mocks.importApproved).not.toHaveBeenCalled();
  });
});
