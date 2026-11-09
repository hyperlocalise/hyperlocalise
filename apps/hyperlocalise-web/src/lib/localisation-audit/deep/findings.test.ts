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

import type { LocalisationAuditFinding } from "../types";
import {
  buildDeepAuditFindingRecords,
  deepAuditCreditStats,
  deepAuditFindingFingerprint,
  summarizeDeepAuditDiff,
  summarizeDeepAuditTemplates,
} from "./findings";

function finding(overrides: Partial<LocalisationAuditFinding>): LocalisationAuditFinding {
  return {
    category: "technical",
    creditId: "hreflang-reciprocal",
    severity: "medium",
    title: "Missing return link",
    summary: "The page does not link back.",
    ...overrides,
  } as LocalisationAuditFinding;
}

describe("deepAuditFindingFingerprint", () => {
  it("ignores host and query string but not locale", () => {
    const base = { creditId: "c", title: "t" };
    expect(deepAuditFindingFingerprint({ ...base, url: "https://example.com/de/a?x=1" })).toBe(
      deepAuditFindingFingerprint({ ...base, url: "https://www.example.com/de/a" }),
    );
    expect(deepAuditFindingFingerprint({ ...base, url: "https://example.com/de/a" })).not.toBe(
      deepAuditFindingFingerprint({ ...base, url: "https://example.com/fr/a" }),
    );
  });
});

describe("buildDeepAuditFindingRecords", () => {
  it("dedupes, adds template and locale, and diffs against the previous run", () => {
    const repeated = finding({ url: "https://example.com/de/blog/a" });
    const previous = new Set([
      deepAuditFindingFingerprint({
        creditId: "hreflang-reciprocal",
        title: "Missing return link",
        url: "https://example.com/de/blog/a",
      }),
      "fixed-fingerprint",
    ]);
    const records = buildDeepAuditFindingRecords({
      findings: [
        repeated,
        repeated,
        finding({ url: "https://example.com/pricing", severity: "warning" }),
      ],
      pageLocales: new Map([["https://example.com/pricing", "en"]]),
      previousFingerprints: previous,
    });

    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({
      templateKey: "/blog/*",
      locale: "de",
      diffState: "unchanged",
    });
    expect(records[1]).toMatchObject({
      templateKey: "/pricing",
      locale: "en",
      severity: "high",
      diffState: "new",
    });
    expect(summarizeDeepAuditDiff(records, previous)).toEqual({ new: 1, unchanged: 1, fixed: 1 });
    expect(summarizeDeepAuditDiff(records, null)).toBeNull();
    expect(deepAuditCreditStats(records)).toEqual({
      "hreflang-reciprocal": { affectedPages: 2, affectedTemplates: 2 },
    });
  });
});

describe("summarizeDeepAuditTemplates", () => {
  it("counts pages and locales per template", () => {
    expect(
      summarizeDeepAuditTemplates([
        { templateKey: "/blog/*", locale: "de" },
        { templateKey: "/blog/*", locale: "en" },
        { templateKey: "/", locale: null },
      ]),
    ).toEqual([
      { key: "/blog/*", pages: 2, locales: ["de", "en"] },
      { key: "/", pages: 1, locales: [] },
    ]);
  });
});
