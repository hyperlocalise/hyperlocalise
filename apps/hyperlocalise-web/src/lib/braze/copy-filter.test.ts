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

import { collectKnownBrazeCopyIds, shouldSkipBrazeLibraryItem } from "./copy-filter";

describe("braze copy filter", () => {
  it("skips known locale-copy ids and suffix names", () => {
    const knownCopyIds = collectKnownBrazeCopyIds([{ localeCopyIds: { "fr-FR": "copy-1" } }]);
    expect(
      shouldSkipBrazeLibraryItem({
        id: "copy-1",
        name: "Welcome",
        knownCopyIds,
        suffixes: ["fr-FR"],
      }),
    ).toBe(true);
    expect(
      shouldSkipBrazeLibraryItem({
        id: "source-1",
        name: "Welcome_fr-FR",
        knownCopyIds,
        suffixes: ["fr-FR"],
      }),
    ).toBe(true);
    expect(
      shouldSkipBrazeLibraryItem({
        id: "source-1",
        name: "Welcome",
        knownCopyIds,
        suffixes: ["fr-FR"],
      }),
    ).toBe(false);
    expect(
      shouldSkipBrazeLibraryItem({
        id: "source-2",
        name: "Welcome_de-DE",
        knownCopyIds,
        suffixes: ["fr-FR"],
      }),
    ).toBe(true);
  });
});
