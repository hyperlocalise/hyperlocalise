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
  segmentKey,
  pageSegmentKey,
  buildSourcePath,
  buildPageSourcePath,
  segmentsToTranslationFile,
  segmentsToPageTranslationFile,
  parseTranslationFile,
  normalizePageScopedTranslationKeys,
} from "./segment-file";

describe("canva segment-file", () => {
  it("builds stable segment keys and source paths", () => {
    expect(segmentKey(1, 2, 3)).toBe("canva.segment.1.2.3");
    expect(buildSourcePath("design-123")).toBe("canva/designs/design-123.json");
    expect(pageSegmentKey(2, 3)).toBe("canva.segment.2.3");
    expect(buildPageSourcePath("mindful-adventure", "DAF1", 0)).toBe(
      "canva/designs/mindful-adventure-DAF1/page-1.json",
    );
    expect(buildPageSourcePath("mindful-adventure", "DAF2", 1)).toBe(
      "canva/designs/mindful-adventure-DAF2/page-2.json",
    );
  });

  it("fills page-local keys from page-scoped full keys when missing", () => {
    expect(
      normalizePageScopedTranslationKeys(
        {
          "canva.segment.0.1.0": "Bản dịch tiếng Việt",
        },
        0,
      ),
    ).toMatchObject({
      "canva.segment.1.0": "Bản dịch tiếng Việt",
    });
  });

  it("keeps page-local keys when a page-scoped full key also exists", () => {
    expect(
      normalizePageScopedTranslationKeys(
        {
          "canva.segment.0.0": "menu",
          "canva.segment.1.0.0": "Thực đơn",
        },
        1,
      ),
    ).toMatchObject({
      "canva.segment.0.0": "menu",
    });
  });

  it("writes page-local keys for a collected page file", () => {
    expect(
      segmentsToPageTranslationFile([
        {
          key: "canva.segment.2.0.0",
          pageIndex: 2,
          contentIndex: 0,
          regionIndex: 0,
          text: "Hello",
        },
      ]),
    ).toEqual({
      "canva.segment.0.0": "Hello",
    });
  });

  it("serializes and parses translation files", () => {
    const segments = [
      {
        key: "canva.segment.0.0.0",
        pageIndex: 0,
        contentIndex: 0,
        regionIndex: 0,
        text: "Hello",
      },
    ];

    expect(segmentsToTranslationFile(segments)).toEqual({
      "canva.segment.0.0.0": "Hello",
    });

    expect(
      parseTranslationFile({
        "canva.segment.0.0.0": "Hola",
        ignored: "value",
      }),
    ).toEqual({
      "canva.segment.0.0.0": "Hola",
    });
  });

  it("flattens nested job output and prefers translated values over leftover source keys", () => {
    expect(
      parseTranslationFile({
        "canva.segment.0.0": "Hello",
        canva: {
          segment: {
            "0": {
              "0": "Bonjour",
            },
          },
        },
      }),
    ).toEqual({
      "canva.segment.0.0": "Bonjour",
    });
    expect(
      parseTranslationFile({
        canva: {
          segment: {
            "0": {
              "0": "Xin chào",
            },
          },
        },
        "canva.segment.0.0": "Hello",
      }),
    ).toEqual({
      "canva.segment.0.0": "Xin chào",
    });
  });
});
