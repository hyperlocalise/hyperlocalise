import { describe, expect, it } from "vite-plus/test";

import {
  attachFindingIds,
  buildFindingId,
  buildProjectFilesHref,
  filterFindings,
  groupFindings,
  isProviderReviewFindingsAgentRun,
  isQaChecksAgentRun,
  isReviewWithAgentRun,
  parseQaReportFromOutputSummary,
} from "./job-qa-findings-model";

const sampleFinding = {
  checkType: "placeholder_mismatch" as const,
  severity: "error" as const,
  message: "Placeholder mismatch",
  item: {
    externalStringId: "1001",
    key: "locales/en.json",
    locale: "fr",
    field: "target" as const,
  },
};

describe("job-qa-findings-model", () => {
  it("parses QA reports from agent run output summaries", () => {
    const report = parseQaReportFromOutputSummary({
      findings: [sampleFinding],
      summary: { total: 1, byCheckType: {}, bySeverity: { error: 1 } },
    });

    expect(report?.findings).toHaveLength(1);
    expect(report?.summary.total).toBe(1);
  });

  it("rejects malformed QA reports in output summaries", () => {
    expect(
      parseQaReportFromOutputSummary({
        findings: [{ ...sampleFinding, severity: 42 }],
        summary: { total: 1, byCheckType: {}, bySeverity: { error: 1 } },
      }),
    ).toBeNull();
  });

  it("assigns distinct ids when the same check fires twice on one item", () => {
    const first = buildFindingId(sampleFinding);
    const second = buildFindingId({
      ...sampleFinding,
      message: "Different placeholder detail",
    });

    expect(first).not.toBe(second);

    const withIds = attachFindingIds([
      sampleFinding,
      { ...sampleFinding, message: "Different placeholder detail" },
    ]);

    expect(new Set(withIds.map((finding) => finding.id)).size).toBe(2);
  });

  it("filters findings by severity and search query", () => {
    const findings = attachFindingIds([
      sampleFinding,
      {
        ...sampleFinding,
        severity: "warning",
        message: "Length expansion warning",
        item: { ...sampleFinding.item, key: "other.key" },
      },
    ]);

    const filtered = filterFindings(findings, {
      severity: "error",
      locale: "all",
      checkType: "all",
      search: "placeholder",
    });

    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.severity).toBe("error");
  });

  it("groups findings by locale", () => {
    const findings = attachFindingIds([sampleFinding]);
    const groups = groupFindings(findings, "locale");

    expect(groups).toHaveLength(1);
    expect(groups[0]?.label).toBe("fr");
  });

  it("builds project file links with locale and inferred source path", () => {
    const href = buildProjectFilesHref({
      organizationSlug: "acme",
      projectId: "project-1",
      key: "locales/en.json",
      locale: "fr",
    });

    expect(href).toBe("/org/acme/projects/project-1/files?sourcePath=locales%2Fen.json&locale=fr");
  });
});

describe("provider review findings agent run helpers", () => {
  it("identifies QA check runs", () => {
    expect(isQaChecksAgentRun({ action: "run_qa_checks" })).toBe(true);
    expect(isQaChecksAgentRun({ action: "review_with_agent" })).toBe(false);
  });

  it("identifies review_with_agent runs", () => {
    expect(isReviewWithAgentRun({ action: "review_with_agent" })).toBe(true);
    expect(isReviewWithAgentRun({ action: "run_qa_checks" })).toBe(false);
  });

  it("treats both review and QA actions as findings-producing runs", () => {
    expect(isProviderReviewFindingsAgentRun({ action: "review_with_agent" })).toBe(true);
    expect(isProviderReviewFindingsAgentRun({ action: "run_qa_checks" })).toBe(true);
    expect(isProviderReviewFindingsAgentRun({ action: "translate_with_agent" })).toBe(false);
  });
});
