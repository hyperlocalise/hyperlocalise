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

import { llmProviderCatalog } from "@/lib/providers/shared/catalog";

describe("llmProviderCatalog", () => {
  it("uses Anthropic native model IDs for BYOK validation", () => {
    expect(llmProviderCatalog.anthropic.models).toEqual([
      "claude-sonnet-4-6",
      "claude-opus-4-8",
      "claude-opus-4-7",
      "claude-opus-4-6",
      "claude-haiku-4-5",
      "claude-sonnet-4-5",
      "claude-opus-4-5",
    ]);

    expect(llmProviderCatalog.anthropic.models).not.toContain("claude-sonnet-4.6");
  });
});
