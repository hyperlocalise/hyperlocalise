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

import { TMX_MAX_REPORT_ISSUES } from "./tmx-constants";
import type { TmxDocument, TmxHeader, TmxIssue } from "./tmx-types";
import {
  buildTmxExternalKey,
  documentToImportCandidates,
  emptyImportReport,
  finalizeImportReport,
  languagesMatch,
  normalizeTmxLanguage,
  samePrimaryLanguage,
} from "./tmx-import";

function unitDocument(
  overrides: Partial<TmxHeader> & {
    units: TmxDocument["units"];
    issues?: TmxIssue[];
  },
): TmxDocument {
  const { units, issues = [], ...headerOverrides } = overrides;
  return {
    header: {
      srclang: "en-US",
      properties: [],
      notes: [],
      ...headerOverrides,
    },
    units,
    totalUnits: units.length,
    issues,
  };
}

describe("normalizeTmxLanguage", () => {
  it("normalizes underscores and canonicalizes known tags", () => {
    expect(normalizeTmxLanguage(" en_US ")).toBe("en-US");
    expect(normalizeTmxLanguage("fr")).toBe("fr");
  });
});

describe("languagesMatch", () => {
  it("matches exact and primary-subtag pairs", () => {
    expect(languagesMatch("en-US", "en-US")).toBe(true);
    expect(languagesMatch("en", "en-US")).toBe(true);
    expect(languagesMatch("en-US", "en")).toBe(true);
    expect(languagesMatch("en-US", "fr-FR")).toBe(false);
    expect(languagesMatch("en-US", "en-GB")).toBe(false);
  });
});

describe("samePrimaryLanguage", () => {
  it("treats regional and script siblings as the same language", () => {
    expect(samePrimaryLanguage("en-US", "en-GB")).toBe(true);
    expect(samePrimaryLanguage("zh-Hans", "zh-Hant")).toBe(true);
    expect(samePrimaryLanguage("en", "en-US")).toBe(true);
    expect(samePrimaryLanguage("en-US", "fr-FR")).toBe(false);
  });
});

describe("buildTmxExternalKey", () => {
  it("builds a stable key only when tuid is present", () => {
    expect(buildTmxExternalKey("seg-1", "en-US", "fr-FR")).toBe("tmx:seg-1:en-US:fr-FR");
    expect(buildTmxExternalKey("  ", "en-US", "fr-FR")).toBeNull();
    expect(buildTmxExternalKey(undefined, "en-US", "fr-FR")).toBeNull();
  });
});

describe("documentToImportCandidates", () => {
  it("emits empty_unit, missing_target, and empty_source issue codes", () => {
    const mapped = documentToImportCandidates(
      unitDocument({
        units: [
          { unitIndex: 0, tuid: "empty", variants: [], notes: [], properties: [] },
          {
            unitIndex: 1,
            tuid: "source-only",
            variants: [{ language: "en-US", segment: "Hello", notes: [], properties: [] }],
            notes: [],
            properties: [],
          },
          {
            unitIndex: 2,
            tuid: "blank-source",
            variants: [
              { language: "en-US", segment: "   ", notes: [], properties: [] },
              { language: "fr-FR", segment: "Bonjour", notes: [], properties: [] },
            ],
            notes: [],
            properties: [],
          },
        ],
      }),
    );

    expect(mapped.candidates).toEqual([]);
    expect(mapped.issues.map((issue) => issue.code)).toEqual([
      "empty_unit",
      "missing_target_tuv",
      "empty_source_segment",
    ]);
  });

  it("skips same-language and duplicate target variants", () => {
    const mapped = documentToImportCandidates(
      unitDocument({
        units: [
          {
            unitIndex: 0,
            tuid: "dup",
            variants: [
              { language: "en-US", segment: "Save", notes: [], properties: [] },
              { language: "en", segment: "Save again", notes: [], properties: [] },
              { language: "fr-FR", segment: "Enregistrer", notes: [], properties: [] },
              { language: "fr_FR", segment: "Duplique", notes: [], properties: [] },
            ],
            notes: [],
            properties: [],
          },
        ],
      }),
    );

    expect(mapped.candidates).toHaveLength(1);
    expect(mapped.candidates[0]).toMatchObject({
      sourceLocale: "en-US",
      targetLocale: "fr-FR",
      targetText: "Enregistrer",
      externalKey: "tmx:dup:en-US:fr-FR",
    });
    expect(mapped.issues.map((issue) => issue.code)).toEqual([
      "same_language_variant_skipped",
      "duplicate_target_variant",
    ]);
  });

  it("does not create en-US→en-GB translation pairs inside one unit", () => {
    const mapped = documentToImportCandidates(
      unitDocument({
        srclang: "en",
        units: [
          {
            unitIndex: 0,
            tuid: "dialect-1",
            variants: [
              { language: "en-US", segment: "Color", notes: [], properties: [] },
              { language: "en-GB", segment: "Colour", notes: [], properties: [] },
              { language: "fr-FR", segment: "Couleur", notes: [], properties: [] },
            ],
            notes: [],
            properties: [],
          },
        ],
      }),
    );

    expect(mapped.candidates.map((candidate) => candidate.targetLocale)).toEqual(["fr-FR"]);
    expect(mapped.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "same_language_variant_skipped",
          message: expect.stringContaining("en-GB"),
        }),
      ]),
    );
  });

  it("warns when header srclang is missing or *all*", () => {
    const missingHeader = documentToImportCandidates(
      unitDocument({
        srclang: undefined,
        units: [
          {
            unitIndex: 0,
            tuid: "u1",
            variants: [
              { language: "en", segment: "A", notes: [], properties: [] },
              { language: "fr", segment: "B", notes: [], properties: [] },
            ],
            notes: [],
            properties: [],
          },
        ],
      }),
    );
    expect(missingHeader.issues.some((issue) => issue.code === "missing_header_srclang")).toBe(
      true,
    );
    expect(missingHeader.candidates).toHaveLength(1);

    const allSource = documentToImportCandidates(
      unitDocument({
        srclang: "*all*",
        units: [
          {
            unitIndex: 0,
            tuid: "u2",
            variants: [
              { language: "de", segment: "Hallo", notes: [], properties: [] },
              { language: "fr", segment: "Bonjour", notes: [], properties: [] },
            ],
            notes: [],
            properties: [],
          },
        ],
      }),
    );
    expect(allSource.issues.some((issue) => issue.code === "srclang_all_uses_first_tuv")).toBe(
      true,
    );
    expect(allSource.candidates[0]).toMatchObject({
      sourceLocale: "de",
      targetLocale: "fr",
    });
  });

  it("warns on primary-subtag source matches and errors when source TUV is missing", () => {
    const prefixMatch = documentToImportCandidates(
      unitDocument({
        srclang: "en",
        units: [
          {
            unitIndex: 0,
            tuid: "loose",
            variants: [
              { language: "en-US", segment: "Hello", notes: [], properties: [] },
              { language: "fr-FR", segment: "Bonjour", notes: [], properties: [] },
            ],
            notes: [],
            properties: [],
          },
        ],
      }),
    );
    expect(prefixMatch.issues.map((issue) => issue.code)).toContain("source_language_prefix_match");
    expect(prefixMatch.candidates).toHaveLength(1);

    const missingSource = documentToImportCandidates(
      unitDocument({
        srclang: "ja",
        units: [
          {
            unitIndex: 0,
            tuid: "no-ja",
            variants: [
              { language: "en", segment: "Hello", notes: [], properties: [] },
              { language: "fr", segment: "Bonjour", notes: [], properties: [] },
            ],
            notes: [],
            properties: [],
          },
        ],
      }),
    );
    expect(missingSource.candidates).toEqual([]);
    expect(missingSource.issues.map((issue) => issue.code)).toContain("source_tuv_missing");
  });
});

describe("emptyImportReport / finalizeImportReport", () => {
  it("truncates issues at the documented report cap", () => {
    const issues: TmxIssue[] = Array.from({ length: TMX_MAX_REPORT_ISSUES + 5 }, (_, index) => ({
      severity: index % 2 === 0 ? ("error" as const) : ("warning" as const),
      code: "empty_unit",
      message: `issue ${index}`,
      unitIndex: index,
    }));

    const empty = emptyImportReport(issues, "en-US");
    expect(empty.issues).toHaveLength(TMX_MAX_REPORT_ISSUES);
    expect(empty.truncatedIssues).toBe(true);
    expect(empty.failed).toBe(issues.filter((issue) => issue.severity === "error").length);
    expect(empty.warned).toBe(issues.filter((issue) => issue.severity === "warning").length);
    expect(empty.headerSrclang).toBe("en-US");

    const finalized = finalizeImportReport({
      totalRead: 10,
      created: 3,
      updated: 2,
      variantCreated: 1,
      skipped: 4,
      issues,
      headerSrclang: "en",
    });
    expect(finalized.issues).toHaveLength(TMX_MAX_REPORT_ISSUES);
    expect(finalized.truncatedIssues).toBe(true);
    expect(finalized).toMatchObject({
      totalRead: 10,
      created: 3,
      updated: 2,
      variantCreated: 1,
      skipped: 4,
    });
  });
});
