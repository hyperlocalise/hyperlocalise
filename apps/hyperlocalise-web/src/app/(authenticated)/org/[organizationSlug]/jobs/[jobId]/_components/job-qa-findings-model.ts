import {
  providerQaReportSchema,
  providerReviewReportSchema,
} from "@/api/routes/project/job-qa.schema";
import { buildFindingId } from "@/lib/providers/provider-job-qa/build-finding-id";
import type {
  ProviderQaCheckType,
  ProviderQaFinding,
  ProviderQaReport,
  ProviderQaSeverity,
} from "@/lib/providers/provider-job-qa/types";
import type {
  ProviderReviewReport,
  ProviderReviewThread,
  ProviderReviewThreadKind,
  ProviderReviewThreadState,
} from "@/lib/providers/provider-job-review/types";

export { buildFindingId };

export type {
  ProviderQaFinding,
  ProviderQaReport,
  ProviderQaCheckType,
  ProviderQaSeverity,
  ProviderReviewReport,
  ProviderReviewThread,
};

export type QaFindingGroupBy = "severity" | "locale" | "checkType" | "key";

export type QaFindingWithId = ProviderQaFinding & { id: string };

export type QaFindingGroup = {
  key: string;
  label: string;
  findings: QaFindingWithId[];
};

export function attachFindingIds(findings: ProviderQaFinding[]): QaFindingWithId[] {
  return findings.map((finding) => ({
    ...finding,
    id: buildFindingId(finding),
  }));
}

export function parseQaReportFromOutputSummary(
  outputSummary: Record<string, unknown> | undefined,
): ProviderQaReport | null {
  if (!outputSummary) {
    return null;
  }

  const parsed = providerQaReportSchema.safeParse({
    findings: outputSummary.findings,
    summary: outputSummary.summary,
  });

  if (!parsed.success) {
    return null;
  }

  return parsed.data;
}

export function parseProviderReviewReportFromOutputSummary(
  outputSummary: Record<string, unknown> | undefined,
): ProviderReviewReport | null {
  if (!outputSummary) {
    return null;
  }

  const parsed = providerReviewReportSchema.safeParse({
    threads: outputSummary.reviewThreads,
    summary: outputSummary.reviewSummary,
  });

  if (!parsed.success) {
    return null;
  }

  return parsed.data;
}

export function formatReviewThreadKindLabel(kind: ProviderReviewThreadKind) {
  return kind.replaceAll("_", " ");
}

export function formatReviewThreadStateLabel(state: ProviderReviewThreadState) {
  return state;
}

export function formatReviewAuthorLabel(
  author: ProviderReviewThread["author"] | undefined | null,
): string | null {
  if (!author) {
    return null;
  }

  return author.displayName?.trim() || author.username?.trim() || author.externalUserId || null;
}

export function isQaChecksAgentRun(inputSnapshot: Record<string, unknown> | undefined) {
  return inputSnapshot?.action === "run_qa_checks";
}

export function isReviewWithAgentRun(inputSnapshot: Record<string, unknown> | undefined) {
  return inputSnapshot?.action === "review_with_agent";
}

/** Agent runs that produce inspectable QA/review findings (hl check + supplemental checks). */
export function isProviderReviewFindingsAgentRun(
  inputSnapshot: Record<string, unknown> | undefined,
) {
  const action = inputSnapshot?.action;
  return action === "review_with_agent" || action === "run_qa_checks";
}

export function formatCheckTypeLabel(checkType: ProviderQaCheckType) {
  return checkType.replaceAll("_", " ");
}

export function formatSeverityLabel(severity: ProviderQaSeverity) {
  return severity;
}

export function inferSourcePathFromKey(key: string): string | null {
  const trimmed = key.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.includes("/") || trimmed.endsWith(".json") || trimmed.endsWith(".xml")) {
    return trimmed;
  }

  const dotted = trimmed.split(".");
  if (dotted.length > 1 && dotted[0].length > 0) {
    return `${dotted[0]}.json`;
  }

  return null;
}

export function buildProjectFilesHref(input: {
  organizationSlug: string;
  projectId: string;
  key: string;
  locale?: string;
}) {
  const params = new URLSearchParams();
  const sourcePath = inferSourcePathFromKey(input.key);
  if (sourcePath) {
    params.set("sourcePath", sourcePath);
  }
  if (input.locale) {
    params.set("locale", input.locale);
  }
  const query = params.toString();
  const base = `/org/${input.organizationSlug}/projects/${input.projectId}/files`;
  return query ? `${base}?${query}` : base;
}

export function filterFindings(
  findings: QaFindingWithId[],
  filters: {
    severity: string;
    locale: string;
    checkType: string;
    search: string;
  },
): QaFindingWithId[] {
  const query = filters.search.trim().toLowerCase();

  return findings.filter((finding) => {
    if (filters.severity !== "all" && finding.severity !== filters.severity) {
      return false;
    }
    if (filters.locale !== "all" && (finding.item.locale ?? "") !== filters.locale) {
      return false;
    }
    if (filters.checkType !== "all" && finding.checkType !== filters.checkType) {
      return false;
    }
    if (query) {
      const haystack = [
        finding.item.key,
        finding.item.externalStringId,
        finding.message,
        finding.suggestedFix ?? "",
        finding.item.locale ?? "",
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(query)) {
        return false;
      }
    }
    return true;
  });
}

export function groupFindings(
  findings: QaFindingWithId[],
  groupBy: QaFindingGroupBy,
): QaFindingGroup[] {
  const groups = new Map<string, QaFindingWithId[]>();

  for (const finding of findings) {
    let groupKey: string;

    switch (groupBy) {
      case "locale":
        groupKey = finding.item.locale ?? "unknown";
        break;
      case "checkType":
        groupKey = finding.checkType;
        break;
      case "key":
        groupKey = finding.item.key;
        break;
      default:
        groupKey = finding.severity;
    }

    const bucket = groups.get(groupKey);
    if (bucket) {
      bucket.push(finding);
    } else {
      groups.set(groupKey, [finding]);
    }
  }

  const severityOrder: Record<ProviderQaSeverity, number> = {
    error: 0,
    warning: 1,
    info: 2,
  };

  return [...groups.entries()]
    .map(([key, bucket]) => ({
      key,
      label: bucket[0] ? groupFindingsLabel(bucket[0], groupBy) : key,
      findings: bucket,
    }))
    .sort((left, right) => {
      if (groupBy === "severity") {
        const leftSeverity = left.findings[0]?.severity ?? "info";
        const rightSeverity = right.findings[0]?.severity ?? "info";
        return severityOrder[leftSeverity] - severityOrder[rightSeverity];
      }
      return left.label.localeCompare(right.label);
    });
}

function groupFindingsLabel(finding: QaFindingWithId, groupBy: QaFindingGroupBy) {
  switch (groupBy) {
    case "locale":
      return finding.item.locale ?? "Unknown locale";
    case "checkType":
      return formatCheckTypeLabel(finding.checkType);
    case "key":
      return finding.item.key;
    default:
      return formatSeverityLabel(finding.severity);
  }
}

export function collectFilterOptions(findings: QaFindingWithId[]) {
  const locales = new Set<string>();
  const checkTypes = new Set<ProviderQaCheckType>();

  for (const finding of findings) {
    if (finding.item.locale) {
      locales.add(finding.item.locale);
    }
    checkTypes.add(finding.checkType);
  }

  return {
    locales: [...locales].sort((a, b) => a.localeCompare(b)),
    checkTypes: [...checkTypes].sort((a, b) => a.localeCompare(b)),
  };
}
