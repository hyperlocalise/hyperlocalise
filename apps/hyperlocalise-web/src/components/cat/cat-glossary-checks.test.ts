import { describe, expect, it } from "vite-plus/test";

import { getIntlShape } from "@/lib/app-i18n/intl";

import { containsGlossaryTerm, glossaryFormatChecksForSegment } from "./cat-glossary-checks";
import type { CatGlossaryTerm } from "./types";

const testIntl = getIntlShape("en");

const glossaryTerms: CatGlossaryTerm[] = [
  {
    id: "term-dashboard",
    source: "Dashboard",
    target: "Bảng điều khiển",
    approved: true,
    forbidden: false,
  },
  {
    id: "term-review-forbidden",
    source: "Review",
    target: "Đánh giá",
    approved: false,
    forbidden: true,
  },
];

describe("containsGlossaryTerm", () => {
  it("matches whole words case-insensitively", () => {
    expect(containsGlossaryTerm("Open the Dashboard settings", "Dashboard")).toBe(true);
    expect(containsGlossaryTerm("Open the dashboard settings", "Dashboard")).toBe(true);
    expect(containsGlossaryTerm("Open the Dashboards settings", "Dashboard")).toBe(false);
  });
});

describe("glossaryFormatChecksForSegment", () => {
  it("returns a pass check when approved glossary terms are used correctly", () => {
    const checks = glossaryFormatChecksForSegment(
      "Dashboard card showing pending reviews",
      "Thẻ Bảng điều khiển hiển thị các mục đang chờ",
      glossaryTerms,
      testIntl,
    );

    expect(checks).toEqual([
      expect.objectContaining({
        id: "glossary-compliance",
        status: "pass",
        category: "glossary",
      }),
    ]);
  });

  it("flags forbidden terms that appear in the target", () => {
    const checks = glossaryFormatChecksForSegment(
      "Reviews awaiting approval",
      "Review đang chờ phê duyệt",
      glossaryTerms,
      testIntl,
    );

    expect(checks).toEqual([
      expect.objectContaining({
        id: "glossary-forbidden-term-review-forbidden",
        status: "fail",
        category: "glossary",
        relatedTokens: ["Review"],
      }),
    ]);
  });

  it("warns when a required glossary rendering is missing from the target", () => {
    const checks = glossaryFormatChecksForSegment(
      "Open Dashboard settings",
      "Mở cài đặt",
      glossaryTerms,
      testIntl,
    );

    expect(checks).toEqual([
      expect.objectContaining({
        id: "glossary-missing-term-dashboard",
        status: "warn",
        category: "glossary",
      }),
    ]);
  });

  it("returns no checks when the target is empty", () => {
    expect(glossaryFormatChecksForSegment("Dashboard", "", glossaryTerms, testIntl)).toEqual([]);
  });
});
