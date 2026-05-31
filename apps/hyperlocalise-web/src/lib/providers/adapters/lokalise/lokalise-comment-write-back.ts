import { buildFindingId } from "@/lib/providers/provider-job-qa/build-finding-id";
import type { ProviderQaFinding } from "@/lib/providers/provider-job-qa/types";
import { buildHyperlocaliseFindingMarker } from "@/lib/providers/adapters/smartling/smartling-comment-write-back";

import { parseLokaliseKeyId } from "./lokalise-write-back";

export type LokaliseCommentWriteBackEntry = {
  findingId: string;
  finding: ProviderQaFinding;
  request: {
    keyId: number;
    locale: string | null;
    comment: string;
  };
};

function formatCommentText(finding: ProviderQaFinding, findingId: string) {
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

export function buildLokaliseCommentWriteBackEntries(input: {
  findings: ProviderQaFinding[];
  defaultLocaleId: string | null;
}): {
  entries: LokaliseCommentWriteBackEntry[];
  failures: Array<{ findingId: string; message: string }>;
} {
  const entries: LokaliseCommentWriteBackEntry[] = [];
  const failures: Array<{ findingId: string; message: string }> = [];

  for (const finding of input.findings) {
    const findingId = buildFindingId(finding);
    const keyId = parseLokaliseKeyId(finding.item.externalStringId);
    const locale = finding.item.locale?.trim() || input.defaultLocaleId?.trim() || null;

    if (keyId == null) {
      failures.push({
        findingId,
        message: "lokalise_comment_missing_key_id",
      });
      continue;
    }

    entries.push({
      findingId,
      finding,
      request: {
        keyId,
        locale,
        comment: formatCommentText(finding, findingId),
      },
    });
  }

  return { entries, failures };
}
