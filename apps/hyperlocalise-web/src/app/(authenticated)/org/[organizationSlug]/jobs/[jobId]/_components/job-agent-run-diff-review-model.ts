import type {
  AgentRunProposalItem,
  AgentRunProposalReviewState,
  AgentRunProposalWarningKind,
} from "@/lib/providers/agent-runs/agent-run-proposals";
import {
  agentRunHasReviewableProposals,
  countAgentRunProposalReviewStates,
  parseAgentRunProposalItems,
} from "@/lib/providers/agent-runs/agent-run-proposals";

import type { AgentRunRecord } from "./job-provider-detail-section";

export type ProposalReviewFilter = "all" | AgentRunProposalReviewState | "has_warnings";

export const proposalReviewPageSize = 25;

export const warningLabels: Record<AgentRunProposalWarningKind, string> = {
  glossary: "Glossary",
  placeholder: "Placeholder",
  format: "Format",
  confidence: "Confidence",
};

export function listReviewableAgentRuns(agentRuns: AgentRunRecord[] | undefined) {
  return (agentRuns ?? []).filter((run) =>
    agentRunHasReviewableProposals({
      kind: run.kind,
      status: run.status,
      changedItems: run.changedItems,
    }),
  );
}

export function parseProposalItemsForRun(run: AgentRunRecord) {
  return parseAgentRunProposalItems(run.changedItems);
}

export function summarizeProposalReview(items: AgentRunProposalItem[]) {
  return countAgentRunProposalReviewStates(items);
}

export function filterProposalItems(
  items: AgentRunProposalItem[],
  input: {
    search: string;
    locale: string;
    reviewFilter: ProposalReviewFilter;
    warningFilter: AgentRunProposalWarningKind | "all";
  },
) {
  const search = input.search.trim().toLowerCase();

  return items.filter((item) => {
    if (input.locale !== "all" && item.locale !== input.locale) {
      return false;
    }

    if (input.reviewFilter === "has_warnings") {
      if (!Object.values(item.warnings).some(Boolean)) {
        return false;
      }
    } else if (input.reviewFilter !== "all" && item.reviewState !== input.reviewFilter) {
      return false;
    }

    if (input.warningFilter !== "all" && !item.warnings[input.warningFilter]) {
      return false;
    }

    if (!search) {
      return true;
    }

    return (
      item.key.toLowerCase().includes(search) ||
      item.locale.toLowerCase().includes(search) ||
      item.sourceText.toLowerCase().includes(search) ||
      item.from.toLowerCase().includes(search) ||
      item.to.toLowerCase().includes(search)
    );
  });
}

export function paginateProposalItems<T>(items: T[], page: number, pageSize: number) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.min(Math.max(page, 1), totalPages);
  const start = (currentPage - 1) * pageSize;

  return {
    currentPage,
    totalPages,
    pageItems: items.slice(start, start + pageSize),
    totalCount: items.length,
  };
}

export function collectProposalLocales(items: AgentRunProposalItem[]) {
  return [...new Set(items.map((item) => item.locale))].sort();
}

export function activeWarningKinds(item: AgentRunProposalItem) {
  return (Object.keys(item.warnings) as AgentRunProposalWarningKind[]).filter(
    (kind) => item.warnings[kind],
  );
}
