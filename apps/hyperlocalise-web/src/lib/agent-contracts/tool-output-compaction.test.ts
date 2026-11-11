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
  TOOL_OUTPUT_MAX_ARRAY_ITEMS,
  TOOL_OUTPUT_MAX_STRING_LENGTH,
  compactToolOutput,
} from "./tool-output-compaction";

describe("compactToolOutput", () => {
  it("returns small outputs unchanged", () => {
    const output = { ok: true, matches: ["a", "b"] };
    expect(compactToolOutput(output)).toEqual({ output, omitted: 0 });
  });

  it("shortens long strings and counts what it left out", () => {
    const result = compactToolOutput({ content: "y".repeat(TOOL_OUTPUT_MAX_STRING_LENGTH + 10) });
    expect(result.omitted).toBe(10);
    expect((result.output as { content: string }).content).toMatch(/… \[10 more characters\]$/);
  });

  it("keeps long links whole so images still render", () => {
    const url = `https://files.example/${"z".repeat(TOOL_OUTPUT_MAX_STRING_LENGTH)}`;
    expect(compactToolOutput({ success: true, url })).toEqual({
      output: { success: true, url },
      omitted: 0,
    });
  });

  it("caps long arrays", () => {
    const items = Array.from({ length: TOOL_OUTPUT_MAX_ARRAY_ITEMS + 5 }, (_, index) => index);
    const result = compactToolOutput(items);
    expect(result.omitted).toBe(5);
    expect(result.output).toHaveLength(TOOL_OUTPUT_MAX_ARRAY_ITEMS + 1);
    expect((result.output as unknown[]).at(-1)).toBe("[5 more items]");
  });
});
