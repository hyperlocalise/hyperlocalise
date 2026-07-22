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

import { slugifyOrganizationName } from "./slugify-organization-name";

describe("slugifyOrganizationName", () => {
  it("normalizes names into URL-safe slugs", () => {
    expect(slugifyOrganizationName("Acme localisation")).toBe("acme-localisation");
    expect(slugifyOrganizationName("  Foo & Bar!!!  ")).toBe("foo-bar");
  });

  it("falls back to workspace when the name has no slug characters", () => {
    expect(slugifyOrganizationName("   ")).toBe("workspace");
    expect(slugifyOrganizationName("---")).toBe("workspace");
  });
});
