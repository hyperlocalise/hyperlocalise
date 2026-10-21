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
  deleteTranslationMemorySegmentMock,
  findTranslationMemorySegmentByRecordIdMock,
  getTranslationMemoryMock,
  tryLoadActiveTmsProviderContextMock,
  updateTranslationMemorySegmentMock,
} = vi.hoisted(() => ({
  deleteTranslationMemorySegmentMock: vi.fn(),
  findTranslationMemorySegmentByRecordIdMock: vi.fn(),
  getTranslationMemoryMock: vi.fn(),
  tryLoadActiveTmsProviderContextMock: vi.fn(),
  updateTranslationMemorySegmentMock: vi.fn(),
}));

vi.mock("@/lib/providers/jobs/tms-provider-live", () => ({
  tryLoadActiveTmsProviderContext: (...args: unknown[]) =>
    tryLoadActiveTmsProviderContextMock(...args),
}));

vi.mock("@/lib/providers/adapters/crowdin/crowdin-api", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/providers/adapters/crowdin/crowdin-api")>();
  return {
    ...actual,
    CrowdinApiClient: class MockCrowdinApiClient {
      getTranslationMemory = getTranslationMemoryMock;
      findTranslationMemorySegmentByRecordId = findTranslationMemorySegmentByRecordIdMock;
      updateTranslationMemorySegment = updateTranslationMemorySegmentMock;
      deleteTranslationMemorySegment = deleteTranslationMemorySegmentMock;
    },
  };
});

import { CrowdinApiError } from "@/lib/providers/adapters/crowdin/crowdin-api";
import { isErr, isOk } from "@/lib/primitives/result/results";
import {
  deleteContentEditorExternalTmSegmentRecord,
  loadContentEditorExternalTmSegment,
  toCatTmSegmentFromCrowdin,
  updateContentEditorExternalTmSegment,
} from "./content-editor-external-tm-segment";

const assignedTm = {
  id: 9,
  name: "Product TM",
  description: null,
  languageId: "en",
  languageIds: ["en", "fr", "de"],
  segmentsCount: 12,
  projectIds: [42],
  defaultProjectIds: [],
  webUrl: "https://crowdin.com/tm/9",
};

const crowdinSegment = {
  id: 4,
  records: [
    { id: 1, languageId: "en", text: "Good morning." },
    { id: 2, languageId: "de", text: "Guten Morgen." },
    { id: 3, languageId: "fr", text: "Bonjour." },
  ],
};

const assignedRef = {
  providerKind: "crowdin" as const,
  resourceId: "9",
  externalResourceId: "9",
  externalSegmentId: "3",
};

describe("toCatTmSegmentFromCrowdin", () => {
  it("marks the source-language record and keeps other locales", () => {
    const mapped = toCatTmSegmentFromCrowdin(
      {
        id: 9,
        records: [
          { id: 1, languageId: "en", text: "Good morning." },
          { id: 2, languageId: "de", text: "Guten Morgen." },
          { id: 3, languageId: "ja", text: "おはようございます。" },
        ],
      },
      "en",
    );

    expect(mapped?.source).toEqual({
      id: "1",
      locale: "en",
      text: "Good morning.",
      isSource: true,
    });
    expect(mapped?.records).toEqual([
      { id: "1", locale: "en", text: "Good morning.", isSource: true },
      { id: "2", locale: "de", text: "Guten Morgen.", isSource: false },
      { id: "3", locale: "ja", text: "おはようございます。", isSource: false },
    ]);
  });

  it("returns null for an empty Crowdin segment", () => {
    expect(toCatTmSegmentFromCrowdin({ id: 1, records: [] }, "en")).toBeNull();
  });
});

describe("content editor Crowdin TM segment mutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tryLoadActiveTmsProviderContextMock.mockResolvedValue({
      providerKind: "crowdin",
      secretMaterial: "token",
      credential: { baseUrl: "https://acme.crowdin.com/api/v2" },
    });
    getTranslationMemoryMock.mockResolvedValue(assignedTm);
    findTranslationMemorySegmentByRecordIdMock.mockResolvedValue(crowdinSegment);
    updateTranslationMemorySegmentMock.mockResolvedValue({
      ...crowdinSegment,
      records: [
        { id: 1, languageId: "en", text: "Good morning!" },
        { id: 2, languageId: "de", text: "Guten Morgen." },
        { id: 3, languageId: "fr", text: "Bonjour !" },
      ],
    });
  });

  it("loads a segment only after the TM is assigned to the project", async () => {
    const result = await loadContentEditorExternalTmSegment({
      organizationId: "org_1",
      actorUserId: "user_1",
      sourceLocale: "en",
      externalProjectId: "42",
      ref: assignedRef,
    });

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.source.text).toBe("Good morning.");
    }
    expect(getTranslationMemoryMock).toHaveBeenCalledWith(9);
    expect(findTranslationMemorySegmentByRecordIdMock).toHaveBeenCalledWith(9, 3);
  });

  it("accepts a TM that lists the project as a default assignment", async () => {
    getTranslationMemoryMock.mockResolvedValue({
      ...assignedTm,
      projectIds: [],
      defaultProjectIds: [42],
    });

    const result = await loadContentEditorExternalTmSegment({
      organizationId: "org_1",
      sourceLocale: "en",
      externalProjectId: "42",
      ref: assignedRef,
    });

    expect(isOk(result)).toBe(true);
    expect(findTranslationMemorySegmentByRecordIdMock).toHaveBeenCalledWith(9, 3);
  });

  it("rejects a TM that is not assigned to the requested project", async () => {
    getTranslationMemoryMock.mockResolvedValue({
      ...assignedTm,
      projectIds: [99],
      defaultProjectIds: [],
    });

    const result = await loadContentEditorExternalTmSegment({
      organizationId: "org_1",
      sourceLocale: "en",
      externalProjectId: "42",
      ref: assignedRef,
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe("tm_segment_not_found");
    }
    expect(findTranslationMemorySegmentByRecordIdMock).not.toHaveBeenCalled();
    expect(updateTranslationMemorySegmentMock).not.toHaveBeenCalled();
  });

  it("rejects mismatched Crowdin resource and TM ids", async () => {
    const result = await updateContentEditorExternalTmSegment({
      organizationId: "org_1",
      sourceLocale: "en",
      externalProjectId: "42",
      ref: { ...assignedRef, resourceId: "9", externalResourceId: "88" },
      sourceText: "Good morning!",
      records: [{ id: "3", text: "Bonjour !" }],
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe("invalid_tm_segment");
    }
    expect(getTranslationMemoryMock).not.toHaveBeenCalled();
  });

  it("treats a missing Crowdin TM as not found", async () => {
    getTranslationMemoryMock.mockRejectedValue(
      new CrowdinApiError("missing", 404, { error: { message: "Not Found" } }),
    );

    const result = await loadContentEditorExternalTmSegment({
      organizationId: "org_1",
      sourceLocale: "en",
      externalProjectId: "42",
      ref: assignedRef,
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe("tm_segment_not_found");
    }
  });

  it("sends replace operations for changed Crowdin record text", async () => {
    const result = await updateContentEditorExternalTmSegment({
      organizationId: "org_1",
      sourceLocale: "en",
      externalProjectId: "42",
      ref: assignedRef,
      sourceText: "Good morning!",
      records: [
        { id: "2", text: "Guten Morgen." },
        { id: "3", text: "Bonjour !" },
      ],
    });

    expect(isOk(result)).toBe(true);
    expect(updateTranslationMemorySegmentMock).toHaveBeenCalledWith(9, 4, [
      { op: "replace", path: "/records/1/text", value: "Good morning!" },
      { op: "replace", path: "/records/3/text", value: "Bonjour !" },
    ]);
  });

  it("sends a remove operation when deleting a non-source locale", async () => {
    const result = await deleteContentEditorExternalTmSegmentRecord({
      organizationId: "org_1",
      sourceLocale: "en",
      externalProjectId: "42",
      ref: assignedRef,
      recordId: "2",
    });

    expect(isOk(result)).toBe(true);
    expect(updateTranslationMemorySegmentMock).toHaveBeenCalledWith(9, 4, [
      { op: "remove", path: "/records/2" },
    ]);
    expect(deleteTranslationMemorySegmentMock).not.toHaveBeenCalled();
  });

  it("does not delete the Crowdin source locale", async () => {
    const result = await deleteContentEditorExternalTmSegmentRecord({
      organizationId: "org_1",
      sourceLocale: "en",
      externalProjectId: "42",
      ref: assignedRef,
      recordId: "1",
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe("invalid_tm_segment");
    }
    expect(updateTranslationMemorySegmentMock).not.toHaveBeenCalled();
  });
});
