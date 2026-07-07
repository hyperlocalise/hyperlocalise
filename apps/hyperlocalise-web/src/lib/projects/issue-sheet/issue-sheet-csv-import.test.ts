import { describe, expect, it } from "vite-plus/test";

import {
  inferIssueSheetImportColumnType,
  issueSheetImportHasTitleMapping,
  normalizeIssueSheetImportIssueType,
  normalizeIssueSheetImportStatus,
  parseIssueSheetImportCsv,
  slugifyIssueSheetColumnKey,
  suggestIssueSheetImportMappings,
} from "./issue-sheet-csv-import";

describe("issue-sheet-csv-import", () => {
  it("suggests system fields and creates custom columns with smart defaults", () => {
    const csv = `Summary,Status,Priority,Sprint,Row #
Fix CTA copy,Open,P1,S24,1
Update glossary term,Done,P2,S24,2`;
    const { headers, rows } = parseIssueSheetImportCsv(csv);
    const suggestions = suggestIssueSheetImportMappings({
      headers,
      rows,
      columns: [{ id: "priority-id", key: "priority", label: "Priority" }],
    });

    expect(suggestions).toEqual([
      { csvHeader: "Summary", target: { kind: "system", field: "title" } },
      { csvHeader: "Status", target: { kind: "system", field: "status" } },
      {
        csvHeader: "Priority",
        target: { kind: "column", columnId: "priority-id" },
      },
      {
        csvHeader: "Sprint",
        target: { kind: "create", key: "sprint", label: "Sprint", type: "select" },
      },
      { csvHeader: "Row #", target: { kind: "skip" } },
    ]);
  });

  it("normalizes status and issue type values", () => {
    expect(normalizeIssueSheetImportStatus("In Progress")).toEqual({ status: "in_progress" });
    expect(normalizeIssueSheetImportStatus("weird")).toEqual({
      error: "Unknown status: weird",
    });
    expect(normalizeIssueSheetImportIssueType("QA")).toEqual({
      issueType: "qa_failure",
    });
    expect(normalizeIssueSheetImportIssueType("misc")).toEqual({
      issueType: "general_question",
      warning: 'Unknown issue type "misc", defaulted to general question',
    });
  });

  it("infers long text columns from large values", () => {
    const longValue = "x".repeat(250);
    expect(inferIssueSheetImportColumnType(["short", longValue])).toBe("long_text");
  });

  it("requires a title mapping before import", () => {
    expect(
      issueSheetImportHasTitleMapping([{ kind: "system", field: "description" }, { kind: "skip" }]),
    ).toBe(false);
    expect(issueSheetImportHasTitleMapping([{ kind: "system", field: "title" }])).toBe(true);
  });

  it("slugifies column labels into valid keys", () => {
    expect(slugifyIssueSheetColumnKey("Reviewer Notes")).toBe("reviewer_notes");
    expect(slugifyIssueSheetColumnKey("123-start")).toBe("col_123_start");
  });
});
