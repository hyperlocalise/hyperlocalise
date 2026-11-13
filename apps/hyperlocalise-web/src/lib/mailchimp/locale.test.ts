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

import { isMailchimpLocaleCopyName, mailchimpCopyName } from "./locale";

describe("mailchimpCopyName", () => {
  it("keeps the full project tag in the copy name", () => {
    expect(mailchimpCopyName("Spring sale", "fr-FR")).toBe("Spring sale [fr-FR]");
    expect(mailchimpCopyName("  Welcome  ", "vi-VN")).toBe("Welcome [vi-VN]");
  });

  it("falls back when the source name or locale is blank", () => {
    expect(mailchimpCopyName("", "ja-JP")).toBe("Content [ja-JP]");
    expect(mailchimpCopyName("   ", "  ")).toBe("Content [locale]");
    expect(mailchimpCopyName("Welcome", "")).toBe("Welcome [locale]");
  });
});

describe("isMailchimpLocaleCopyName", () => {
  it("matches names that end with a locale tag", () => {
    expect(isMailchimpLocaleCopyName("Welcome [fr-FR]")).toBe(true);
    expect(isMailchimpLocaleCopyName("Welcome [fr-FR]  ")).toBe(true);
    expect(isMailchimpLocaleCopyName("[vi-VN]")).toBe(true);
  });

  it("rejects source names and incomplete tags", () => {
    expect(isMailchimpLocaleCopyName("Welcome")).toBe(false);
    expect(isMailchimpLocaleCopyName("Welcome [fr-FR extra")).toBe(false);
    expect(isMailchimpLocaleCopyName("Welcome [fr-FR] extra")).toBe(false);
    expect(isMailchimpLocaleCopyName("[]")).toBe(false);
  });
});
