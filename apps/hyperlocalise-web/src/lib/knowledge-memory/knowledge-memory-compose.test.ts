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

import { composeScopedKnowledgeMemory } from "./knowledge-memory-compose";

describe("composeScopedKnowledgeMemory", () => {
  it("returns an empty string when both scopes are empty", () => {
    expect(composeScopedKnowledgeMemory({})).toBe("");
    expect(
      composeScopedKnowledgeMemory({
        projectGuideline: "  ",
        workspaceGuideline: "\n",
      }),
    ).toBe("");
  });

  it("returns a single scope without a heading when the other is empty", () => {
    expect(
      composeScopedKnowledgeMemory({
        projectGuideline: "Use sentence case.",
      }),
    ).toBe("Use sentence case.");
    expect(
      composeScopedKnowledgeMemory({
        workspaceGuideline: "Prefer colour in en-AU.",
      }),
    ).toBe("Prefer colour in en-AU.");
  });

  it("labels both scopes when they both have content", () => {
    expect(
      composeScopedKnowledgeMemory({
        projectGuideline: "Checkout buttons stay short.",
        workspaceGuideline: "Prefer colour in en-AU.",
      }),
    ).toBe(
      [
        "## Project guideline",
        "Checkout buttons stay short.",
        "## Workspace guideline",
        "Prefer colour in en-AU.",
      ].join("\n\n"),
    );
  });
});
