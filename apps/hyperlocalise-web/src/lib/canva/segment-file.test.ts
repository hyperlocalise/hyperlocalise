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
import { createHash } from "node:crypto";

import { describe, expect, it } from "vite-plus/test";

import {
  buildPageSourcePath,
  buildSourcePath,
  buildSourceTextPageFile,
  isSourceTextKey,
  normalizeSegmentText,
  pageNeedsReupload,
  parseTranslationFile,
  sourceTextKey,
} from "./segment-file";

describe("canva segment-file", () => {
  it("builds source paths", () => {
    expect(buildSourcePath("design-123")).toBe("canva/designs/design-123.json");
    expect(buildPageSourcePath("mindful-adventure", "DAF1", 0)).toBe(
      "canva/designs/mindful-adventure-DAF1/page-1.json",
    );
    expect(buildPageSourcePath("mindful-adventure", "DAF2", 1)).toBe(
      "canva/designs/mindful-adventure-DAF2/page-2.json",
    );
  });

  it("normalizes unicode, whitespace, and line breaks", () => {
    expect(normalizeSegmentText("  Hello\n\n  world  ")).toBe("Hello world");
    const composed = "café";
    const decomposed = "cafe\u0301";
    expect(normalizeSegmentText(composed)).toBe(normalizeSegmentText(decomposed));
  });

  it("builds a stable source-text key", () => {
    const digest = createHash("sha256").update("Hello", "utf8").digest("hex").slice(0, 16);
    expect(sourceTextKey("Hello")).toBe(`canva.t.${digest}`);
    expect(sourceTextKey("  Hello\n")).toBe(sourceTextKey("Hello"));
    expect(isSourceTextKey(sourceTextKey("Hello"))).toBe(true);
    expect(isSourceTextKey("canva.segment.0.0")).toBe(false);
  });

  it("dedupes identical text, skips blanks, and keeps the raw value", () => {
    expect(buildSourceTextPageFile(["Hello", "  Hello\n", "   ", "World"])).toEqual({
      [sourceTextKey("Hello")]: "Hello",
      [sourceTextKey("World")]: "World",
    });
  });

  it("uses the full digest when short prefixes collide", () => {
    const file = buildSourceTextPageFile(["Alpha", "Beta"], (normalized) =>
      normalized === "Alpha"
        ? `${"a".repeat(16)}${"1".repeat(48)}`
        : `${"a".repeat(16)}${"2".repeat(48)}`,
    );
    expect(file).toEqual({
      [`canva.t.${"a".repeat(16)}${"1".repeat(48)}`]: "Alpha",
      [`canva.t.${"a".repeat(16)}${"2".repeat(48)}`]: "Beta",
    });
  });

  it("parses source-text keys and leftover positional keys", () => {
    expect(
      parseTranslationFile({
        [sourceTextKey("Hello")]: "Hola",
        "canva.segment.0.0": "Bonjour",
        ignored: "value",
      }),
    ).toEqual({
      [sourceTextKey("Hello")]: "Hola",
      "canva.segment.0.0": "Bonjour",
    });
    expect(pageNeedsReupload({ "canva.segment.0.0": "Hello" })).toBe(true);
    expect(pageNeedsReupload({ [sourceTextKey("Hello")]: "Hello" })).toBe(false);
  });

  it("flattens nested job output and prefers translated values over leftover source keys", () => {
    expect(
      parseTranslationFile({
        "canva.segment.0.0": "Hello",
        canva: {
          segment: {
            "0": {
              "0": "Bonjour",
            },
          },
        },
      }),
    ).toEqual({
      "canva.segment.0.0": "Bonjour",
    });
    expect(
      parseTranslationFile({
        canva: {
          t: {
            abcdef0123456789: "Hola",
          },
        },
        "canva.t.abcdef0123456789": "Hello",
      }),
    ).toEqual({
      "canva.t.abcdef0123456789": "Hola",
    });
  });
});
