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
import { FormattedMessage, useIntl } from "react-intl";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDomainResearchCatalog } from "./domain-research-context";
import { cn } from "@/lib/primitives/cn";

import { DomainResearchEmpty } from "./domain-research-empty";
import { domainOverviewViewMessages as messages } from "./domain-overview-view.messages";

const KEYWORD_GRID =
  "grid grid-cols-[minmax(12rem,1.4fr)_repeat(3,minmax(4.5rem,0.55fr))] items-center gap-3 px-3 py-2.5";
const PAGE_GRID =
  "grid grid-cols-[minmax(12rem,1.4fr)_repeat(2,minmax(4.5rem,0.55fr))] items-center gap-3 px-3 py-2.5";

export function DomainOverviewTables({ linkedDomainId }: { linkedDomainId: string }) {
  const intl = useIntl();
  const catalog = useDomainResearchCatalog(linkedDomainId);
  const [tab, setTab] = useState<"keywords" | "pages">("keywords");

  if (!catalog) {
    return null;
  }

  const rows = tab === "keywords" ? catalog.overviewKeywords : catalog.overviewPages;

  return (
    <div className="grid gap-4">
      <Tabs
        value={tab}
        onValueChange={(value) => {
          if (value === "keywords" || value === "pages") {
            setTab(value);
          }
        }}
      >
        <TabsList>
          <TabsTrigger value="keywords">
            <FormattedMessage {...messages.keywordsTab} />
          </TabsTrigger>
          <TabsTrigger value="pages">
            <FormattedMessage {...messages.pagesTab} />
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {rows.length === 0 ? (
        <DomainResearchEmpty
          title={
            tab === "pages" ? (
              <FormattedMessage {...messages.emptyPages} />
            ) : (
              <FormattedMessage {...messages.emptyKeywords} />
            )
          }
        />
      ) : tab === "keywords" ? (
        <div className="overflow-x-auto rounded-lg border border-border">
          <div
            className={cn(
              KEYWORD_GRID,
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
              <FormattedMessage {...messages.columnVolume} />
            </span>
            <span className="text-end">
              <FormattedMessage {...messages.columnTraffic} />
            </span>
          </div>
          <div className="divide-y divide-border">
            {catalog.overviewKeywords.map((row) => (
              <div key={row.id} className={KEYWORD_GRID}>
                <span className="truncate font-medium">{row.keyword}</span>
                <span className="text-end tabular-nums text-sm text-muted-foreground">
                  {row.position}
                </span>
                <span className="text-end tabular-nums text-sm text-muted-foreground">
                  {intl.formatNumber(row.volume)}
                </span>
                <span className="text-end tabular-nums text-sm text-muted-foreground">
                  {intl.formatNumber(row.traffic)}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <div
            className={cn(
              PAGE_GRID,
              "border-b border-border bg-muted/40 text-xs font-medium text-muted-foreground",
            )}
          >
            <span>
              <FormattedMessage {...messages.columnPage} />
            </span>
            <span className="text-end">
              <FormattedMessage {...messages.columnKeywords} />
            </span>
            <span className="text-end">
              <FormattedMessage {...messages.columnTraffic} />
            </span>
          </div>
          <div className="divide-y divide-border">
            {catalog.overviewPages.map((row) => (
              <div key={row.id} className={PAGE_GRID}>
                <span className="truncate font-mono text-sm">{row.path}</span>
                <span className="text-end tabular-nums text-sm text-muted-foreground">
                  {intl.formatNumber(row.keywords)}
                </span>
                <span className="text-end tabular-nums text-sm text-muted-foreground">
                  {intl.formatNumber(row.traffic)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
