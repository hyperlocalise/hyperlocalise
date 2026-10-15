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

import { slugifyCanvaDesignTitle } from "./names";

describe("slugifyCanvaDesignTitle", () => {
  it("slugifies a design title", () => {
    expect(slugifyCanvaDesignTitle("Mindful Adventure Travel", "id")).toBe(
      "mindful-adventure-travel",
    );
  });

  it("falls back to the design id when the title is empty", () => {
    expect(slugifyCanvaDesignTitle(undefined, "DAF1")).toBe("daf1");
    expect(slugifyCanvaDesignTitle("   ", "design_123")).toBe("design-123");
  });
});
