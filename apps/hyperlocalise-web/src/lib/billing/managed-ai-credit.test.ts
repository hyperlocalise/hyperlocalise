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

import { billableAutumnTokenUsage } from "@/lib/billing/managed-ai-credit";

describe("managed AI credit", () => {
  it("sends model input/output tokens and zeroes BYOK usage", () => {
    expect(
      billableAutumnTokenUsage("gateway", {
        inputTokens: 1500,
        outputTokens: 500,
        cacheReadTokens: 20,
        totalTokens: 2020,
      }),
    ).toEqual({
      inputTokens: 1500,
      outputTokens: 500,
      cacheReadTokens: 20,
    });
    expect(
      billableAutumnTokenUsage("byok", {
        inputTokens: 1500,
        outputTokens: 500,
        totalTokens: 2000,
      }),
    ).toEqual({
      inputTokens: 0,
      outputTokens: 0,
    });
  });
});
