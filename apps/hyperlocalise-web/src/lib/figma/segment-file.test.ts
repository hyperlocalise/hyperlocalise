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

import {
  buildFigmaPageFileName,
  buildFigmaPageSourcePath,
  buildFigmaSourcePath,
  expandFigmaLockKeysBySharedSource,
  figmaSourceFileNeedsReupload,
  normalizeFigmaSegmentText,
  parseTranslationFile,
  propagateFigmaTranslationsBySharedSource,
  sanitizeFigmaId,
  segmentsToTranslationFile,
} from "./segment-file";

describe("figma segment file", () => {
  it("builds file-key plus slugged page title paths", () => {
    expect(buildFigmaSourcePath("abc123", "12:34")).toBe("figma/files/abc123/page-12-34.json");
    expect(buildFigmaSourcePath("../oops", "page/a")).toBe("figma/files/oops/page-page-a.json");
    expect(sanitizeFigmaId("12:34")).toBe("12-34");
    expect(buildFigmaPageFileName({ pageName: "Cover", pageId: "12:34" })).toBe("cover-12-34.json");
    expect(
      buildFigmaPageSourcePath({
        fileName: "Portfolio Template Edit Portfolio Export",
        fileKey: "abc123",
        pageName: "Home",
        pageId: "12:34",
      }),
    ).toBe("figma/files/abc123/home-12-34.json");
  });

  it("normalizes line-separator whitespace in stored segment text", () => {
    expect(normalizeFigmaSegmentText("Print\u2028Marketing.")).toBe("Print Marketing.");
    expect(
      segmentsToTranslationFile([
        {
          key: "figma.k.01ARZ3NDEKTSV4RRFFQ69G5FAV",
          nodeId: "1:2",
          regionIndex: 0,
          text: "Design &\u2028Brand\u2028Culture.",
        },
      ]),
    ).toEqual({
      "figma.k.01ARZ3NDEKTSV4RRFFQ69G5FAV": "Design & Brand Culture.",
    });
  });

  it("round-trips stamped keys and skips empty or legacy keys", () => {
    const file = segmentsToTranslationFile([
      {
        key: "figma.k.01ARZ3NDEKTSV4RRFFQ69G5FAV",
        nodeId: "1:2",
        regionIndex: 0,
        text: "Hello",
      },
      {
        key: "figma.segment.1:2.0",
        nodeId: "1:2",
        regionIndex: 0,
        text: "Legacy",
      },
      {
        key: "figma.k.01ARZ3NDEKTSV4RRFFQ69G5FAW",
        nodeId: "1:3",
        regionIndex: 0,
        text: "   ",
      },
    ]);

    expect(file).toEqual({ "figma.k.01ARZ3NDEKTSV4RRFFQ69G5FAV": "Hello" });
    expect(
      parseTranslationFile({
        "figma.k.01ARZ3NDEKTSV4RRFFQ69G5FAV": "Hola",
        "figma.segment.1:1.0": "ignored legacy",
        ignored: 1,
      }),
    ).toEqual({ "figma.k.01ARZ3NDEKTSV4RRFFQ69G5FAV": "Hola" });
  });

  it("flags legacy source files for reupload", () => {
    expect(figmaSourceFileNeedsReupload({ "figma.k.abc": "Hi" })).toBe(false);
    expect(figmaSourceFileNeedsReupload({ "figma.segment.1:1.0": "Hi" })).toBe(true);
  });

  it("expands lock keys to every stamp key with the same source text", () => {
    const sourceEntries = {
      "figma.k.a": "Project title",
      "figma.k.b": "Project title",
      "figma.k.c": "Other",
    };
    expect(expandFigmaLockKeysBySharedSource(["figma.k.b"], sourceEntries).sort()).toEqual([
      "figma.k.a",
      "figma.k.b",
    ]);
  });

  it("propagates a translation to duplicate source stamp keys", () => {
    const sourceByKey = {
      "figma.k.a": "Project title",
      "figma.k.b": "Project title",
    };
    expect(
      propagateFigmaTranslationsBySharedSource(sourceByKey, {
        "figma.k.a": "Project title",
        "figma.k.b": "Tiêu đề dự án",
      }),
    ).toEqual({
      "figma.k.a": "Tiêu đề dự án",
      "figma.k.b": "Tiêu đề dự án",
    });
  });
});
