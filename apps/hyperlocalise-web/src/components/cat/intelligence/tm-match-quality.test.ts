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

import { inferTmMatchKind, requiresLowMatchConfirmation } from "./tm-match-quality";

describe("inferTmMatchKind", () => {
  it("classifies below-100 scores as fuzzy", () => {
    expect(inferTmMatchKind(85, "Hello", "Hello")).toBe("fuzzy");
  });

  it("classifies identical source at 100% as exact", () => {
    expect(inferTmMatchKind(100, "Hello world", "Hello world")).toBe("exact");
  });

  it("classifies different source at 100% as context", () => {
    expect(inferTmMatchKind(100, "Hello", "Hello world")).toBe("context");
  });
});

describe("requiresLowMatchConfirmation", () => {
  it("requires confirmation below 70%", () => {
    expect(requiresLowMatchConfirmation(69)).toBe(true);
    expect(requiresLowMatchConfirmation(70)).toBe(false);
  });
});
