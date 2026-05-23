import { describe, expect, it } from "vite-plus/test";

import {
  attachFindingIds,
  buildProjectFilesHref,
  filterFindings,
  groupFindings,
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
