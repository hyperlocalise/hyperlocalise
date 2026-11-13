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

import { analyzeCatMessageFormat, compareCatMessageFormats } from "./content-editor-message-format";

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

  it("treats i18next interpolations as placeholders instead of ICU parse errors", () => {
    const analysis = analyzeCatMessageFormat("Hello {{name, uppercase}}");

    expect(analysis.parseError).toBeUndefined();
    expect(analysis.placeholders).toEqual([
      expect.objectContaining({
        kind: "argument",
        name: "name",
        literal: "{{name, uppercase}}",
      }),
    ]);
  });

  it("keeps i18next interpolations as ICU parse errors in icu mode", () => {
    const analysis = analyzeCatMessageFormat("Hello {{name}}", { messageFormat: "icu" });

    expect(analysis.parseError?.message).toBeTruthy();
    expect(analysis.placeholders).toEqual([]);
  });

  it("treats single braces as text in i18next mode", () => {
    const analysis = analyzeCatMessageFormat("{count, plural, one {#} other {#}} {{name}}", {
      messageFormat: "i18next",
    });

    expect(analysis.parseError).toBeUndefined();
    expect(analysis.icuBlocks).toEqual([]);
    expect(analysis.placeholders).toEqual([
      expect.objectContaining({ kind: "argument", name: "name", literal: "{{name}}" }),
    ]);
  });

  it("reports missing i18next interpolations", () => {
    const issues = compare("Hello {{name}}", "Bonjour");

    expect(issues).toContainEqual(
      expect.objectContaining({
        kind: "missing-token",
        tokens: ["{{name}}"],
      }),
    );
  });

  it("does not treat {{name}} and {name} as the same placeholder", () => {
    const issues = compare("Hello {{name}}", "Bonjour {name}");

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "missing-token", tokens: ["{{name}}"] }),
        expect.objectContaining({ kind: "extra-token", tokens: ["{name}"] }),
      ]),
    );
  });

  it("keeps nested ICU select messages out of interpolation fallback", () => {
    const analysis = analyzeCatMessageFormat(
      "{gender, select, male {{count, plural, one {# item} other {# items}}} other {x}}",
    );

    expect(analysis.parseError).toBeUndefined();
    expect(analysis.icuBlocks.map((block) => block.type).toSorted()).toEqual(["plural", "select"]);
  });

  it("merges ICU blocks with nearby i18next interpolations", () => {
    const analysis = analyzeCatMessageFormat(
      "{count, plural, one {item} other {items}} for {{user_name}}",
    );

    expect(analysis.parseError).toBeUndefined();
    expect(analysis.placeholders).toEqual([
      expect.objectContaining({ kind: "argument", name: "user_name" }),
    ]);
    expect(analysis.icuBlocks).toEqual([expect.objectContaining({ arg: "count", type: "plural" })]);
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

  it("drops leaked Office token names from the analyzed message", () => {
    const open = "\u001eHLOXPH_6F30_0\u001f";
    const close = "\u001eHLOXPH_6330_1\u001f";
    const analysis = analyzeCatMessageFormat(
      `${open}HLOXPH_6F30_0 レシピ${close} HLOXPH_6330_1 いちごとバニラのパンケーキ`,
    );

    expect(analysis.message).toBe(`${open}レシピ${close} いちごとバニラのパンケーキ`);
    expect(analysis.tokens.map((token) => token.displayLabel)).toEqual(["OX#0", "OX#1"]);
  });

  it("extracts Unreal PO HLUEPH tokens as markup chips", () => {
    const ue0 = "\u001eHLUEPH_AABBCCDDEEFF_0\u001f";
    const ue1 = "\u001eHLUEPH_112233445566_1\u001f";
    const analysis = analyzeCatMessageFormat(`${ue0}Display Name${ue1}`);

    expect(analysis.tokens).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "markup",
          name: "UE#0",
          displayLabel: "UE#0",
          literal: ue0,
        }),
        expect.objectContaining({
          kind: "markup",
          name: "UE#1",
          displayLabel: "UE#1",
          literal: ue1,
        }),
      ]),
    );
    expect(analysis.parseError).toBeUndefined();
  });

  it("reports duplicated markup sentinels as extra tokens", () => {
    const ht0 = "\u001eHLHTPH_AABBCCDDEEFF_0\u001f";
    const ht1 = "\u001eHLHTPH_112233445566_1\u001f";
    const issues = compare(`Click ${ht0}here${ht1}`, `Cliquez ${ht0}${ht0}ici${ht1}`);

    expect(issues).toContainEqual(
      expect.objectContaining({
        kind: "extra-token",
        tokens: ["HT#0"],
      }),
    );
    expect(issues.filter((issue) => issue.kind === "missing-token")).toHaveLength(0);
  });

  it("reports missing duplicate markup sentinel occurrences", () => {
    const ht0 = "\u001eHLHTPH_AABBCCDDEEFF_0\u001f";
    const ht1 = "\u001eHLHTPH_112233445566_1\u001f";
    const issues = compare(`Click ${ht0}${ht0}here${ht1}`, `Cliquez ${ht0}ici${ht1}`);

    expect(issues).toContainEqual(
      expect.objectContaining({
        kind: "missing-token",
        tokens: ["HT#0"],
      }),
    );
  });

  it("still reports ICU parse errors when markup tokens are present", () => {
    const md0 = "\u001eHLMDPH_8E6DFE8F53EA_0\u001f";
    const md1 = "\u001eHLMDPH_0EB5FD589564_1\u001f";
    const issues = compare(
      `${md0}{count, plural, one {# file} other {# files}}${md1}`,
      `${md0}{count, plural, one {# fichier}}${md1}`,
    );

    expect(issues).toContainEqual(
      expect.objectContaining({
        kind: "parse-error",
        parseTarget: "target",
      }),
    );
    expect(issues.filter((issue) => issue.kind === "missing-token")).toHaveLength(0);
    expect(issues.filter((issue) => issue.kind === "extra-token")).toHaveLength(0);
  });

  it("reports markup mismatches alongside ICU parse errors", () => {
    const md0 = "\u001eHLMDPH_8E6DFE8F53EA_0\u001f";
    const md1 = "\u001eHLMDPH_0EB5FD589564_1\u001f";
    const issues = compare(
      `${md0}{count, plural, one {# file} other {# files}}${md1}`,
      `{count, plural, one {# fichier}}${md1}`,
    );

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "parse-error", parseTarget: "target" }),
        expect.objectContaining({ kind: "missing-token", tokens: ["MD#0"] }),
      ]),
    );
  });

  it("reports swapped markup sentinel order when the multiset still matches", () => {
    const md0 = "\u001eHLMDPH_8E6DFE8F53EA_0\u001f";
    const md1 = "\u001eHLMDPH_0EB5FD589564_1\u001f";
    const issues = compare(
      `${md0}next-generation CAT tool${md1}`,
      `${md1}outil CAT de nouvelle génération${md0}`,
    );

    expect(issues).toContainEqual(
      expect.objectContaining({
        kind: "token-order",
        tokens: ["MD#0", "MD#1"],
      }),
    );
    expect(issues.filter((issue) => issue.kind === "missing-token")).toHaveLength(0);
    expect(issues.filter((issue) => issue.kind === "extra-token")).toHaveLength(0);
  });

  it("reports crossed HTML markup nesting as a token-order issue", () => {
    const ht0 = "\u001eHLHTPH_AABBCCDDEEFF_0\u001f";
    const ht1 = "\u001eHLHTPH_112233445566_1\u001f";
    const ht2 = "\u001eHLHTPH_77889900AABB_2\u001f";
    const ht3 = "\u001eHLHTPH_CCDDEEFF0011_3\u001f";
    const issues = compare(
      `Click ${ht0}${ht1}here${ht2}${ht3}`,
      `Cliquez ${ht0}${ht1}ici${ht3}${ht2}`,
    );

    expect(issues).toContainEqual(
      expect.objectContaining({
        kind: "token-order",
      }),
    );
  });
});

describe("custom placeholder patterns", () => {
  const placeholderPatterns = ["\\[\\[\\w+\\]\\]", "\\{\\w+\\}"];

  it("adds custom tokens, including inside ICU plural options", () => {
    const analysis = analyzeCatMessageFormat(
      "{count, plural, one {[[name]] has # item} other {[[name]] has # items}}",
      { placeholderPatterns },
    );

    expect(analysis.placeholders.filter((token) => token.kind === "custom")).toEqual([
      expect.objectContaining({ literal: "[[name]]", start: 21 }),
      expect.objectContaining({ literal: "[[name]]", start: 49 }),
    ]);
    expect(analysis.icuBlocks).toHaveLength(1);
  });

  it("leaves built-in placeholders to the ICU parser", () => {
    const analysis = analyzeCatMessageFormat("Hi {name}", { placeholderPatterns });

    expect(analysis.tokens.map((token) => token.kind)).toEqual(["argument"]);
  });

  it("reports missing and extra custom tokens", () => {
    const options = { placeholderPatterns };
    expect(
      compareCatMessageFormats(
        analyzeCatMessageFormat("Hello [[name]]", options),
        analyzeCatMessageFormat("Bonjour", options),
      ),
    ).toEqual([{ kind: "missing-token", tokens: ["[[name]]"] }]);
    expect(
      compareCatMessageFormats(
        analyzeCatMessageFormat("Hello", options),
        analyzeCatMessageFormat("Bonjour [[name]]", options),
      ),
    ).toEqual([{ kind: "extra-token", tokens: ["[[name]]"] }]);
  });

  it("ignores patterns when none are set", () => {
    expect(analyzeCatMessageFormat("Hello [[name]]").tokens).toEqual([]);
  });
});
