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
  buildIterableEmailSourcePath,
  isIterableLocaleSuffixSnippetName,
  isIterableSourcePath,
} from "./source-path";

describe("iterable source paths", () => {
  it("builds email template paths under iterable/", () => {
    expect(buildIterableEmailSourcePath({ templateId: 42, name: "Welcome Email" })).toBe(
      "iterable/templates/email/welcome-email-42.html",
    );
    expect(buildIterableEmailSourcePath({ templateId: 99, name: "Welcome Email" })).toBe(
      "iterable/templates/email/welcome-email-99.html",
    );
  });

  it("detects iterable source paths", () => {
    expect(isIterableSourcePath("iterable/snippets/welcome.html")).toBe(true);
    expect(isIterableSourcePath("customer-io/foo.json")).toBe(false);
  });

  it("skips locale-suffixed snippet names", () => {
    expect(isIterableLocaleSuffixSnippetName("Welcome_fr-FR", ["fr-FR"])).toBe(true);
    expect(isIterableLocaleSuffixSnippetName("Welcome", ["fr-FR"])).toBe(false);
  });
});
