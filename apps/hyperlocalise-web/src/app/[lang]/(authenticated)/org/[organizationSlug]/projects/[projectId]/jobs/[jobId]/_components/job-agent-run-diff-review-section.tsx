"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { useEffect, useMemo, useState } from "react";
import {
  Cancel01Icon,
  CheckmarkCircle02Icon,
  Search01Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";
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
} from "@/lib/providers/agent-runs/agent-run-proposals";
import { cn } from "@/lib/primitives/cn";

import { toneClass, type Tone } from "../../../../../_components/workspace-resource-shared";

import { GlossaryMatchBadges, GlossaryMatchesDetail } from "./job-agent-run-glossary";
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
  getWarningLabel,
  paginateProposalItems,
  parseProposalItemsForRun,
  proposalReviewPageSize,
  summarizeProposalReview,
  type ProposalReviewFilter,
} from "./job-agent-run-diff-review-model";
import { jobAgentRunDiffReviewSectionMessages as messages } from "./job-agent-run-diff-review-section.messages";

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
  const intl = useIntl();
  const kinds = activeWarningKinds(item);
  if (kinds.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {kinds.map((kind) => (
        <Badge key={kind} variant="outline" className={cn("rounded-full", toneClass("watch"))}>
          {getWarningLabel(kind, intl)}
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
  const intl = useIntl();

  return (
    <li className="rounded-md border border-border bg-muted.5 px-3 py-3">
      <div className="flex flex-wrap items-start gap-3">
        <label className="mt-0.5 flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            className="size-4 rounded border-input accent-foreground"
            checked={selected}
            disabled={disabled}
            onChange={(event) => onToggle(item.itemId, event.currentTarget.checked)}
          />
        </label>
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-mono text-sm font-medium text-foreground">{item.key}</p>
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
                <FormattedMessage
                  {...messages.changedFields}
                  values={{ fields: item.changedFields.join(", ") }}
                />
              </Badge>
            ) : null}
          </div>
          <WarningBadges item={item} />
          <GlossaryMatchBadges matches={item.glossaryMatchesUsed ?? []} />
          <TranslationMemoryMatchBadges matches={item.translationMemoryMatchesUsed ?? []} />
          <div className="grid gap-3 lg:grid-cols-3">
            <div className="space-y-1 rounded-md border border-border bg-muted p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <FormattedMessage {...messages.source} />
              </p>
              <p className="text-sm whitespace-pre-wrap text-subtle-foreground">
                {item.sourceText}
              </p>
            </div>
            <div className="space-y-1 rounded-md border border-border bg-muted p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <FormattedMessage {...messages.currentProviderTarget} />
              </p>
              <p className="text-sm whitespace-pre-wrap text-subtle-foreground">
                {item.from || intl.formatMessage(messages.emptyValue)}
              </p>
            </div>
            <div className="space-y-1 rounded-md border border-flame-100/20 bg-flame-100/5 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <FormattedMessage {...messages.agentProposal} />
              </p>
              <p className="text-sm whitespace-pre-wrap text-foreground">{item.to}</p>
            </div>
          </div>
          <GlossaryMatchesDetail matches={item.glossaryMatchesUsed ?? []} />
          <TranslationMemoryMatchesDetail matches={item.translationMemoryMatchesUsed ?? []} />
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={disabled || item.reviewState === "accepted"}
              onClick={() => onAccept(item.itemId)}
            >
              <HugeiconsIcon icon={Tick02Icon} strokeWidth={1.8} />
              <FormattedMessage {...messages.accept} />
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={disabled || item.reviewState === "rejected"}
              onClick={() => onReject(item.itemId)}
            >
              <HugeiconsIcon icon={Cancel01Icon} strokeWidth={1.8} />
              <FormattedMessage {...messages.reject} />
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
  const intl = useIntl();
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
        throw new Error(intl.formatMessage(messages.noAgentRunSelected));
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
        throw new Error(
          await parseActionError(
            response,
            intl.formatMessage(messages.failedToUpdateProposalReview),
          ),
        );
      }

      return (await response.json()) as { agentRun: AgentRunRecord };
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: agentRunsQueryKey });
      setSelectedItemIds(new Set());
      toast.success(intl.formatMessage(messages.proposalReviewSaved));
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : intl.formatMessage(messages.failedToUpdateProposalReview),
      );
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
    <section className="rounded-lg border border-border bg-muted p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TypographyH2 className="font-heading text-lg font-medium text-foreground md:text-lg">
          <FormattedMessage {...messages.agentProposalReviewHeading} />
        </TypographyH2>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className={cn("rounded-full", toneClass("watch"))}>
            <FormattedMessage
              {...messages.pendingCount}
              values={{ count: reviewSummary.pending }}
            />
          </Badge>
          <Badge variant="outline" className={cn("rounded-full", toneClass("safe"))}>
            <FormattedMessage
              {...messages.acceptedCount}
              values={{ count: reviewSummary.accepted }}
            />
          </Badge>
          <Badge variant="outline" className={cn("rounded-full", toneClass("risk"))}>
            <FormattedMessage
              {...messages.rejectedCount}
              values={{ count: reviewSummary.rejected }}
            />
          </Badge>
        </div>
      </div>

      <p className="mt-2 text-sm text-muted-foreground">
        <FormattedMessage {...messages.sectionDescription} />
      </p>

      {reviewableRuns.length > 1 ? (
        <div className="mt-4 max-w-sm">
          <Select value={selectedRun?.id ?? ""} onValueChange={(value) => setSelectedRunId(value)}>
            <SelectTrigger>
              <SelectValue placeholder={intl.formatMessage(messages.selectAgentRunPlaceholder)} />
            </SelectTrigger>
            <SelectContent>
              {reviewableRuns.map((run) => (
                <SelectItem key={run.id} value={run.id}>
                  {intl.formatMessage(messages.agentRunOption, {
                    kind: run.kind.replaceAll("_", " "),
                    createdAt: new Date(run.createdAt).toLocaleString(),
                  })}
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
            className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground"
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
            placeholder={intl.formatMessage(messages.searchPlaceholder)}
            className="pl-9"
          />
        </div>
        <Select value={localeFilter} onValueChange={(value) => setLocaleFilter(value ?? "all")}>
          <SelectTrigger className="w-[8rem]">
            <SelectValue placeholder={intl.formatMessage(messages.localePlaceholder)} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              <FormattedMessage {...messages.allLocales} />
            </SelectItem>
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
            <SelectValue placeholder={intl.formatMessage(messages.reviewStatePlaceholder)} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              <FormattedMessage {...messages.allStates} />
            </SelectItem>
            <SelectItem value="pending">
              <FormattedMessage {...messages.pending} />
            </SelectItem>
            <SelectItem value="accepted">
              <FormattedMessage {...messages.accepted} />
            </SelectItem>
            <SelectItem value="rejected">
              <FormattedMessage {...messages.rejected} />
            </SelectItem>
            <SelectItem value="has_warnings">
              <FormattedMessage {...messages.hasWarnings} />
            </SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={warningFilter}
          onValueChange={(value) =>
            value && setWarningFilter(value as AgentRunProposalWarningKind | "all")
          }
        >
          <SelectTrigger className="w-[11rem]">
            <SelectValue placeholder={intl.formatMessage(messages.warningTypePlaceholder)} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              <FormattedMessage {...messages.allWarnings} />
            </SelectItem>
            <SelectItem value="glossary">
              <FormattedMessage {...messages.warningGlossary} />
            </SelectItem>
            <SelectItem value="placeholder">
              <FormattedMessage {...messages.warningPlaceholder} />
            </SelectItem>
            <SelectItem value="format">
              <FormattedMessage {...messages.warningFormat} />
            </SelectItem>
            <SelectItem value="confidence">
              <FormattedMessage {...messages.warningConfidence} />
            </SelectItem>
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
          <FormattedMessage {...messages.acceptAllPending} />
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={reviewMutation.isPending}
          onClick={() => applyBulk("rejected", "pending")}
        >
          <FormattedMessage {...messages.rejectAllPending} />
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={reviewMutation.isPending || selectedItemIds.size === 0}
          onClick={() => applyBulk("accepted", "filtered")}
        >
          <FormattedMessage {...messages.acceptSelected} />
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={reviewMutation.isPending || selectedItemIds.size === 0}
          onClick={() => applyBulk("rejected", "filtered")}
        >
          <FormattedMessage {...messages.rejectSelected} />
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            className="size-4 rounded border-input accent-foreground"
            checked={
              pagination.pageItems.length > 0 &&
              pagination.pageItems.every((item) => selectedItemIds.has(item.itemId))
            }
            onChange={(event) => togglePageSelection(event.currentTarget.checked)}
          />
          <FormattedMessage {...messages.selectPage} />
        </label>
        <p>
          <FormattedMessage
            {...messages.showingFiltered}
            values={{
              pageCount: pagination.pageItems.length,
              filteredCount: pagination.totalCount,
              totalCount: allItems.length,
            }}
          />
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
        <p className="mt-4 text-sm text-muted-foreground">
          <FormattedMessage {...messages.noProposalsMatchFilters} />
        </p>
      )}

      {pagination.totalPages > 1 ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={pagination.currentPage <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            <FormattedMessage {...messages.previous} />
          </Button>
          <p className="text-sm text-muted-foreground">
            <FormattedMessage
              {...messages.pageOf}
              values={{
                currentPage: pagination.currentPage,
                totalPages: pagination.totalPages,
              }}
            />
          </p>
          <Button
            size="sm"
            variant="outline"
            disabled={pagination.currentPage >= pagination.totalPages}
            onClick={() => setPage((current) => current + 1)}
          >
            <FormattedMessage {...messages.next} />
          </Button>
        </div>
      ) : null}
    </section>
  );
}
