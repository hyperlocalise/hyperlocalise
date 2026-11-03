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

import { resolveMailchimpSourceLocale } from "./locale";
import { protectMailchimpMergeTags, restoreMailchimpMergeTags } from "./variables";

describe("resolveMailchimpSourceLocale", () => {
  it("uses the project source locale because Mailchimp items have none", () => {
    expect(resolveMailchimpSourceLocale("th-TH")).toBe("th-TH");
    expect(resolveMailchimpSourceLocale("  ")).toBe("en");
  });
});

describe("protectMailchimpMergeTags", () => {
  it("does not nest comments around Mailchimp IF/preview wrappers", () => {
    const html = [
      "<!--*|IF:MC_PREVIEW_TEXT|*-->",
      '<span class="mcnPreviewText">*|MC_PREVIEW_TEXT|*</span>',
      "<!--*|END:IF|*-->",
      "<p>Hello *|FNAME|*</p>",
    ].join("");

    const protectedText = protectMailchimpMergeTags(html);
    expect(protectedText.text).toContain("<!--*|IF:MC_PREVIEW_TEXT|*-->");
    expect(protectedText.text).toContain("<!--*|END:IF|*-->");
    expect(protectedText.text).not.toContain("<!--<!--");
    expect(protectedText.text).not.toMatch(/-->-->/);
    expect(protectedText.tokens).toEqual(["*|MC_PREVIEW_TEXT|*", "*|FNAME|*"]);
    expect(restoreMailchimpMergeTags(protectedText.text, protectedText.tokens)).toBe(html);
  });
});
