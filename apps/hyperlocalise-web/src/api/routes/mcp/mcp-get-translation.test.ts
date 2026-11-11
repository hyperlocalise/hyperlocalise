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

const { getSegmentDetailMock, getMessageFormatMock, listLinkedIssuesMock } = vi.hoisted(() => ({
  getSegmentDetailMock: vi.fn(),
  getMessageFormatMock: vi.fn(),
  listLinkedIssuesMock: vi.fn(),
}));

vi.mock("@/lib/projects/content-editor/native-content-editor-service", () => ({
  getNativeProjectContentEditorSegmentDetail: getSegmentDetailMock,
}));

vi.mock("@/lib/projects/files/source-file-message-format", () => ({
  getRepositorySourceFileMessageFormat: getMessageFormatMock,
}));

vi.mock("@/lib/projects/issue-sheet/issue-sheet-service", () => ({
  IssueSheetService: class {
    listLinkedIssueIdentifiers = listLinkedIssuesMock;
  },
}));

import { loadMcpTranslation } from "./mcp-get-translation";

describe("loadMcpTranslation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listLinkedIssuesMock.mockResolvedValue([{ id: "issue_1", identifier: "DOC-1" }]);
  });

  it("returns null when the segment is missing", async () => {
    getSegmentDetailMock.mockResolvedValue(null);

    await expect(
      loadMcpTranslation({
        organizationId: "org_1",
        projectId: "project_1",
        translationKeyId: "key_1",
        sourceLocale: "en-US",
        targetLocale: "fr-FR",
      }),
    ).resolves.toBeNull();
  });

  it("exposes ICU blocks and placeholders for auto-format source text", async () => {
    getSegmentDetailMock.mockResolvedValue({
      segment: {
        externalStringId: "key_1",
        key: "cart.count",
        sourcePath: "locales/en.json",
        sourceText: "{count, plural, one {# item} other {# items}}",
        context: "cart badge",
        maxLength: 40,
      },
      target: {
        text: "{count, plural, one {# article} other {# articles}}",
        status: "draft",
      },
    });
    getMessageFormatMock.mockResolvedValue("auto");

    const detail = await loadMcpTranslation({
      organizationId: "org_1",
      projectId: "project_1",
      translationKeyId: "key_1",
      sourceLocale: "en-US",
      targetLocale: "fr-FR",
    });

    expect(getMessageFormatMock).toHaveBeenCalledWith({
      organizationId: "org_1",
      projectId: "project_1",
      sourcePath: "locales/en.json",
    });
    expect(detail).toMatchObject({
      id: "key_1",
      key: "cart.count",
      sourceText: "{count, plural, one {# item} other {# items}}",
      targetText: "{count, plural, one {# article} other {# articles}}",
      icu: [
        expect.objectContaining({
          arg: "count",
          type: "plural",
          options: expect.arrayContaining(["one", "other"]),
        }),
      ],
      linkedIssues: [{ id: "issue_1", identifier: "DOC-1" }],
    });
    expect(detail?.placeholders).toEqual([]);
  });

  it("lists simple interpolation placeholders for auto-format source text", async () => {
    getSegmentDetailMock.mockResolvedValue({
      segment: {
        externalStringId: "key_2",
        key: "greeting",
        sourcePath: "locales/en.json",
        sourceText: "Hello {name}",
        context: null,
        maxLength: null,
      },
    });
    getMessageFormatMock.mockResolvedValue("auto");
    listLinkedIssuesMock.mockResolvedValue([]);

    const detail = await loadMcpTranslation({
      organizationId: "org_1",
      projectId: "project_1",
      translationKeyId: "key_2",
      sourceLocale: "en-US",
      targetLocale: "fr-FR",
    });

    expect(detail).toMatchObject({
      placeholders: [expect.objectContaining({ name: "name", literal: "{name}" })],
      icu: [],
      targetText: null,
    });
  });
});
