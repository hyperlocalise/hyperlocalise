import { describe, expect, it } from "vite-plus/test";

import {
  attachFindingIds,
  buildFindingId,
  buildProjectFilesHref,
  filterFindings,
  formatProviderCommentWriteBackLabel,
  groupFindings,
  indexProviderCommentWriteBackFromAgentRuns,
  isProviderCommentWriteBackComplete,
  isProviderReviewFindingsAgentRun,
  isQaChecksAgentRun,
  isReviewWithAgentRun,
  parseProviderReviewReportFromOutputSummary,
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

  it("parses provider review reports from agent run output summaries", () => {
    const report = parseProviderReviewReportFromOutputSummary({
      reviewThreads: [
        {
          threadId: "crowdin:1:9:issue:42",
          kind: "issue",
          state: "open",
          comments: [{ externalCommentId: "42", body: "Wrong tense" }],
          providerContext: {
            externalProjectId: "1",
            externalJobId: "9",
            externalThreadId: "42",
            providerUrl: "https://crowdin.com/project/demo",
          },
        },
      ],
      reviewSummary: { total: 1, open: 1, resolved: 0, byKind: { issue: 1 } },
    });

    expect(report?.threads).toHaveLength(1);
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

  it("indexes provider comment write-back status from comment_only agent runs", () => {
    const findingId = buildFindingId(sampleFinding);
    const indexed = indexProviderCommentWriteBackFromAgentRuns([
      {
        kind: "comment_only",
        status: "succeeded",
        createdAt: "2026-01-01T00:00:00.000Z",
        completedAt: "2026-01-01T00:01:00.000Z",
        changedItems: [
          {
            type: "provider_comment",
            findingId,
            status: "posted",
            externalCommentUid: "comment-42",
            providerReviewContext: {
              providerUrl: "https://crowdin.com/project/demo/comments/42",
            },
          },
        ],
      },
    ]);

    const writeBack = indexed.get(findingId);
    expect(writeBack).toMatchObject({
      status: "posted",
      externalCommentUid: "comment-42",
      providerUrl: "https://crowdin.com/project/demo/comments/42",
    });
    expect(formatProviderCommentWriteBackLabel(writeBack)).toBe("Comment posted");
    expect(isProviderCommentWriteBackComplete(writeBack)).toBe(true);
  });

  it("prefers posted write-back status over later failed retries", () => {
    const findingId = buildFindingId(sampleFinding);
    const indexed = indexProviderCommentWriteBackFromAgentRuns([
      {
        kind: "comment_only",
        status: "succeeded",
        createdAt: "2026-01-01T00:00:00.000Z",
        completedAt: "2026-01-01T00:01:00.000Z",
        changedItems: [
          {
            type: "provider_comment",
            findingId,
            status: "posted",
            externalCommentUid: "comment-42",
          },
        ],
      },
      {
        kind: "comment_only",
        status: "failed",
        createdAt: "2026-01-02T00:00:00.000Z",
        completedAt: "2026-01-02T00:01:00.000Z",
        changedItems: [
          {
            type: "provider_comment",
            findingId,
            status: "failed",
            message: "provider_comment_push_failed",
          },
        ],
      },
    ]);

    expect(indexed.get(findingId)?.status).toBe("posted");
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
