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
import { TypographyP } from "@/components/ui/typography";
import { getResearchPrototypeCatalog } from "@/lib/domains/research-prototype";
import { cn } from "@/lib/primitives/cn";

import { DomainResearchEmpty } from "./domain-research-empty";
import { formatKeywordIntent } from "./domain-research-format";
import { domainKeywordsViewMessages as messages } from "./domain-keywords-view.messages";
import { DomainSeedKeywordsDialog } from "./domain-seed-keywords-dialog";

const KEYWORD_GRID =
  "grid grid-cols-[auto_minmax(12rem,1.4fr)_repeat(3,minmax(4.5rem,0.55fr))_minmax(6rem,0.7fr)_auto] items-center gap-3 px-3 py-2.5";

export function DomainKeywordsView({ linkedDomainId }: { linkedDomainId: string }) {
  const intl = useIntl();
  const catalog = getResearchPrototypeCatalog(linkedDomainId);
  const [seedOpen, setSeedOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [serpKeywordId, setSerpKeywordId] = useState<string | null>(null);

  const keywords = catalog?.keywords ?? [];
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const serpKeyword = keywords.find((keyword) => keyword.id === serpKeywordId) ?? null;
  const serpResults = serpKeyword ? (catalog?.serpByKeywordId[serpKeyword.id] ?? []) : [];

  if (!catalog) {
    return null;
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
                  onClick={() => setSerpKeywordId(keyword.id)}
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
                <Button size="sm" variant="ghost" onClick={() => setSerpKeywordId(keyword.id)}>
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
              onClick={() => {
                toast.success(intl.formatMessage(messages.saved));
                setSelectedIds([]);
              }}
            >
              <FormattedMessage {...messages.save} />
            </Button>
            <Button
              size="sm"
              onClick={() => {
                toast.success(intl.formatMessage(messages.sentToRanks));
                setSelectedIds([]);
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
        onOpenChange={setSeedOpen}
      />

      <Sheet
        open={Boolean(serpKeyword)}
        onOpenChange={(open) => {
          if (!open) {
            setSerpKeywordId(null);
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
            {serpResults.length === 0 ? (
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
