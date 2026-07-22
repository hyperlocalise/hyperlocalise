/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { describe, expect, it } from "vite-plus/test";

import {
  formatMemoryReductionPercent,
  getKnowledgeMemoryPreviewState,
} from "./knowledge-memory-preview-state";

describe("getKnowledgeMemoryPreviewState", () => {
  it("enables preview when a locale or source query is present", () => {
    expect(
      getKnowledgeMemoryPreviewState({
        targetLocale: "en-AU",
        sourceText: "",
        isPreviewing: false,
      }),
    ).toMatchObject({
      hasQuery: true,
      canPreview: true,
    });
  });

  it("blocks preview while loading or when the query is empty", () => {
    expect(
      getKnowledgeMemoryPreviewState({
        targetLocale: "",
        sourceText: "",
        isPreviewing: false,
      }),
    ).toMatchObject({
      hasQuery: false,
      canPreview: false,
    });

    expect(
      getKnowledgeMemoryPreviewState({
        targetLocale: "fr-FR",
        sourceText: "Launch globally",
        isPreviewing: true,
      }),
    ).toMatchObject({
      hasQuery: true,
      canPreview: false,
    });
  });
});

describe("formatMemoryReductionPercent", () => {
  it("formats rounded non-negative reduction percentages", () => {
    expect(formatMemoryReductionPercent(91.25)).toBe("91% smaller");
    expect(formatMemoryReductionPercent(-4)).toBe("0% smaller");
  });
});
