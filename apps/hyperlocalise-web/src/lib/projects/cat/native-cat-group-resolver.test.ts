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
import { describe, expect, it, vi } from "vite-plus/test";

import type { DatabaseClient } from "@/lib/database";

import { nativeCatGroupId, resolveNativeCatLogicalRows } from "./native-cat-group-resolver";

function groupedRow(overrides: Record<string, unknown> = {}) {
  return {
    representativeId: "key-1",
    representativeKey: "actions.save",
    sourceText: "Save",
    sourceTextHash: "a".repeat(64),
    representativeContext: "Toolbar",
    representativeType: null,
    representativeMaxLength: null,
    representativeMetadata: {},
    representativeHidden: false,
    representativeSourcePath: "locales/en.json",
    projectOccurrenceCount: 2,
    fileOccurrenceCount: 1,
    totalLogicalRows: 3,
    totalSourceOccurrences: 5,
    ...overrides,
  };
}

function input() {
  return {
    organizationId: "organization-1",
    projectId: "project-1",
    targetLocale: "fr-FR",
    sourcePath: "locales/en.json",
    limit: 50,
    offset: 0,
    queueFilter: "all" as const,
    queueSort: "file_order" as const,
  };
}

describe("nativeCatGroupId", () => {
  it("is deterministic and scoped by project, locale, and exact source", () => {
    const first = nativeCatGroupId({
      projectId: "project-1",
      targetLocale: "fr-FR",
      sourceText: "Save",
    });

    expect(
      nativeCatGroupId({ projectId: "project-1", targetLocale: "fr-FR", sourceText: "Save" }),
    ).toBe(first);
    expect(
      nativeCatGroupId({ projectId: "project-1", targetLocale: "de-DE", sourceText: "Save" }),
    ).not.toBe(first);
    expect(
      nativeCatGroupId({ projectId: "project-1", targetLocale: "fr-FR", sourceText: " save " }),
    ).not.toBe(first);
  });
});

describe("resolveNativeCatLogicalRows", () => {
  it("returns group summaries without eagerly returning members", async () => {
    const execute = vi.fn().mockResolvedValue([groupedRow()]);
    const result = await resolveNativeCatLogicalRows(input(), {
      database: { execute } as unknown as DatabaseClient,
    });

    expect(result).toMatchObject({ totalLogicalRows: 3, totalSourceOccurrences: 5 });
    expect(result.rows).toEqual([
      expect.objectContaining({
        kind: "group",
        translationKeyId: null,
        sourceText: "Save",
        projectOccurrenceCount: 2,
        fileOccurrenceCount: 1,
      }),
    ]);
    expect(result.rows[0]).not.toHaveProperty("members");
  });

  it("keeps a single occurrence as its persisted segment", async () => {
    const execute = vi
      .fn()
      .mockResolvedValue([groupedRow({ projectOccurrenceCount: 1, fileOccurrenceCount: 1 })]);
    const resolveExceptionPredicate = vi.fn().mockResolvedValue(["key-1"]);
    const result = await resolveNativeCatLogicalRows(input(), {
      database: { execute } as unknown as DatabaseClient,
      resolveExceptionPredicate,
    });

    expect(result.rows).toEqual([
      expect.objectContaining({
        kind: "segment",
        externalStringId: "key-1",
        translationKeyId: "key-1",
      }),
    ]);
    expect(resolveExceptionPredicate).toHaveBeenCalledWith({
      organizationId: "organization-1",
      projectId: "project-1",
      targetLocale: "fr-FR",
    });
  });
});
