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
  formatToolSubject,
  getExploreRollupStats,
  getToolName,
  groupToolActivityBlocks,
  isExploreToolPart,
  type ToolPart,
} from "./tool-activity";

function toolPart(
  name: string,
  input: Record<string, unknown>,
  state: ToolPart["state"] = "output-available",
): ToolPart {
  return {
    type: `tool-${name}`,
    toolCallId: `${name}-${JSON.stringify(input)}`,
    state,
    input,
  } as ToolPart;
}

describe("tool-activity helpers", () => {
  it("detects explore tools from static and dynamic parts", () => {
    expect(isExploreToolPart(toolPart("grep", { pattern: "Save" }))).toBe(true);
    expect(isExploreToolPart(toolPart("captureScreenshot", {}))).toBe(false);
    expect(
      isExploreToolPart({
        type: "dynamic-tool",
        toolName: "read",
        toolCallId: "dyn-read",
        state: "output-available",
        input: { path: "src/a.tsx" },
        output: { content: "ok" },
      }),
    ).toBe(true);
  });

  it("groups consecutive explore tools and breaks on action tools", () => {
    const parts = [
      toolPart("grep", { pattern: "Save" }),
      toolPart("read", { path: "apps/web/src/account-form.tsx" }),
      toolPart("captureScreenshot", { target: { storyId: "story" } }),
      toolPart("glob", { pattern: "**/*.tsx" }),
    ];

    expect(groupToolActivityBlocks(parts)).toEqual([
      { kind: "explore", parts: [parts[0], parts[1]] },
      { kind: "single", part: parts[2] },
      { kind: "explore", parts: [parts[3]] },
    ]);
  });

  it("formats path subjects to basenames", () => {
    expect(formatToolSubject("apps/web/src/account-form.tsx")).toBe("account-form.tsx");
    expect(formatToolSubject("Save")).toBe("Save");
    expect(getToolName(toolPart("fuzzySearch", { query: "label" }))).toBe("fuzzySearch");
  });

  it("summarizes explore rollups for searches and reads", () => {
    const mixed = [
      toolPart("grep", { pattern: "Save" }),
      toolPart("read", { path: "apps/web/src/account-form.tsx" }),
      toolPart("grep", { pattern: "Cancel" }),
    ];
    expect(getExploreRollupStats(mixed)).toMatchObject({
      subject: "account-form.tsx",
      searchCount: 2,
      readCount: 1,
      onlyReads: false,
      count: 2,
    });

    const readsOnly = [toolPart("read", { path: "a.tsx" }), toolPart("read", { path: "b.tsx" })];
    expect(getExploreRollupStats(readsOnly)).toMatchObject({
      onlyReads: true,
      readCount: 2,
      subject: "b.tsx",
    });
  });
});
