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

import { diffWords } from "./document-editor-word-diff";

describe("diffWords", () => {
  it("marks replaced words", () => {
    expect(diffWords("the quick fox", "the slow fox")).toEqual([
      { kind: "same", text: "the " },
      { kind: "removed", text: "quick" },
      { kind: "added", text: "slow" },
      { kind: "same", text: " fox" },
    ]);
  });

  it("handles empty input", () => {
    expect(diffWords("", "new")).toEqual([{ kind: "added", text: "new" }]);
    expect(diffWords("old", "")).toEqual([{ kind: "removed", text: "old" }]);
  });

  it("keeps identical text as one part", () => {
    expect(diffWords("same text", "same text")).toEqual([{ kind: "same", text: "same text" }]);
  });
});
