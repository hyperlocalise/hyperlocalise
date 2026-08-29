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

import { entriesFromHlOutput, parseHlEntriesJson } from "./hl-entries";

describe("parseHlEntriesJson", () => {
  it("accepts mixed plain strings and enriched entry objects", () => {
    expect(
      parseHlEntriesJson({
        plain: "Hello",
        cta: { text: "Continue", maxLength: 24, context: "button" },
      }),
    ).toEqual({
      plain: "Hello",
      cta: { text: "Continue", maxLength: 24, context: "button" },
    });
  });

  it("rejects non-object payloads and invalid entry shapes", () => {
    expect(() => parseHlEntriesJson([])).toThrow(/must be a JSON object/);
    expect(() => parseHlEntriesJson({ bad: 12 })).toThrow(/must be a string or object/);
    expect(() => parseHlEntriesJson({ bad: { maxLength: 4 } })).toThrow(
      /must be a string or object/,
    );
  });

  it("skips the reserved document envelope", () => {
    expect(
      parseHlEntriesJson({
        "md.Heading[0]": { text: "Title", fingerprint: "abc", path: "Heading[0]", kind: "body" },
        __hl_document: { format: "markdown", parts: [] },
      }),
    ).toEqual({
      "md.Heading[0]": { text: "Title", fingerprint: "abc", path: "Heading[0]", kind: "body" },
    });
  });
});

describe("entriesFromHlOutput", () => {
  it("maps plain hl entries output into project source string entries", () => {
    expect(
      entriesFromHlOutput({
        "greeting.title": "Hello",
        "greeting.subtitle": "Welcome",
      }),
    ).toEqual([
      {
        key: "greeting.title",
        text: "Hello",
        context: null,
        type: "string",
      },
      {
        key: "greeting.subtitle",
        text: "Welcome",
        context: null,
        type: "string",
      },
    ]);
  });

  it("maps enriched hl entries output with maxLength metadata", () => {
    expect(
      entriesFromHlOutput({
        cta: { text: "Continue", maxLength: 24 },
        plain: "No limit",
      }),
    ).toEqual([
      {
        key: "cta",
        text: "Continue",
        context: null,
        type: "string",
        maxLength: 24,
      },
      {
        key: "plain",
        text: "No limit",
        context: null,
        type: "string",
      },
    ]);
  });

  it("drops blank keys, empty values, and non-positive maxLength values", () => {
    expect(
      entriesFromHlOutput({
        "": "ignored",
        "valid.key": "   ",
        "kept.key": "Value",
        "limited.key": { text: "Short", maxLength: 0 },
      }),
    ).toEqual([
      {
        key: "kept.key",
        text: "Value",
        context: null,
        type: "string",
      },
      {
        key: "limited.key",
        text: "Short",
        context: null,
        type: "string",
      },
    ]);
  });

  it("truncates fractional maxLength values from hl entries output", () => {
    expect(
      entriesFromHlOutput({
        cta: { text: "Continue", maxLength: 24.9 },
      }),
    ).toEqual([
      {
        key: "cta",
        text: "Continue",
        context: null,
        type: "string",
        maxLength: 24,
      },
    ]);
  });
});
