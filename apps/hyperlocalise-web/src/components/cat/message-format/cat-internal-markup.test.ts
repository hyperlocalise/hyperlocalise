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
  extractInternalMarkupSpans,
  formatInternalMarkupForDisplay,
  hasInternalMarkup,
  internalMarkupLabel,
} from "./cat-internal-markup";

const md0 = "\u001eHLMDPH_8E6DFE8F53EA_0\u001f";
const md1 = "\u001eHLMDPH_0EB5FD589564_1\u001f";
const ht0 = "\u001eHLHTPH_AABBCCDDEEFF_0\u001f";
const lq0 = "\u001eHLLQPH_112233445566_0\u001f";

describe("cat internal markup helpers", () => {
  it("extracts markdown boundary sentinels with short labels", () => {
    const message = `${md0}next-generation CAT tool${md1}`;
    const spans = extractInternalMarkupSpans(message);

    expect(spans).toEqual([
      {
        family: "MD",
        index: 0,
        literal: md0,
        start: 0,
        end: md0.length,
        label: "MD#0",
      },
      {
        family: "MD",
        index: 1,
        literal: md1,
        start: md0.length + "next-generation CAT tool".length,
        end: md0.length + "next-generation CAT tool".length + md1.length,
        label: "MD#1",
      },
    ]);
  });

  it("extracts HTML and Liquid sentinels", () => {
    const message = `Click ${ht0}here${ht0} ${lq0}`;
    const spans = extractInternalMarkupSpans(message);

    expect(spans.map((span) => span.label)).toEqual(["HT#0", "HT#0", "LQ#0"]);
    expect(spans.every((span) => span.literal.startsWith("\u001e"))).toBe(true);
  });

  it("formats sentinels for plain-text display without leaking control bytes", () => {
    const formatted = formatInternalMarkupForDisplay(
      `Global teams need a ${md0}next-generation CAT tool${md1} today.`,
    );

    expect(formatted).toBe("Global teams need a MD#0next-generation CAT toolMD#1 today.");
    expect(formatted.includes("\u001e")).toBe(false);
    expect(formatted.includes("HLMDPH")).toBe(false);
  });

  it("detects presence of internal markup", () => {
    expect(hasInternalMarkup(`plain ${md0} text`)).toBe(true);
    expect(hasInternalMarkup("plain text")).toBe(false);
  });

  it("builds stable labels", () => {
    expect(internalMarkupLabel("MD", 2)).toBe("MD#2");
    expect(internalMarkupLabel("HT", 0)).toBe("HT#0");
    expect(internalMarkupLabel("LQ", 11)).toBe("LQ#11");
  });

  it("returns no spans for empty or non-sentinel text", () => {
    expect(extractInternalMarkupSpans("")).toEqual([]);
    expect(extractInternalMarkupSpans("Hello {name}")).toEqual([]);
    expect(extractInternalMarkupSpans("HLMDPH_FAKE_0")).toEqual([]);
  });
});
