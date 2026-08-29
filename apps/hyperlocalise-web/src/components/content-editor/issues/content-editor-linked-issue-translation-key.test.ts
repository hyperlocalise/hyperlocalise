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
import { describe, expect, it } from "vite-plus/test";

import { resolveCatLinkedIssueTranslationKeyId } from "./content-editor-linked-issue-translation-key";

describe("resolveCatLinkedIssueTranslationKeyId", () => {
  it("uses the segment id for native text segments", () => {
    expect(
      resolveCatLinkedIssueTranslationKeyId({
        isNativeProject: true,
        segmentId: "key-1",
        contentKind: "text",
      }),
    ).toBe("key-1");
  });

  it("uses the segment id when the content kind is unknown", () => {
    expect(
      resolveCatLinkedIssueTranslationKeyId({
        isNativeProject: true,
        segmentId: "key-1",
        contentKind: undefined,
      }),
    ).toBe("key-1");
  });

  it("uses the segment id for image URL segments, which are translation keys", () => {
    expect(
      resolveCatLinkedIssueTranslationKeyId({
        isNativeProject: true,
        segmentId: "key-1",
        contentKind: "image_url",
      }),
    ).toBe("key-1");
  });

  it("returns null for file-backed segments whose id is a source file id", () => {
    expect(
      resolveCatLinkedIssueTranslationKeyId({
        isNativeProject: true,
        segmentId: "source-file-1",
        contentKind: "image_file",
      }),
    ).toBeNull();
    expect(
      resolveCatLinkedIssueTranslationKeyId({
        isNativeProject: true,
        segmentId: "source-file-1",
        contentKind: "office_file",
      }),
    ).toBeNull();
  });

  it("returns null for provider-backed projects", () => {
    expect(
      resolveCatLinkedIssueTranslationKeyId({
        isNativeProject: false,
        segmentId: "crowdin-string-1",
        contentKind: "text",
      }),
    ).toBeNull();
  });

  it("returns null when the segment id is empty", () => {
    expect(
      resolveCatLinkedIssueTranslationKeyId({
        isNativeProject: true,
        segmentId: "",
        contentKind: "text",
      }),
    ).toBeNull();
  });
});
