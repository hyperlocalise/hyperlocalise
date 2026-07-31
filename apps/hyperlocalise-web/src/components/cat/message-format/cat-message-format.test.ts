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

import { analyzeCatMessageFormat, compareCatMessageFormats } from "./cat-message-format";

function compare(sourceMessage: string, targetMessage: string) {
  return compareCatMessageFormats(
    analyzeCatMessageFormat(sourceMessage),
    analyzeCatMessageFormat(targetMessage),
  );
}

describe("cat message format utilities", () => {
  it("reports missing placeholders", () => {
    const issues = compare("Hello {name}", "Xin chào");

    expect(issues).toContainEqual(
      expect.objectContaining({
        kind: "missing-token",
        tokens: ["{name}"],
      }),
    );
  });

  it("reports extra placeholders", () => {
    const issues = compare("Hello", "Xin chào {name}");

    expect(issues).toContainEqual(
      expect.objectContaining({
        kind: "extra-token",
        tokens: ["{name}"],
      }),
    );
  });

  it("accepts locale-appropriate ICU plural categories", () => {
    const issues = compare(
      "{count, plural, one {# file} other {# files}}",
      "{count, plural, one {# tệp} few {# tệp} many {# tệp} other {# tệp}}",
    );

    expect(issues.filter((issue) => issue.kind === "icu-mismatch")).toHaveLength(0);
  });

  it("reports missing ICU blocks when argument name or type differs", () => {
    const issues = compare(
      "{count, plural, one {# file} other {# files}}",
      "{items, plural, one {# tệp} other {# tệp}}",
    );

    expect(issues).toContainEqual(
      expect.objectContaining({
        kind: "icu-mismatch",
        tokens: ["{count, plural}"],
      }),
    );
  });

  it("reports parse failures", () => {
    const analysis = analyzeCatMessageFormat("{name");

    expect(analysis.parseError?.message).toBeTruthy();
  });

  it("does not pass format checks when source ICU syntax cannot be parsed", () => {
    const issues = compare("{count, plural, one {# file}}", "1 file");

    expect(issues).toContainEqual(
      expect.objectContaining({
        kind: "parse-error",
        parseTarget: "source",
      }),
    );
  });

  it("extracts markdown HLMDPH boundary tokens as markup chips", () => {
    const md0 = "\u001eHLMDPH_8E6DFE8F53EA_0\u001f";
    const md1 = "\u001eHLMDPH_0EB5FD589564_1\u001f";
    const analysis = analyzeCatMessageFormat(`${md0}next-generation CAT tool${md1}`);

    expect(analysis.tokens).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "markup",
          name: "MD#0",
          displayLabel: "MD#0",
          literal: md0,
        }),
        expect.objectContaining({
          kind: "markup",
          name: "MD#1",
          displayLabel: "MD#1",
          literal: md1,
        }),
      ]),
    );
    expect(analysis.placeholders).toHaveLength(2);
    expect(analysis.parseError).toBeUndefined();
  });

  it("reports missing markdown boundary tokens with short labels", () => {
    const md0 = "\u001eHLMDPH_8E6DFE8F53EA_0\u001f";
    const md1 = "\u001eHLMDPH_0EB5FD589564_1\u001f";
    const issues = compare(
      `${md0}next-generation CAT tool${md1}`,
      `outil CAT nouvelle génération${md1}`,
    );

    expect(issues).toContainEqual(
      expect.objectContaining({
        kind: "missing-token",
        tokens: ["MD#0"],
      }),
    );
  });

  it("reports extra markdown boundary tokens", () => {
    const md0 = "\u001eHLMDPH_8E6DFE8F53EA_0\u001f";
    const md1 = "\u001eHLMDPH_0EB5FD589564_1\u001f";
    const issues = compare(`plain ${md1}`, `${md0}plain ${md1}`);

    expect(issues).toContainEqual(
      expect.objectContaining({
        kind: "extra-token",
        tokens: ["MD#0"],
      }),
    );
  });

  it("accepts matching markdown boundary tokens", () => {
    const md0 = "\u001eHLMDPH_8E6DFE8F53EA_0\u001f";
    const md1 = "\u001eHLMDPH_0EB5FD589564_1\u001f";
    const issues = compare(
      `${md0}next-generation CAT tool${md1}`,
      `${md0}outil CAT de nouvelle génération${md1}`,
    );

    expect(issues).toEqual([]);
  });

  it("treats differently hashed sentinels with the same index as a mismatch", () => {
    const sourceToken = "\u001eHLMDPH_AAAAAAAAAAAA_0\u001f";
    const targetToken = "\u001eHLMDPH_BBBBBBBBBBBB_0\u001f";
    const issues = compare(`${sourceToken}label`, `${targetToken}libellé`);

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "missing-token", tokens: ["MD#0"] }),
        expect.objectContaining({ kind: "extra-token", tokens: ["MD#0"] }),
      ]),
    );
  });

  it("coexists ICU placeholders with HTML markup sentinels", () => {
    const ht0 = "\u001eHLHTPH_AABBCCDDEEFF_0\u001f";
    const analysis = analyzeCatMessageFormat(`Hello {name}${ht0}`);

    expect(analysis.tokens.map((token) => token.kind).toSorted()).toEqual(["argument", "markup"]);
    expect(analysis.placeholders).toHaveLength(2);
  });
});
