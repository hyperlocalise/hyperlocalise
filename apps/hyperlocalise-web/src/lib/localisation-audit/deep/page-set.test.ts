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
  deepAuditClusterKey,
  deepAuditTemplateKey,
  isDeepAuditCandidateUrl,
  selectDeepAuditUrls,
} from "./page-set";

describe("deepAuditTemplateKey", () => {
  it("groups pages by first segment after the locale prefix", () => {
    expect(deepAuditTemplateKey("https://example.com/")).toBe("/");
    expect(deepAuditTemplateKey("https://example.com/de/")).toBe("/");
    expect(deepAuditTemplateKey("https://example.com/pricing")).toBe("/pricing");
    expect(deepAuditTemplateKey("https://example.com/fr/blog/hello")).toBe("/blog/*");
    expect(deepAuditTemplateKey("https://example.com/blog/a/b")).toBe("/blog/*");
  });
});

describe("deepAuditClusterKey", () => {
  it("matches locale versions of the same page", () => {
    expect(deepAuditClusterKey("https://example.com/de/Pricing")).toBe(
      deepAuditClusterKey("https://example.com/pricing"),
    );
  });
});

describe("isDeepAuditCandidateUrl", () => {
  it("keeps same-site HTML pages only", () => {
    expect(isDeepAuditCandidateUrl("example.com", "https://example.com/about")).toBe(true);
    expect(isDeepAuditCandidateUrl("example.com", "https://example.com/file.pdf")).toBe(false);
    expect(isDeepAuditCandidateUrl("example.com", "https://other.com/about")).toBe(false);
    expect(isDeepAuditCandidateUrl("example.com", "mailto:hi@example.com")).toBe(false);
  });
});

describe("selectDeepAuditUrls", () => {
  const origin = "https://example.com";

  it("covers every template before a second page of any template", () => {
    const blog = Array.from({ length: 10 }, (_, index) => `${origin}/blog/post-${index}`);
    const selected = selectDeepAuditUrls({
      origin,
      candidates: [...blog, `${origin}/pricing`, `${origin}/about`],
      limit: 3,
    });
    expect(selected).toHaveLength(3);
    expect(selected).toContain(`${origin}/pricing`);
    expect(selected).toContain(`${origin}/about`);
    expect(selected.filter((url) => url.includes("/blog/"))).toHaveLength(1);
  });

  it("keeps the locale versions of a page together", () => {
    const selected = selectDeepAuditUrls({
      origin,
      candidates: [
        `${origin}/blog/a`,
        `${origin}/blog/b`,
        `${origin}/pricing`,
        `${origin}/de/pricing`,
        `${origin}/fr/pricing`,
      ],
      limit: 4,
    });
    expect(selected).toEqual([
      `${origin}/blog/a`,
      `${origin}/pricing`,
      `${origin}/de/pricing`,
      `${origin}/fr/pricing`,
    ]);
  });

  it("dedupes and honours exclusions and the limit", () => {
    const selected = selectDeepAuditUrls({
      origin,
      candidates: [
        `${origin}/`,
        `${origin}/a`,
        `${origin}/a`,
        `${origin}/b`,
        "https://other.com/c",
      ],
      limit: 10,
      exclude: [`${origin}/`],
    });
    expect(selected.toSorted()).toEqual([`${origin}/a`, `${origin}/b`]);
    expect(selectDeepAuditUrls({ origin, candidates: [`${origin}/a`], limit: 0 })).toEqual([]);
  });
});
