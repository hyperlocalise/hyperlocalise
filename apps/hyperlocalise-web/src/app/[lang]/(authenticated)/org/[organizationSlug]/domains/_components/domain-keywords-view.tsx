"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { useMemo, useState } from "react";
import { Add01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQueryClient } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { TypographyP } from "@/components/ui/typography";
import { getResearchPrototypeCatalog, type KeywordIdea, type SerpResult } from "@/lib/domains/research-prototype";
import { cn } from "@/lib/primitives/cn";

import { DomainResearchEmpty } from "./domain-research-empty";
import { formatKeywordIntent } from "./domain-research-format";
import { domainKeywordsViewMessages as messages } from "./domain-keywords-view.messages";
import { DomainSeedKeywordsDialog } from "./domain-seed-keywords-dialog";
import { liveDomainResearchQueryKey, useLiveDomainResearch } from "./use-live-domain-research";

const KEYWORD_GRID =
  "grid grid-cols-[auto_minmax(12rem,1.4fr)_repeat(3,minmax(4.5rem,0.55fr))_minmax(6rem,0.7fr)_auto] items-center gap-3 px-3 py-2.5";

export function DomainKeywordsView({
  linkedDomainId,
  organizationSlug,
}: {
  linkedDomainId: string;
  organizationSlug?: string;
}) {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const prototypeCatalog = getResearchPrototypeCatalog(linkedDomainId);
  const liveResearch = useLiveDomainResearch(organizationSlug, linkedDomainId);
  const catalog = liveResearch.data?.catalog ?? prototypeCatalog;
  const [seedOpen, setSeedOpen] = useState(false);
  const [seedPending, setSeedPending] = useState(false);
  const [persistPending, setPersistPending] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [serpKeywordId, setSerpKeywordId] = useState<string | null>(null);
  const [ideas, setIdeas] = useState<KeywordIdea[] | null>(null);
  const [liveSerpResults, setLiveSerpResults] = useState<SerpResult[] | null>(null);
  const [serpPending, setSerpPending] = useState(false);
  const [expandedMarketId, setExpandedMarketId] = useState<string | null>(null);
  const [seedKeyword, setSeedKeyword] = useState<string | undefined>();

  const keywords = ideas ?? catalog?.keywords ?? [];
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const serpKeyword = keywords.find((keyword) => keyword.id === serpKeywordId) ?? null;
  const serpResults =
    liveSerpResults ??
    (serpKeyword ? (catalog?.serpByKeywordId[serpKeyword.id] ?? []) : []);

  if (liveResearch.live && liveResearch.isPending) {
    return (
      <TypographyP size="small" tone="subtle">
        <FormattedMessage {...messages.loading} />
      </TypographyP>
    );
  }

  if (!catalog) {
    return null;
  }

  const selectedKeywords = keywords.filter((keyword) => selectedSet.has(keyword.id));
  const marketId = expandedMarketId ?? catalog.domain.market.id;

  async function expandIdeas(input: { keyword: string; marketId: string }) {
    if (!organizationSlug || !liveResearch.live) {
      toast.success(intl.formatMessage(messages.seedSuccess));
      return true;
    }
    setSeedPending(true);
    try {
      const response = await fetch(
        `/api/orgs/${encodeURIComponent(organizationSlug)}/linked-domains/${encodeURIComponent(linkedDomainId)}/research/keywords/expand`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ seedKeyword: input.keyword, marketId: input.marketId }),
        },
      );
      const body = (await response.json().catch(() => ({}))) as {
        ideas?: KeywordIdea[];
        message?: string;
      };
      if (!response.ok || !body.ideas) {
        toast.error(body.message || intl.formatMessage(messages.seedError));
        return false;
      }
      setIdeas(body.ideas);
      setSelectedIds([]);
      setExpandedMarketId(input.marketId);
      setSeedKeyword(input.keyword);
      toast.success(intl.formatMessage(messages.seedSuccess));
      return true;
    } finally {
      setSeedPending(false);
    }
  }

  async function persistSelected(path: "save" | "ranks") {
    if (!organizationSlug || !liveResearch.live) {
      toast.success(
        intl.formatMessage(path === "save" ? messages.saved : messages.sentToRanks),
      );
      setSelectedIds([]);
      return;
    }
    setPersistPending(true);
    const endpoint =
      path === "save"
        ? `/api/orgs/${encodeURIComponent(organizationSlug)}/linked-domains/${encodeURIComponent(linkedDomainId)}/research/keywords/save`
        : `/api/orgs/${encodeURIComponent(organizationSlug)}/linked-domains/${encodeURIComponent(linkedDomainId)}/research/ranks`;
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          marketId,
          seedKeyword,
          keywords: selectedKeywords,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) {
        toast.error(
          body.message ||
            intl.formatMessage(path === "save" ? messages.saveError : messages.ranksError),
        );
        return;
      }
      setSelectedIds([]);
      setIdeas(null);
      await queryClient.invalidateQueries({
        queryKey: liveDomainResearchQueryKey(organizationSlug, linkedDomainId),
      });
      toast.success(intl.formatMessage(path === "save" ? messages.saved : messages.sentToRanks));
    } finally {
      setPersistPending(false);
    }
  }

  async function inspectSerp(keyword: KeywordIdea) {
    setSerpKeywordId(keyword.id);
    setLiveSerpResults(null);
    if (!organizationSlug || !liveResearch.live) {
      return;
    }
    setSerpPending(true);
    try {
      const response = await fetch(
        `/api/orgs/${encodeURIComponent(organizationSlug)}/linked-domains/${encodeURIComponent(linkedDomainId)}/research/serp`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ keyword: keyword.keyword, marketId }),
        },
      );
      const body = (await response.json().catch(() => ({}))) as {
        results?: SerpResult[];
        message?: string;
      };
      if (!response.ok || !body.results) {
        toast.error(body.message || intl.formatMessage(messages.serpError));
        return;
      }
      setLiveSerpResults(body.results);
      await queryClient.invalidateQueries({
        queryKey: liveDomainResearchQueryKey(organizationSlug, linkedDomainId),
      });
    } finally {
      setSerpPending(false);
    }
  }

  function toggleKeyword(id: string, checked: boolean) {
    setSelectedIds((current) =>
      checked
        ? current.includes(id)
          ? current
          : [...current, id]
        : current.filter((item) => item !== id),
    );
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button size="sm" variant="outline" onClick={() => setSeedOpen(true)}>
          <HugeiconsIcon icon={Add01Icon} strokeWidth={1.8} />
          <FormattedMessage {...messages.seedCta} />
        </Button>
      </div>

      {keywords.length === 0 ? (
        <DomainResearchEmpty
          title={<FormattedMessage {...messages.emptyTitle} />}
          description={<FormattedMessage {...messages.emptyDescription} />}
          action={
            <Button size="sm" onClick={() => setSeedOpen(true)}>
              <FormattedMessage {...messages.seedCta} />
            </Button>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <div
            className={cn(
              KEYWORD_GRID,
              "border-b border-border bg-muted/40 text-xs font-medium text-muted-foreground",
            )}
          >
            <span />
            <span>
              <FormattedMessage {...messages.columnKeyword} />
            </span>
            <span className="text-end">
              <FormattedMessage {...messages.columnVolume} />
            </span>
            <span className="text-end">
              <FormattedMessage {...messages.columnKd} />
            </span>
            <span className="text-end">
              <FormattedMessage {...messages.columnCpc} />
            </span>
            <span>
              <FormattedMessage {...messages.columnIntent} />
            </span>
            <span />
          </div>
          <div className="divide-y divide-border">
            {keywords.map((keyword) => (
              <div key={keyword.id} className={KEYWORD_GRID}>
                <Checkbox
                  checked={selectedSet.has(keyword.id)}
                  onCheckedChange={(checked) => toggleKeyword(keyword.id, checked === true)}
                  aria-label={intl.formatMessage(messages.selectKeyword, {
                    keyword: keyword.keyword,
                  })}
                />
                <button
                  type="button"
                  className="min-w-0 truncate text-start font-medium text-foreground underline-offset-4 hover:underline"
                  onClick={() => {
                    void inspectSerp(keyword);
                  }}
                >
                  {keyword.keyword}
                </button>
                <span className="text-end tabular-nums text-sm text-muted-foreground">
                  {intl.formatNumber(keyword.volume)}
                </span>
                <span className="text-end tabular-nums text-sm text-muted-foreground">
                  {keyword.kd}
                </span>
                <span className="text-end tabular-nums text-sm text-muted-foreground">
                  {intl.formatNumber(keyword.cpc, {
                    style: "currency",
                    currency: "EUR",
                  })}
                </span>
                <Badge variant="outline">{formatKeywordIntent(intl, keyword.intent)}</Badge>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    void inspectSerp(keyword);
                  }}
                >
                  <FormattedMessage {...messages.inspectSerp} />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {selectedIds.length > 0 ? (
        <div className="sticky bottom-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-popover px-4 py-3 shadow-lg">
          <TypographyP size="small">
            <FormattedMessage {...messages.selectedCount} values={{ count: selectedIds.length }} />
          </TypographyP>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={persistPending}
              onClick={() => {
                void persistSelected("save");
              }}
            >
              <FormattedMessage {...messages.save} />
            </Button>
            <Button
              size="sm"
              disabled={persistPending}
              onClick={() => {
                void persistSelected("ranks");
              }}
            >
              <FormattedMessage {...messages.sendToRanks} />
            </Button>
          </div>
        </div>
      ) : null}

      <DomainSeedKeywordsDialog
        open={seedOpen}
        defaultKeyword={keywords[0]?.keyword ?? "traduction automatique"}
        defaultMarketId={catalog.domain.market.id}
        pending={seedPending}
        onOpenChange={setSeedOpen}
        onExpand={expandIdeas}
      />

      <Sheet
        open={Boolean(serpKeyword)}
        onOpenChange={(open) => {
          if (!open) {
            setSerpKeywordId(null);
            setLiveSerpResults(null);
          }
        }}
      >
        <SheetContent side="right" className="sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>
              <FormattedMessage
                {...messages.serpTitle}
                values={{ keyword: serpKeyword?.keyword ?? "" }}
              />
            </SheetTitle>
            <SheetDescription>
              <FormattedMessage
                {...messages.serpDescription}
                values={{ market: catalog.domain.market.label }}
              />
            </SheetDescription>
          </SheetHeader>
          <div className="grid gap-3 overflow-y-auto px-6 pb-6">
            {serpPending ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Spinner className="size-3.5" />
                <FormattedMessage {...messages.serpLoading} />
              </div>
            ) : serpResults.length === 0 ? (
              <TypographyP size="small" tone="subtle">
                <FormattedMessage {...messages.serpEmpty} />
              </TypographyP>
            ) : (
              serpResults.map((result) => (
                <article
                  key={`${result.position}-${result.url}`}
                  className={cn(
                    "rounded-xl border border-border p-3",
                    result.isOwn && "border-primary/40 bg-muted/60",
                  )}
                >
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="tabular-nums">#{result.position}</span>
                    {result.isOwn ? (
                      <Badge variant="success">
                        <FormattedMessage {...messages.ownResult} />
                      </Badge>
                    ) : null}
                  </div>
                  <p className="mt-1 font-medium text-foreground">{result.title}</p>
                  <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                    {result.url}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">{result.snippet}</p>
                </article>
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
