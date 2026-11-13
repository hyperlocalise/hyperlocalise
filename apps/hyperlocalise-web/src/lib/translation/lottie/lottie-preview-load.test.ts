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
  buildLottiePreviewValuesFromSegments,
  extractDotLottieEntryValues,
} from "./lottie-preview-load";

describe("buildLottiePreviewValuesFromSegments", () => {
  it("uses target text when present and falls back to source text", () => {
    expect(
      buildLottiePreviewValuesFromSegments(
        [
          { key: "layers[0].t.d.k[0].s.t", sourceText: "Hello", targetText: "Bonjour" },
          { key: "layers[1].t.d.k[0].s.t", sourceText: "World", targetText: "   " },
        ],
        "target",
      ),
    ).toEqual({
      "layers[0].t.d.k[0].s.t": "Bonjour",
      "layers[1].t.d.k[0].s.t": "World",
    });
  });
});

describe("extractDotLottieEntryValues", () => {
  it("maps composite keys to inner Lottie paths for one archive entry", () => {
    expect(
      extractDotLottieEntryValues(
        {
          "a/promo.json#layers[0].t.d.k[0].s.t": "A",
          "a/other.json#layers[0].t.d.k[0].s.t": "B",
        },
        "a/promo.json",
      ),
    ).toEqual({
      "layers[0].t.d.k[0].s.t": "A",
    });
  });
});
