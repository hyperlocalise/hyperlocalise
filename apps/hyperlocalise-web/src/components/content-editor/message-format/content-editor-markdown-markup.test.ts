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
  collectStandardMarkdownDelimiters,
  formatMarkdownMarkupForDisplay,
  recoverMarkdownMarkupTokens,
} from "./content-editor-markdown-markup";

const md0 = "\u001eHLMDPH_8E6DFE8F53EA_0\u001f";
const md1 = "\u001eHLMDPH_0EB5FD589564_1\u001f";
const md2 = "\u001eHLMDPH_AAAAAAAAAAAA_2\u001f";
const md3 = "\u001eHLMDPH_BBBBBBBBBBBB_3\u001f";

const HELP_CENTER_URL = "https://www.intercom.com/help/en/articles/56641-create-an-article";
const COLLECTION_URL =
  "https://www.intercom.com/help/en/articles/56647-create-collections-in-your-help-center";

describe("collectStandardMarkdownDelimiters", () => {
  it("collects link openers and destinations in parser order", () => {
    expect(
      collectStandardMarkdownDelimiters(`visit our [Help Center.](${HELP_CENTER_URL})`).map(
        (delimiter) => delimiter.literal,
      ),
    ).toEqual(["[", `](${HELP_CENTER_URL})`]);
  });
});

describe("formatMarkdownMarkupForDisplay", () => {
  it("expands source MD#n chips to the same [title](url) shape as the translation", () => {
    const source = `For more tips, visit our ${md0}Help Center.${md1}`;
    const target = `Weitere Tipps finden Sie in unserem [Hilfe-Center.](${HELP_CENTER_URL})`;

    expect(formatMarkdownMarkupForDisplay(source, target)).toBe(
      `For more tips, visit our [Help Center.](${HELP_CENTER_URL})`,
    );
    expect(formatMarkdownMarkupForDisplay(target, source)).toBe(target);
  });

  it("expands two links in one segment", () => {
    const source = `a live ${md0}Help Center${md1} and a ${md2}collection.${md3}`;
    const target = `ein aktives [Hilfe-Center](https://example.com/hc) und eine [Sammlung.](${COLLECTION_URL})`;

    expect(formatMarkdownMarkupForDisplay(source, target)).toBe(
      `a live [Help Center](https://example.com/hc) and a [collection.](${COLLECTION_URL})`,
    );
  });
});

describe("recoverMarkdownMarkupTokens", () => {
  it("puts source sentinels back into a raw-markdown translation", () => {
    const source = `visit our ${md0}Help Center.${md1}`;
    const target = `besuchen Sie unser [Hilfe-Center.](${HELP_CENTER_URL})`;

    expect(recoverMarkdownMarkupTokens(source, target)).toBe(
      `besuchen Sie unser ${md0}Hilfe-Center.${md1}`,
    );
  });

  it("returns null when the translation is missing a link", () => {
    expect(
      recoverMarkdownMarkupTokens(`visit our ${md0}Help Center.${md1}`, "kein link"),
    ).toBeNull();
  });
});
