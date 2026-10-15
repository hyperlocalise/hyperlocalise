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
  getMessageFormatMock,
  getSegmentDetailMock,
  isLockedMock,
  saveTranslationMock,
  updateStatusMock,
} = vi.hoisted(() => ({
  getMessageFormatMock: vi.fn(),
  getSegmentDetailMock: vi.fn(),
  isLockedMock: vi.fn(),
  saveTranslationMock: vi.fn(),
  updateStatusMock: vi.fn(),
}));

vi.mock("@/lib/projects/content-editor/content-editor-segment-lock-service", () => ({
  isCatSegmentLocked: isLockedMock,
}));

vi.mock("@/lib/projects/content-editor/native-content-editor-service", () => ({
  getNativeProjectContentEditorSegmentDetail: getSegmentDetailMock,
  saveNativeProjectContentEditorTranslation: saveTranslationMock,
  updateNativeProjectTranslationStatus: updateStatusMock,
}));

vi.mock("@/lib/projects/files/source-file-message-format", () => ({
  getRepositorySourceFileMessageFormat: getMessageFormatMock,
}));

import { setMcpTranslationStatus, updateMcpTranslation } from "./mcp-update-translation";

const INPUT = {
  organizationId: "org_1",
  projectId: "project_1",
  translationKeyId: "key_1",
  targetLocale: "fr-FR",
  actorUserId: "user_1",
};

function stubSegment(sourceText: string, targetText?: string) {
  getSegmentDetailMock.mockResolvedValue({
    segment: {
      sourcePath: "locales/en.json",
      sourceText,
    },
    ...(targetText === undefined
      ? {}
      : {
          target: {
            text: targetText,
            status: "draft",
          },
        }),
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

  it("rejects an empty target when approve is requested", async () => {
    stubSegment("Hello");
    getMessageFormatMock.mockResolvedValue("auto");

    const result = await updateMcpTranslation({
      ...INPUT,
      targetText: "   ",
      approve: true,
    });

    expect(result).toEqual({
      ok: false,
      error: "invalid_translation",
      issues: [{ kind: "empty-target" }],
    });
    expect(getMessageFormatMock).not.toHaveBeenCalled();
    expect(saveTranslationMock).not.toHaveBeenCalled();
  });

  it("allows an empty draft when approve is not requested", async () => {
    stubSegment("Hello");
    getMessageFormatMock.mockResolvedValue("auto");
    saveTranslationMock.mockResolvedValue({
      text: "",
      updatedAt: new Date("2026-10-11T00:00:00.000Z"),
    });

    const result = await updateMcpTranslation({
      ...INPUT,
      targetText: "",
    });

    expect(result).toMatchObject({
      ok: true,
      value: { targetText: "", status: "draft" },
    });
    expect(saveTranslationMock).toHaveBeenCalledOnce();
  });
});

describe("setMcpTranslationStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isLockedMock.mockResolvedValue(false);
    updateStatusMock.mockResolvedValue({
      text: "Bonjour",
      status: "approved",
    });
  });

  it("rejects approval when the stored target is empty", async () => {
    stubSegment("Hello", "   ");
    getMessageFormatMock.mockResolvedValue("auto");

    const result = await setMcpTranslationStatus({
      ...INPUT,
      status: "approved",
    });

    expect(result).toEqual({
      ok: false,
      error: "invalid_translation",
      issues: [{ kind: "empty-target" }],
    });
    expect(getMessageFormatMock).not.toHaveBeenCalled();
    expect(updateStatusMock).not.toHaveBeenCalled();
  });

  it("rejects approval when the stored target drops a required placeholder", async () => {
    stubSegment("Hello {{name}}", "Bonjour");
    getMessageFormatMock.mockResolvedValue("i18next");

    const result = await setMcpTranslationStatus({
      ...INPUT,
      status: "approved",
    });

    expect(result).toMatchObject({
      ok: false,
      error: "invalid_translation",
      issues: [expect.objectContaining({ kind: "missing-token", tokens: ["{{name}}"] })],
    });
    expect(updateStatusMock).not.toHaveBeenCalled();
  });

  it("still allows reject or needs_review on an empty stored target", async () => {
    stubSegment("Hello", "");
    updateStatusMock.mockResolvedValue({
      text: "",
      status: "rejected",
    });

    const result = await setMcpTranslationStatus({
      ...INPUT,
      status: "rejected",
    });

    expect(result).toEqual({
      ok: true,
      value: {
        targetText: "",
        status: "rejected",
        sourcePath: "locales/en.json",
      },
    });
    expect(getMessageFormatMock).not.toHaveBeenCalled();
    expect(updateStatusMock).toHaveBeenCalledOnce();
  });

  it("approves a valid stored target", async () => {
    stubSegment("Hello {{name}}", "Bonjour {{name}}");
    getMessageFormatMock.mockResolvedValue("i18next");
    updateStatusMock.mockResolvedValue({
      text: "Bonjour {{name}}",
      status: "approved",
    });

    const result = await setMcpTranslationStatus({
      ...INPUT,
      status: "approved",
    });

    expect(result).toEqual({
      ok: true,
      value: {
        targetText: "Bonjour {{name}}",
        status: "approved",
        sourcePath: "locales/en.json",
      },
    });
    expect(updateStatusMock).toHaveBeenCalledWith({
      organizationId: INPUT.organizationId,
      projectId: INPUT.projectId,
      translationKeyId: INPUT.translationKeyId,
      targetLocale: INPUT.targetLocale,
      status: "approved",
      actorUserId: INPUT.actorUserId,
    });
  });
});
