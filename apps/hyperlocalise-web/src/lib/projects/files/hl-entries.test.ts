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
import { describe, expect, it } from "vitest";

import { entriesFromHlOutput } from "./hl-entries";

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
});
