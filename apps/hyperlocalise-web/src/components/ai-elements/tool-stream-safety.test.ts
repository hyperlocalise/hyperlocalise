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

import { normalizeCodeBlockSource } from "./code-block";
import { extractToolInputDetail, getImageToolOutput, serializeToolJson } from "./tool";

describe("getImageToolOutput", () => {
  it("extracts image urls from successful screenshot tool output", () => {
    expect(
      getImageToolOutput({
        success: true,
        url: "https://download.example/story.png",
        contentType: "image/png",
        filename: "story.png",
      }),
    ).toEqual({
      url: "https://download.example/story.png",
      contentType: "image/png",
      filename: "story.png",
    });
  });

  it("ignores non-image tool output", () => {
    expect(
      getImageToolOutput({
        success: true,
        url: "https://example.com/notes.txt",
        contentType: "text/plain",
        filename: "notes.txt",
      }),
    ).toBeNull();
    expect(getImageToolOutput({ success: false, error: "failed" })).toBeNull();
    expect(
      getImageToolOutput({
        url: "https://download.example/legacy.png",
        contentType: "image/png",
        filename: "legacy.png",
      }),
    ).toBeNull();
  });
});

describe("serializeToolJson", () => {
  it("returns {} when input is undefined (streaming tool args)", () => {
    // JSON.stringify(undefined) is undefined — that previously crashed CodeBlock.split
    expect(JSON.stringify(undefined, null, 2)).toBeUndefined();
    expect(serializeToolJson(undefined)).toBe("{}");
  });

  it("stringifies objects and null", () => {
    expect(serializeToolJson({ path: "src/a.ts" })).toBe('{\n  "path": "src/a.ts"\n}');
    expect(serializeToolJson(null)).toBe("null");
  });
});

describe("extractToolInputDetail", () => {
  it("prefers known keys like path and command", () => {
    expect(extractToolInputDetail({ path: "math.ts", other: "x" })).toBe("math.ts");
    expect(extractToolInputDetail({ command: "npm test" })).toBe("npm test");
  });

  it("extracts storyId from a Storybook target object", () => {
    expect(
      extractToolInputDetail({
        target: { type: "storybook", storyId: "app-project-files-page--default" },
        viewport: { width: 1440, height: 900 },
      }),
    ).toBe("app-project-files-page--default");
  });

  it("returns null for empty or non-object input", () => {
    expect(extractToolInputDetail(undefined)).toBeNull();
    expect(extractToolInputDetail(null)).toBeNull();
    expect(extractToolInputDetail("grep")).toBeNull();
    expect(extractToolInputDetail({})).toBeNull();
  });
});

describe("normalizeCodeBlockSource", () => {
  it("coerces nullish code to an empty string", () => {
    expect(normalizeCodeBlockSource(undefined)).toBe("");
    expect(normalizeCodeBlockSource(null)).toBe("");
    expect(normalizeCodeBlockSource("line")).toBe("line");
  });
});
