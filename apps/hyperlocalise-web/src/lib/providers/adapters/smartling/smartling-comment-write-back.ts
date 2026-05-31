import { buildFindingId } from "@/lib/providers/provider-job-qa/build-finding-id";
import type { ProviderQaFinding, ProviderQaSeverity } from "@/lib/providers/provider-job-qa/types";

import type { SmartlingIssueTemplate } from "./smartling-api";

export const HYPERLOCALISE_FINDING_MARKER_PREFIX = "[hyperlocalise:finding=";

export type SmartlingCommentWriteBackEntry = {
  findingId: string;
  finding: ProviderQaFinding;
  issueTemplate: SmartlingIssueTemplate;
};

export function buildHyperlocaliseFindingMarker(findingId: string) {
  return `${HYPERLOCALISE_FINDING_MARKER_PREFIX}${findingId}]`;
}

export function parseHyperlocaliseFindingMarker(issueText: string | null | undefined) {
  if (!issueText) {
    return null;
  }

  const match = issueText.match(/\[hyperlocalise:finding=([^\]]+)\]/);
  return match?.[1] ?? null;
}

export function mapProviderSeverityToSmartling(severity: ProviderQaSeverity) {
  switch (severity) {
    case "error":
      return "HIGH";
    case "warning":
      return "MEDIUM";
    case "info":
    default:
      return "LOW";
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

export function buildSmartlingCommentWriteBackEntries(input: {
  findings: ProviderQaFinding[];
  defaultLocaleId: string | null;
}): {
  entries: SmartlingCommentWriteBackEntry[];
  failures: Array<{ findingId: string; message: string }>;
} {
  const entries: SmartlingCommentWriteBackEntry[] = [];
  const failures: Array<{ findingId: string; message: string }> = [];

  for (const finding of input.findings) {
    const findingId = buildFindingId(finding);
    const hashcode = finding.item.externalStringId.trim();
    const localeId = finding.item.locale?.trim() || input.defaultLocaleId?.trim() || "";

    if (!hashcode) {
      failures.push({
        findingId,
        message: "smartling_comment_missing_hashcode",
      });
      continue;
    }

    if (!localeId) {
      failures.push({
        findingId,
        message: "smartling_comment_missing_locale",
      });
      continue;
    }

    entries.push({
      findingId,
      finding,
      issueTemplate: {
        string: { hashcode, localeId },
        issueTypeCode: "REVIEW",
        issueText: formatIssueText(finding, findingId),
        issueSeverityLevelCode: mapProviderSeverityToSmartling(finding.severity),
      },
    });
  }

  return { entries, failures };
}
