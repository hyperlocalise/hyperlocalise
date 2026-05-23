"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Cancel01Icon,
  CheckmarkCircle02Icon,
  Search01Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TypographyH2 } from "@/components/ui/typography";
import { apiClient } from "@/lib/api-client-instance";
import type {
  AgentRunProposalItem,
  AgentRunProposalReviewState,
  AgentRunProposalWarningKind,
} from "@/lib/providers/agent-run-proposals";
import { cn } from "@/lib/utils";

import { toneClass, type Tone } from "../../../_components/workspace-resource-shared";

import {
  TranslationMemoryMatchBadges,
  TranslationMemoryMatchesDetail,
} from "./job-agent-run-translation-memory";
import type { AgentRunRecord } from "./job-provider-detail-section";
import {
  activeWarningKinds,
  collectProposalLocales,
  filterProposalItems,
  listReviewableAgentRuns,
  paginateProposalItems,
  parseProposalItemsForRun,
  proposalReviewPageSize,
  summarizeProposalReview,
  warningLabels,
  type ProposalReviewFilter,
} from "./job-agent-run-diff-review-model";

function reviewStateTone(state: AgentRunProposalReviewState): Tone {
  switch (state) {
    case "accepted":
      return "safe";
    case "rejected":
      return "risk";
    default:
      return "watch";
  }
}

function parseActionError(response: Response, fallback: string) {
  return response
    .json()
    .then((body: { error?: string; message?: string }) => body.message ?? body.error)
    .catch(() => null)
    .then((error) => (error ? `${fallback}: ${error}` : `${fallback} (${response.status})`));
}

function WarningBadges({ item }: { item: AgentRunProposalItem }) {
  const kinds = activeWarningKinds(item);
  if (kinds.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {kinds.map((kind) => (
        <Badge key={kind} variant="outline" className={cn("rounded-full", toneClass("watch"))}>
          {warningLabels[kind]}
        </Badge>
      ))}
    </div>
  );
}

function ProposalDiffRow({
  item,
  selected,
  onToggle,
  onAccept,
  onReject,
  disabled,
}: {
  item: AgentRunProposalItem;
  selected: boolean;
  onToggle: (itemId: string, checked: boolean) => void;
  onAccept: (itemId: string) => void;
  onReject: (itemId: string) => void;
  disabled: boolean;
}) {
  return (
    <li className="rounded-md border border-foreground/8 bg-foreground/3.5 px-3 py-3">
      <div className="flex flex-wrap items-start gap-3">
        <label className="mt-0.5 flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            className="size-4 rounded border-foreground/20 accent-foreground"
            checked={selected}
            disabled={disabled}
            onChange={(event) => onToggle(item.itemId, event.currentTarget.checked)}
          />
        </label>
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-mono text-sm font-medium text-foreground/86">{item.key}</p>
            <Badge variant="outline" className="rounded-full uppercase">
              {item.locale}
            </Badge>
            <Badge
              variant="outline"
              className={cn(
                "rounded-full capitalize",
                toneClass(reviewStateTone(item.reviewState)),
              )}
            >
              {item.reviewState}
            </Badge>
            {item.changedFields.length > 0 ? (
              <Badge variant="outline" className="rounded-full">
                Changed: {item.changedFields.join(", ")}
              </Badge>
            ) : null}
          </div>
          <WarningBadges item={item} />
          <TranslationMemoryMatchBadges matches={item.translationMemoryMatchesUsed ?? []} />
          <div className="grid gap-3 lg:grid-cols-3">
            <div className="space-y-1 rounded-md border border-foreground/8 bg-foreground/2 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-foreground/42">
                Source
              </p>
              <p className="text-sm whitespace-pre-wrap text-foreground/78">{item.sourceText}</p>
            </div>
            <div className="space-y-1 rounded-md border border-foreground/8 bg-foreground/2 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-foreground/42">
                Current provider target
              </p>
              <p className="text-sm whitespace-pre-wrap text-foreground/78">{item.from || "—"}</p>
            </div>
            <div className="space-y-1 rounded-md border border-flame-100/20 bg-flame-100/5 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-foreground/42">
                Agent proposal
              </p>
              <p className="text-sm whitespace-pre-wrap text-foreground/86">{item.to}</p>
            </div>
          </div>
          <TranslationMemoryMatchesDetail matches={item.translationMemoryMatchesUsed ?? []} />
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={disabled || item.reviewState === "accepted"}
              onClick={() => onAccept(item.itemId)}
            >
              <HugeiconsIcon icon={Tick02Icon} strokeWidth={1.8} />
              Accept
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={disabled || item.reviewState === "rejected"}
              onClick={() => onReject(item.itemId)}
            >
              <HugeiconsIcon icon={Cancel01Icon} strokeWidth={1.8} />
              Reject
            </Button>
          </div>
        </div>
      </div>
    </li>
  );
}

export function JobAgentRunDiffReviewSection({
  jobId,
  organizationSlug,
  agentRuns,
  agentRunsLoading,
}: {
  jobId: string;
  organizationSlug: string;
  agentRuns: AgentRunRecord[] | undefined;
  agentRunsLoading: boolean;
}) {
  const queryClient = useQueryClient();
  const agentRunsQueryKey = ["job-agent-runs", organizationSlug, jobId] as const;

  const reviewableRuns = useMemo(() => listReviewableAgentRuns(agentRuns), [agentRuns]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [localeFilter, setLocaleFilter] = useState("all");
  const [reviewFilter, setReviewFilter] = useState<ProposalReviewFilter>("pending");
  const [warningFilter, setWarningFilter] = useState<AgentRunProposalWarningKind | "all">("all");
  const [page, setPage] = useState(1);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!selectedRunId && reviewableRuns.length > 0) {
      setSelectedRunId(reviewableRuns[0]!.id);
    }
  }, [reviewableRuns, selectedRunId]);

  useEffect(() => {
    setPage(1);
    setSelectedItemIds(new Set());
  }, [selectedRunId, search, localeFilter, reviewFilter, warningFilter]);

  const selectedRun =
    reviewableRuns.find((run) => run.id === selectedRunId) ?? reviewableRuns[0] ?? null;
  const allItems = useMemo(
    () => (selectedRun ? parseProposalItemsForRun(selectedRun) : []),
    [selectedRun],
  );
  const filteredItems = useMemo(
    () =>
      filterProposalItems(allItems, {
        search,
        locale: localeFilter,
        reviewFilter,
        warningFilter,
      }),
    [allItems, localeFilter, reviewFilter, search, warningFilter],
  );
  const pagination = useMemo(
    () => paginateProposalItems(filteredItems, page, proposalReviewPageSize),
    [filteredItems, page],
  );
  const reviewSummary = useMemo(() => summarizeProposalReview(allItems), [allItems]);
  const locales = useMemo(() => collectProposalLocales(allItems), [allItems]);

  const reviewMutation = useMutation({
    mutationFn: async (body: {
      updates?: Array<{ itemId: string; reviewState: "accepted" | "rejected" }>;
      bulk?: {
        reviewState: "accepted" | "rejected";
        itemIds?: string[];
        scope?: "pending" | "all" | "filtered";
        itemIdsFilter?: string[];
      };
    }) => {
      if (!selectedRun) {
        throw new Error("No agent run selected");
      }

      const response = await apiClient.api.orgs[":organizationSlug"].jobs[":jobId"]["agent-runs"][
        ":agentRunId"
      ].review.$patch({
        param: {
          organizationSlug,
          jobId,
          agentRunId: selectedRun.id,
        },
        json: body,
      });

      if (!response.ok) {
        throw new Error(await parseActionError(response, "Failed to update proposal review"));
      }

      return (await response.json()) as { agentRun: AgentRunRecord };
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: agentRunsQueryKey });
      setSelectedItemIds(new Set());
      toast.success("Proposal review saved");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to update proposal review");
    },
  });

  const toggleItem = (itemId: string, checked: boolean) => {
    setSelectedItemIds((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(itemId);
      } else {
        next.delete(itemId);
      }
      return next;
    });
  };

  const togglePageSelection = (checked: boolean) => {
    setSelectedItemIds((current) => {
      const next = new Set(current);
      for (const item of pagination.pageItems) {
        if (checked) {
          next.add(item.itemId);
        } else {
          next.delete(item.itemId);
        }
      }
      return next;
    });
  };

  const applyUpdates = (
    updates: Array<{ itemId: string; reviewState: "accepted" | "rejected" }>,
  ) => {
    if (updates.length === 0) {
      return;
    }
    reviewMutation.mutate({ updates });
  };

  const applyBulk = (
    reviewState: "accepted" | "rejected",
    scope: "pending" | "all" | "filtered",
  ) => {
    reviewMutation.mutate({
      bulk: {
        reviewState,
        scope,
        ...(scope === "filtered" ? { itemIdsFilter: [...selectedItemIds] } : {}),
      },
    });
  };

  if (agentRunsLoading) {
    return null;
  }

  if (reviewableRuns.length === 0) {
    return null;
  }

  return (
    <section className="rounded-lg border border-foreground/8 bg-foreground/2.5 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TypographyH2 className="font-heading text-lg font-medium text-foreground md:text-lg">
          Agent Proposal Review
        </TypographyH2>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className={cn("rounded-full", toneClass("watch"))}>
            Pending: {reviewSummary.pending}
          </Badge>
          <Badge variant="outline" className={cn("rounded-full", toneClass("safe"))}>
            Accepted: {reviewSummary.accepted}
          </Badge>
          <Badge variant="outline" className={cn("rounded-full", toneClass("risk"))}>
            Rejected: {reviewSummary.rejected}
          </Badge>
        </div>
      </div>

      <p className="mt-2 text-sm text-foreground/52">
        Inspect agent-proposed translations before pushing approved changes back to the provider.
      </p>

      {reviewableRuns.length > 1 ? (
        <div className="mt-4 max-w-sm">
          <Select value={selectedRun?.id ?? ""} onValueChange={(value) => setSelectedRunId(value)}>
            <SelectTrigger>
              <SelectValue placeholder="Select agent run" />
            </SelectTrigger>
            <SelectContent>
              {reviewableRuns.map((run) => (
                <SelectItem key={run.id} value={run.id}>
                  {run.kind.replaceAll("_", " ")} · {new Date(run.createdAt).toLocaleString()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <div className="relative min-w-[12rem] flex-1">
          <HugeiconsIcon
            icon={Search01Icon}
            strokeWidth={1.8}
            className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-foreground/42"
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
            placeholder="Search key, locale, or text"
            className="pl-9"
          />
        </div>
        <Select value={localeFilter} onValueChange={(value) => setLocaleFilter(value ?? "all")}>
          <SelectTrigger className="w-[8rem]">
            <SelectValue placeholder="Locale" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All locales</SelectItem>
            {locales.map((locale) => (
              <SelectItem key={locale} value={locale}>
                {locale}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={reviewFilter}
          onValueChange={(value) => value && setReviewFilter(value as ProposalReviewFilter)}
        >
          <SelectTrigger className="w-[10rem]">
            <SelectValue placeholder="Review state" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All states</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="accepted">Accepted</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="has_warnings">Has warnings</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={warningFilter}
          onValueChange={(value) =>
            value && setWarningFilter(value as AgentRunProposalWarningKind | "all")
          }
        >
          <SelectTrigger className="w-[11rem]">
            <SelectValue placeholder="Warning type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All warnings</SelectItem>
            <SelectItem value="glossary">Glossary</SelectItem>
            <SelectItem value="placeholder">Placeholder</SelectItem>
            <SelectItem value="format">Format</SelectItem>
            <SelectItem value="confidence">Confidence</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={reviewMutation.isPending}
          onClick={() => applyBulk("accepted", "pending")}
        >
          <HugeiconsIcon icon={CheckmarkCircle02Icon} strokeWidth={1.8} />
          Accept all pending
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={reviewMutation.isPending}
          onClick={() => applyBulk("rejected", "pending")}
        >
          Reject all pending
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={reviewMutation.isPending || selectedItemIds.size === 0}
          onClick={() => applyBulk("accepted", "filtered")}
        >
          Accept selected
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={reviewMutation.isPending || selectedItemIds.size === 0}
          onClick={() => applyBulk("rejected", "filtered")}
        >
          Reject selected
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm text-foreground/52">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            className="size-4 rounded border-foreground/20 accent-foreground"
            checked={
              pagination.pageItems.length > 0 &&
              pagination.pageItems.every((item) => selectedItemIds.has(item.itemId))
            }
            onChange={(event) => togglePageSelection(event.currentTarget.checked)}
          />
          Select page
        </label>
        <p>
          Showing {pagination.pageItems.length} of {pagination.totalCount} filtered ·{" "}
          {allItems.length} total
        </p>
      </div>

      {pagination.pageItems.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {pagination.pageItems.map((item) => (
            <ProposalDiffRow
              key={item.itemId}
              item={item}
              selected={selectedItemIds.has(item.itemId)}
              disabled={reviewMutation.isPending}
              onToggle={toggleItem}
              onAccept={(itemId) => applyUpdates([{ itemId, reviewState: "accepted" }])}
              onReject={(itemId) => applyUpdates([{ itemId, reviewState: "rejected" }])}
            />
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-foreground/48">No proposals match the current filters.</p>
      )}

      {pagination.totalPages > 1 ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={pagination.currentPage <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            Previous
          </Button>
          <p className="text-sm text-foreground/52">
            Page {pagination.currentPage} of {pagination.totalPages}
          </p>
          <Button
            size="sm"
            variant="outline"
            disabled={pagination.currentPage >= pagination.totalPages}
            onClick={() => setPage((current) => current + 1)}
          >
            Next
          </Button>
        </div>
      ) : null}
    </section>
  );
}
