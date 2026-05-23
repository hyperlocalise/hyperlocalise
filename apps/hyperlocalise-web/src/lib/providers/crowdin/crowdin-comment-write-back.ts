import { buildFindingId } from "@/lib/providers/provider-job-qa/build-finding-id";
import type { ProviderQaFinding } from "@/lib/providers/provider-job-qa/types";
import { buildHyperlocaliseFindingMarker } from "@/lib/providers/smartling/smartling-comment-write-back";

export type CrowdinCommentWriteBackEntry = {
  findingId: string;
  finding: ProviderQaFinding;
  request: {
    stringId: number;
    targetLanguageId: string;
    text: string;
    type: "issue";
    issueType: string;
  };
};

export function mapProviderSeverityToCrowdinIssueType(severity: ProviderQaFinding["severity"]) {
  switch (severity) {
    case "error":
      return "translation_mistake";
    case "warning":
      return "general_question";
    case "info":
    default:
      return "context_request";
  }
}

function formatIssueText(finding: ProviderQaFinding, findingId: string) {
  const lines = [
    buildHyperlocaliseFindingMarker(findingId),
    `[${finding.checkType}] ${finding.message}`,
  ];

  if (finding.suggestedFix) {
    lines.push(`Suggested fix: ${finding.suggestedFix}`);
  }

  if (typeof finding.confidence === "number") {
    lines.push(`Confidence: ${finding.confidence}`);
  }

  return lines.join("\n");
}

export function buildCrowdinCommentWriteBackEntries(input: {
  findings: ProviderQaFinding[];
  defaultLocaleId: string | null;
}): {
  entries: CrowdinCommentWriteBackEntry[];
  failures: Array<{ findingId: string; message: string }>;
} {
  const entries: CrowdinCommentWriteBackEntry[] = [];
  const failures: Array<{ findingId: string; message: string }> = [];

  for (const finding of input.findings) {
    const findingId = buildFindingId(finding);
    const rawStringId = finding.item.externalStringId.trim();
    const stringId = Number(rawStringId);
    const targetLanguageId = finding.item.locale?.trim() || input.defaultLocaleId?.trim() || "";

    if (!rawStringId || Number.isNaN(stringId)) {
      failures.push({
        findingId,
        message: "crowdin_comment_missing_string_id",
      });
      continue;
    }

    if (!targetLanguageId) {
      failures.push({
        findingId,
        message: "crowdin_comment_missing_locale",
      });
      continue;
    }

    entries.push({
      findingId,
      finding,
      request: {
        stringId,
        targetLanguageId,
        text: formatIssueText(finding, findingId),
        type: "issue",
        issueType: mapProviderSeverityToCrowdinIssueType(finding.severity),
      },
    });
  }

  return { entries, failures };
}
