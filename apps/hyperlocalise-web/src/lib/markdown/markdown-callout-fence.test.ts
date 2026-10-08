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

import { isMarkdownCalloutFenceText } from "./markdown-callout-fence";

describe("isMarkdownCalloutFenceText", () => {
  it("matches Intercom callout opening and closing fences", () => {
    expect(isMarkdownCalloutFenceText(':::callout backgroundColor="#feedaf80"')).toBe(true);
    expect(
      isMarkdownCalloutFenceText(':::callout backgroundColor="#feedaf80"\nborderColor="#fbc91633"'),
    ).toBe(true);
    expect(isMarkdownCalloutFenceText(":::")).toBe(true);
    expect(isMarkdownCalloutFenceText("  :::  \n")).toBe(true);
  });

  it("leaves other directives and article copy alone", () => {
    expect(isMarkdownCalloutFenceText(":::tip")).toBe(false);
    expect(isMarkdownCalloutFenceText("For a public article to be enabled for Fin")).toBe(false);
    expect(isMarkdownCalloutFenceText("")).toBe(false);
  });
});
