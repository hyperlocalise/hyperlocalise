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

const { getMessageFormatMock, getSegmentDetailMock, isLockedMock, saveTranslationMock } =
  vi.hoisted(() => ({
    getMessageFormatMock: vi.fn(),
    getSegmentDetailMock: vi.fn(),
    isLockedMock: vi.fn(),
    saveTranslationMock: vi.fn(),
  }));

vi.mock("@/lib/projects/content-editor/content-editor-segment-lock-service", () => ({
  isCatSegmentLocked: isLockedMock,
}));

vi.mock("@/lib/projects/content-editor/native-content-editor-service", () => ({
  getNativeProjectContentEditorSegmentDetail: getSegmentDetailMock,
  saveNativeProjectContentEditorTranslation: saveTranslationMock,
}));

vi.mock("@/lib/projects/files/source-file-message-format", () => ({
  getRepositorySourceFileMessageFormat: getMessageFormatMock,
}));

import { updateMcpTranslation } from "./mcp-update-translation";

const INPUT = {
  organizationId: "org_1",
  projectId: "project_1",
  translationKeyId: "key_1",
  targetLocale: "fr-FR",
  actorUserId: "user_1",
};

function stubSegment(sourceText: string) {
  getSegmentDetailMock.mockResolvedValue({
    segment: {
      sourcePath: "locales/en.json",
      sourceText,
    },
  });
}

describe("updateMcpTranslation message format", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isLockedMock.mockResolvedValue(false);
    saveTranslationMock.mockResolvedValue({
      text: "Bonjour",
      updatedAt: new Date("2026-10-11T00:00:00.000Z"),
    });
  });

  it("loads the source file format before comparing placeholders", async () => {
    stubSegment("Hello {{name}}");
    getMessageFormatMock.mockResolvedValue("i18next");

    await updateMcpTranslation({
      ...INPUT,
      targetText: "Bonjour {{name}}",
    });

    expect(getMessageFormatMock).toHaveBeenCalledWith({
      organizationId: INPUT.organizationId,
      projectId: INPUT.projectId,
      sourcePath: "locales/en.json",
    });
  });

  it("rejects a dropped i18next interpolation when the file is i18next", async () => {
    stubSegment("Hello {{name}}");
    getMessageFormatMock.mockResolvedValue("i18next");

    const result = await updateMcpTranslation({
      ...INPUT,
      targetText: "Bonjour",
    });

    expect(result).toMatchObject({
      ok: false,
      error: "invalid_translation",
      issues: [expect.objectContaining({ kind: "missing-token", tokens: ["{{name}}"] })],
    });
    expect(saveTranslationMock).not.toHaveBeenCalled();
  });

  it("treats single braces as text when the file is i18next", async () => {
    stubSegment("Hello {name}");
    getMessageFormatMock.mockResolvedValue("i18next");
    saveTranslationMock.mockResolvedValue({
      text: "Bonjour",
      updatedAt: new Date("2026-10-11T00:00:00.000Z"),
    });

    const result = await updateMcpTranslation({
      ...INPUT,
      targetText: "Bonjour",
    });

    expect(result).toEqual({
      ok: true,
      value: {
        id: INPUT.translationKeyId,
        targetText: "Bonjour",
        status: "draft",
        updatedAt: "2026-10-11T00:00:00.000Z",
      },
    });
    expect(saveTranslationMock).toHaveBeenCalledOnce();
  });

  it("still rejects a dropped ICU argument when the file is auto", async () => {
    stubSegment("Hello {name}");
    getMessageFormatMock.mockResolvedValue("auto");

    const result = await updateMcpTranslation({
      ...INPUT,
      targetText: "Bonjour",
    });

    expect(result).toMatchObject({
      ok: false,
      error: "invalid_translation",
      issues: [expect.objectContaining({ kind: "missing-token", tokens: ["{name}"] })],
    });
    expect(saveTranslationMock).not.toHaveBeenCalled();
  });

  it("does not treat extra target interpolations as a hard failure", async () => {
    stubSegment("Hello {{name}}");
    getMessageFormatMock.mockResolvedValue("i18next");
    saveTranslationMock.mockResolvedValue({
      text: "Bonjour {{name}} {{unused}}",
      updatedAt: new Date("2026-10-11T00:00:00.000Z"),
    });

    const result = await updateMcpTranslation({
      ...INPUT,
      targetText: "Bonjour {{name}} {{unused}}",
    });

    expect(result).toMatchObject({
      ok: true,
      value: { targetText: "Bonjour {{name}} {{unused}}", status: "draft" },
    });
    expect(saveTranslationMock).toHaveBeenCalledOnce();
  });
});
