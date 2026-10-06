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
  compactAdvancedQueueFilter,
  croqlDateRangePredicate,
  croqlLabelPredicates,
  isAdvancedQueueFilterSupportedForProvider,
  nextAdvancedQueueFilterLabelIds,
  parseAdvancedQueueFilter,
  parseQueueFilterQualifier,
  serializeAdvancedQueueFilter,
} from "./content-editor-advanced-queue-filter";

describe("parseAdvancedQueueFilter", () => {
  it("compacts and round-trips a valid filter", () => {
    const parsed = parseAdvancedQueueFilter(
      JSON.stringify({
        stringType: "icu",
        includeLabelIds: ["3", "3"],
        includeLabelMode: "include_any",
        translationStatus: "untranslated",
      }),
    );

    expect(parsed).toEqual({
      includeLabelMode: "include_any",
      includeLabelIds: ["3"],
      stringType: "icu",
      translationStatus: "untranslated",
    });
    expect(serializeAdvancedQueueFilter(parsed)).toBe(JSON.stringify(parsed));
  });

  it("rejects invalid JSON and unknown fields", () => {
    expect(parseAdvancedQueueFilter("{")).toBeUndefined();
    expect(parseAdvancedQueueFilter(JSON.stringify({ stringType: "unknown" }))).toBeUndefined();
    expect(parseAdvancedQueueFilter(JSON.stringify({ extra: true }))).toBeUndefined();
    expect(parseAdvancedQueueFilter(JSON.stringify({}))).toBeUndefined();
  });

  it("rejects impossible calendar dates and keeps real ones", () => {
    expect(parseAdvancedQueueFilter(JSON.stringify({ addedFrom: "2026-02-31" }))).toBeUndefined();
    expect(parseAdvancedQueueFilter(JSON.stringify({ addedTo: "2026-04-31" }))).toBeUndefined();
    expect(parseAdvancedQueueFilter(JSON.stringify({ updatedFrom: "2026-02-29" }))).toBeUndefined();
    expect(parseAdvancedQueueFilter(JSON.stringify({ updatedTo: "2026-13-01" }))).toBeUndefined();
    expect(
      parseAdvancedQueueFilter(JSON.stringify({ addedFrom: "2026-02-31", stringType: "plain" })),
    ).toBeUndefined();
    expect(parseAdvancedQueueFilter(JSON.stringify({ addedFrom: "2024-02-29" }))).toEqual({
      addedFrom: "2024-02-29",
    });
    expect(parseAdvancedQueueFilter(JSON.stringify({ updatedTo: "2026-01-31" }))).toEqual({
      updatedTo: "2026-01-31",
    });
  });
});

describe("compactAdvancedQueueFilter", () => {
  it("drops empty label selections and unset fields", () => {
    expect(
      compactAdvancedQueueFilter({
        includeLabelIds: [],
        includeLabelMode: "include_all",
        stringType: "plain",
      }),
    ).toEqual({ stringType: "plain" });
  });
});

describe("parseQueueFilterQualifier", () => {
  it("accepts Crowdin and native submenu values", () => {
    expect(parseQueueFilterQualifier("spelling")).toBe("spelling");
    expect(parseQueueFilterQualifier("tm")).toBe("tm");
    expect(parseQueueFilterQualifier("translation_job")).toBe("translation_job");
    expect(parseQueueFilterQualifier("general_question")).toBe("general_question");
    expect(parseQueueFilterQualifier("not-a-filter")).toBeUndefined();
  });
});

describe("isAdvancedQueueFilterSupportedForProvider", () => {
  it("is available for Crowdin and native projects", () => {
    expect(isAdvancedQueueFilterSupportedForProvider("crowdin")).toBe(true);
    expect(isAdvancedQueueFilterSupportedForProvider("native")).toBe(true);
    expect(isAdvancedQueueFilterSupportedForProvider(null)).toBe(true);
    expect(isAdvancedQueueFilterSupportedForProvider("phrase")).toBe(false);
  });
});

describe("croql helpers", () => {
  it("builds date range predicates", () => {
    expect(croqlDateRangePredicate("added", "2026-01-01", "2026-01-31")).toBe(
      "added between '2026-01-01 00:00:00' and '2026-01-31 23:59:59'",
    );
    expect(croqlDateRangePredicate("updated", "2026-02-01", undefined)).toBe(
      "updated >= '2026-02-01 00:00:00'",
    );
  });

  it("builds include-all and exclude-any label predicates", () => {
    expect(
      croqlLabelPredicates({
        includeLabelMode: "include_all",
        includeLabelIds: ["3", "7"],
        excludeLabelMode: "exclude_any",
        excludeLabelIds: ["9"],
      }),
    ).toEqual([
      "count of labels where (id = 3) > 0",
      "count of labels where (id = 7) > 0",
      "count of labels where (id = 9) = 0",
    ]);
  });

  it("keeps label selections within the parser limit", () => {
    const ids = Array.from({ length: 51 }, (_, index) => `label_${index}`);
    expect(nextAdvancedQueueFilterLabelIds(ids.slice(0, 50), "label_50", true)).toEqual(
      ids.slice(0, 50),
    );
    expect(compactAdvancedQueueFilter({ includeLabelIds: ids }).includeLabelIds).toHaveLength(50);
    expect(parseAdvancedQueueFilter(JSON.stringify({ includeLabelIds: ids }))).toBeUndefined();
  });
});
