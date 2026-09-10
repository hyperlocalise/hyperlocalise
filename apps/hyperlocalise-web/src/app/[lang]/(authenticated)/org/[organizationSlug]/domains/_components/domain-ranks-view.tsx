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
import { useState } from "react";
import { Add01Icon, ReloadIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQueryClient } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { TypographyP } from "@/components/ui/typography";
import {
  DOMAIN_RESEARCH_MARKETS,
  getResearchPrototypeCatalog,
} from "@/lib/domains/research-prototype";
import { cn } from "@/lib/primitives/cn";

import { DomainResearchEmpty } from "./domain-research-empty";
import { formatSignedDelta } from "./domain-research-format";
import { DomainResearchTextareaDialog } from "./domain-research-textarea-dialog";
import { domainRanksViewMessages as messages } from "./domain-ranks-view.messages";
import { liveDomainResearchQueryKey, useLiveDomainResearch } from "./use-live-domain-research";

const RANK_GRID =
  "grid grid-cols-[minmax(12rem,1.2fr)_repeat(2,minmax(4rem,0.4fr))_minmax(10rem,1fr)_minmax(4.5rem,0.45fr)] items-center gap-3 px-3 py-2.5";

function parseKeywordLines(value: string) {
  const unique = new Map<string, string>();
  for (const line of value.split(/\n/)) {
    const keyword = line.trim();
    if (!keyword) {
      continue;
    }
    unique.set(keyword.toLowerCase(), keyword);
  }
  return [...unique.values()].slice(0, 20).map((keyword) => ({ keyword }));
}

export function DomainRanksView({
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
  const [market, setMarket] = useState(catalog?.domain.market.id ?? DOMAIN_RESEARCH_MARKETS[0]?.id);
  const [addOpen, setAddOpen] = useState(false);
  const [addPending, setAddPending] = useState(false);
  const [refreshPending, setRefreshPending] = useState(false);

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

  const marketId = market ?? catalog.domain.market.id;
  const ranks = catalog.ranks.filter(
    (row) => (row.marketId ?? catalog.domain.market.id) === marketId,
  );

  async function addKeywords(value: string) {
    const keywords = parseKeywordLines(value);
    if (keywords.length === 0) {
      return false;
    }
    if (!organizationSlug || !liveResearch.live) {
      toast.success(intl.formatMessage(messages.addSuccess));
      return true;
    }
    setAddPending(true);
    try {
      const response = await fetch(
        `/api/orgs/${encodeURIComponent(organizationSlug)}/linked-domains/${encodeURIComponent(linkedDomainId)}/research/ranks`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ marketId, keywords }),
        },
      );
      const body = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) {
        toast.error(body.message || intl.formatMessage(messages.addError));
        return false;
      }
      await queryClient.invalidateQueries({
        queryKey: liveDomainResearchQueryKey(organizationSlug, linkedDomainId),
      });
      toast.success(intl.formatMessage(messages.addSuccess));
      return true;
    } finally {
      setAddPending(false);
    }
  }

  async function refreshRanks() {
    if (!organizationSlug || !liveResearch.live) {
      return;
    }
    setRefreshPending(true);
    try {
      const response = await fetch(
        `/api/orgs/${encodeURIComponent(organizationSlug)}/linked-domains/${encodeURIComponent(linkedDomainId)}/research/ranks/refresh`,
        { method: "POST" },
      );
      const body = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) {
        toast.error(body.message || intl.formatMessage(messages.refreshError));
        return;
      }
      await queryClient.invalidateQueries({
        queryKey: liveDomainResearchQueryKey(organizationSlug, linkedDomainId),
      });
      toast.success(intl.formatMessage(messages.refreshSuccess));
    } finally {
      setRefreshPending(false);
    }
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Field className="w-full sm:w-48">
          <FieldLabel htmlFor="rank-market">
            <FormattedMessage {...messages.market} />
          </FieldLabel>
          <Select
            value={marketId}
            items={DOMAIN_RESEARCH_MARKETS.map((item) => ({ value: item.id, label: item.label }))}
            onValueChange={(value) => {
              if (value) {
                setMarket(value);
              }
            }}
          >
            <SelectTrigger id="rank-market" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {DOMAIN_RESEARCH_MARKETS.map((item) => (
                  <SelectItem key={item.id} value={item.id} label={item.label}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <div className="flex flex-wrap justify-end gap-2">
          {liveResearch.live ? (
            <Button
              size="sm"
              variant="outline"
              disabled={refreshPending || ranks.length === 0}
              onClick={() => {
                void refreshRanks();
              }}
            >
              {refreshPending ? (
                <Spinner className="size-3.5" />
              ) : (
                <HugeiconsIcon icon={ReloadIcon} strokeWidth={1.8} />
              )}
              <FormattedMessage {...messages.refreshCta} />
            </Button>
          ) : null}
          <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
            <HugeiconsIcon icon={Add01Icon} strokeWidth={1.8} />
            <FormattedMessage {...messages.addCta} />
          </Button>
        </div>
      </div>

      {ranks.length === 0 ? (
        <DomainResearchEmpty
          title={<FormattedMessage {...messages.emptyTitle} />}
          description={<FormattedMessage {...messages.emptyDescription} />}
          action={
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <FormattedMessage {...messages.addCta} />
            </Button>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <div
            className={cn(
              RANK_GRID,
              "border-b border-border bg-muted/40 text-xs font-medium text-muted-foreground",
            )}
          >
            <span>
              <FormattedMessage {...messages.columnKeyword} />
            </span>
            <span className="text-end">
              <FormattedMessage {...messages.columnPosition} />
            </span>
            <span className="text-end">
              <FormattedMessage {...messages.columnChange} />
            </span>
            <span>
              <FormattedMessage {...messages.columnUrl} />
            </span>
            <span className="text-end">
              <FormattedMessage {...messages.columnVolume} />
            </span>
          </div>
          <div className="divide-y divide-border">
            {ranks.map((row) => {
              const delta =
                row.position != null && row.previousPosition != null
                  ? row.previousPosition - row.position
                  : 0;
              return (
                <div key={row.id} className={RANK_GRID}>
                  <span className="truncate font-medium">{row.keyword}</span>
                  <span className="text-end tabular-nums text-sm text-muted-foreground">
                    {row.position ?? intl.formatMessage(messages.unranked)}
                  </span>
                  <span
                    className={cn(
                      "text-end tabular-nums text-sm",
                      delta > 0 && "text-grove-900",
                      delta < 0 && "text-destructive",
                      delta === 0 && "text-muted-foreground",
                    )}
                  >
                    {formatSignedDelta(delta)}
                  </span>
                  <span className="truncate font-mono text-xs text-muted-foreground">
                    {row.url}
                  </span>
                  <span className="text-end tabular-nums text-sm text-muted-foreground">
                    {intl.formatNumber(row.volume)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <DomainResearchTextareaDialog
        open={addOpen}
        title={intl.formatMessage(messages.addTitle)}
        description={intl.formatMessage(messages.addDescription)}
        label={intl.formatMessage(messages.addLabel)}
        placeholder={intl.formatMessage(messages.addPlaceholder)}
        submitLabel={intl.formatMessage(messages.addSubmit)}
        pending={addPending}
        onOpenChange={setAddOpen}
        onSubmit={addKeywords}
      />
    </div>
  );
}
