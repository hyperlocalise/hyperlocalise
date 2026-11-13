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

import { normalizeUsdAmount } from "@/lib/billing/managed-ai-pricing";

describe("managed AI pricing", () => {
  it("stores USD amounts with fixed precision", () => {
    expect(normalizeUsdAmount(0.0123456784)).toBe("0.012345678");
  });
});
