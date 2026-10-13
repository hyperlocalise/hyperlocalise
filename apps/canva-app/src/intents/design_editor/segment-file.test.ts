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
  buildPageSourcePath,
  buildSourcePath,
  countTranslatedRegionsForContentIndex,
  lookupTranslatedText,
  normalizePageScopedTranslationKeys,
  parseTranslationFile,
  segmentKey,
  segmentsToTranslationFile,
} from "./segment-file";

describe("segment-file", () => {
  it("builds stable segment keys and source paths", () => {
    expect(segmentKey(1, 2, 3)).toBe("canva.segment.1.2.3");
    expect(buildSourcePath("design-123")).toBe("canva/designs/design-123.json");
    expect(buildPageSourcePath("mic", "DAF1", 0)).toBe("canva/designs/mic-DAF1/page-1.json");
    expect(buildPageSourcePath("mic", "DAF2", 1)).toBe("canva/designs/mic-DAF2/page-2.json");
  });

  it("serializes and parses translation files", () => {
    const file = segmentsToTranslationFile([
      {
        key: "canva.segment.0.0.0",
        pageIndex: 0,
        contentIndex: 0,
        regionIndex: 0,
        text: "Hello",
      },
      {
        key: "canva.segment.0.0.1",
        pageIndex: 0,
        contentIndex: 0,
        regionIndex: 1,
        text: "World",
      },
    ]);

    expect(file).toEqual({
      "canva.segment.0.0.0": "Hello",
      "canva.segment.0.0.1": "World",
    });

    expect(parseTranslationFile(file)).toEqual(file);
  });

  it("fills page-local keys from page-scoped full keys when missing", () => {
    expect(
      normalizePageScopedTranslationKeys(
        {
          "canva.segment.0.1.0":
            "Thưởng thức hương vị gấp đôi với ưu đãi đặc biệt Mua 1 Tặng 1 áp dụng cho một số món ăn và đồ uống được chọn.",
        },
        0,
      ),
    ).toMatchObject({
      "canva.segment.1.0":
        "Thưởng thức hương vị gấp đôi với ưu đãi đặc biệt Mua 1 Tặng 1 áp dụng cho một số món ăn và đồ uống được chọn.",
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

  it("does not borrow another page full key when pageIndex is provided", () => {
    expect(
      lookupTranslatedText(
        {
          "canva.segment.0.0": "menu",
          "canva.segment.0.0.0": "Thực đơn",
        },
        0,
        0,
        1,
      ),
    ).toBe("menu");
  });

  it("counts translated regions for a text box content index", () => {
    expect(
      countTranslatedRegionsForContentIndex(
        {
          "canva.segment.0.0": "Mua 1 tặng 1",
          "canva.segment.0.1": "miễn phí",
          "canva.segment.1.0": "Khác",
        },
        0,
      ),
    ).toBe(2);
    expect(
      countTranslatedRegionsForContentIndex(
        {
          "canva.segment.0.0": "Mua 1 tặng 1",
        },
        0,
      ),
    ).toBe(1);
  });

  it("ignores blank translations when looking up apply text", () => {
    expect(
      lookupTranslatedText(
        {
          "canva.segment.0.0": "   ",
          "canva.segment.1.0.0": "Hola",
        },
        0,
        0,
      ),
    ).toBe("Hola");
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
