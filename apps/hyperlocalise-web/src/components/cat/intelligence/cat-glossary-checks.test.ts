import { describe, expect, it } from "vite-plus/test";

import { getIntlShape } from "@/lib/app-i18n/intl";

import { containsGlossaryTerm, glossaryFormatChecksForSegment } from "./cat-glossary-checks";
import type { CatGlossaryTerm } from "@/components/cat/shared/types";

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

  it("uses unicode word boundaries for multi-word target terms", () => {
    expect(containsGlossaryTerm("Mở Bảng điều khiển", "Bảng điều khiển")).toBe(true);
    expect(containsGlossaryTerm("xềBảng điều khiển", "Bảng điều khiển")).toBe(false);
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
      "Review awaiting approval",
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

  it("does not warn for unapproved non-forbidden terms", () => {
    const checks = glossaryFormatChecksForSegment(
      "Open Dashboard settings",
      "Mở cài đặt",
      [
        {
          id: "draft-term",
          source: "Dashboard",
          target: "Bảng điều khiển",
          approved: false,
          forbidden: false,
        },
      ],
      testIntl,
    );

    expect(checks).toEqual([]);
  });

  it("returns no checks when glossary terms are not relevant to the segment", () => {
    const checks = glossaryFormatChecksForSegment(
      "Save your work before closing",
      "Lưu công việc trước khi đóng",
      [
        {
          id: "term-dashboard",
          source: "Dashboard",
          target: "Bảng điều khiển",
          approved: true,
          forbidden: false,
        },
      ],
      testIntl,
    );

    expect(checks).toEqual([]);
  });
});
