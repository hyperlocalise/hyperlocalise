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

import { localizeOrgHref } from "./localize-org-href";

describe("localizeOrgHref", () => {
  it("prefixes org paths with the current page's locale", () => {
    expect(localizeOrgHref("/org/acme/projects/proj_1", "/en/org/acme/projects")).toBe(
      "/en/org/acme/projects/proj_1",
    );
    expect(localizeOrgHref("/org/acme/files?locale=de-DE#top", "/fr-FR/org/acme/dashboard")).toBe(
      "/fr-FR/org/acme/files?locale=de-DE#top",
    );
    expect(localizeOrgHref("/org", "/ja-JP/org/acme")).toBe("/ja-JP/org");
  });

  it("uses the locale's canonical spelling", () => {
    expect(localizeOrgHref("/org/acme", "/zh-cn/org/acme/projects")).toBe("/zh-CN/org/acme");
  });

  it("leaves paths that are not org paths alone", () => {
    expect(localizeOrgHref("/auth/select-organization", "/en/org/acme")).toBe(
      "/auth/select-organization",
    );
    expect(localizeOrgHref("/organizations", "/en/org/acme")).toBe("/organizations");
    expect(localizeOrgHref("/en/org/acme/projects", "/fr-FR/org/acme")).toBe(
      "/en/org/acme/projects",
    );
    expect(localizeOrgHref("https://example.com/org/acme", "/en/org/acme")).toBe(
      "https://example.com/org/acme",
    );
  });

  it("leaves org paths alone when the current page has no locale", () => {
    expect(localizeOrgHref("/org/acme/projects", "/org/acme")).toBe("/org/acme/projects");
    expect(localizeOrgHref("/org/acme/projects", null)).toBe("/org/acme/projects");
  });
});
