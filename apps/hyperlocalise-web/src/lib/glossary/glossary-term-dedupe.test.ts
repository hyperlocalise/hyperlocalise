/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { describe, expect, it } from "vite-plus/test";

import { createGlossaryTermDuplicateTracker } from "./glossary-term-dedupe";

describe("createGlossaryTermDuplicateTracker", () => {
  it("uses exact keys for case-sensitive terms", () => {
    const tracker = createGlossaryTermDuplicateTracker([{ sourceTerm: "Hello" }]);

    expect(tracker.hasDuplicateAndTrack({ sourceTerm: "Hello", caseSensitive: true })).toBe(true);
    expect(tracker.hasDuplicateAndTrack({ sourceTerm: "hello", caseSensitive: true })).toBe(false);
  });

  it("uses lowercased keys for case-insensitive terms", () => {
    const tracker = createGlossaryTermDuplicateTracker([{ sourceTerm: "Hello" }]);

    expect(tracker.hasDuplicateAndTrack({ sourceTerm: "hello", caseSensitive: false })).toBe(true);
  });
});
