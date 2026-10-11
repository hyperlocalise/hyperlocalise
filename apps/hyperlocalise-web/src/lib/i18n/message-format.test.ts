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
  DEFAULT_MESSAGE_FORMAT,
  messageFormatParsesIcu,
  messageFormatParsesInterpolations,
  normalizeMessageFormat,
} from "./message-format";

describe("normalizeMessageFormat", () => {
  it.each([
    [undefined, DEFAULT_MESSAGE_FORMAT],
    [null, DEFAULT_MESSAGE_FORMAT],
    ["", DEFAULT_MESSAGE_FORMAT],
    ["   ", DEFAULT_MESSAGE_FORMAT],
    ["bogus", DEFAULT_MESSAGE_FORMAT],
    ["auto", "auto"],
    ["ICU", "icu"],
    [" i18next ", "i18next"],
  ] as const)("maps %j to %j", (input, expected) => {
    expect(normalizeMessageFormat(input)).toBe(expected);
  });
});

describe("message format syntax flags", () => {
  it("parses ICU except in i18next mode", () => {
    expect(messageFormatParsesIcu("auto")).toBe(true);
    expect(messageFormatParsesIcu("icu")).toBe(true);
    expect(messageFormatParsesIcu("i18next")).toBe(false);
  });

  it("parses interpolations except in icu mode", () => {
    expect(messageFormatParsesInterpolations("auto")).toBe(true);
    expect(messageFormatParsesInterpolations("i18next")).toBe(true);
    expect(messageFormatParsesInterpolations("icu")).toBe(false);
  });
});
