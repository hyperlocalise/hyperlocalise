/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { describe, expect, it } from "vite-plus/test";

import { getIntlShape } from "@/lib/app-i18n/intl";

import { formatBlogPostDate } from "./format-blog-post-date";

describe("formatBlogPostDate", () => {
  it("formats valid ISO dates with intl", () => {
    const intl = getIntlShape("en");

    expect(formatBlogPostDate(intl, "2026-06-16T00:00:00.000Z")).toBe("June 16, 2026");
  });

  it("returns the original value when parsing fails", () => {
    const intl = getIntlShape("en");

    expect(formatBlogPostDate(intl, "not-a-date")).toBe("not-a-date");
  });
});
