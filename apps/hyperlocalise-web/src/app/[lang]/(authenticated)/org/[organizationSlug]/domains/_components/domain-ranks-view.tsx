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
import { Add01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useDomainResearchCatalog } from "./domain-research-context";
import { cn } from "@/lib/primitives/cn";

import { DomainResearchEmpty } from "./domain-research-empty";
import { formatSignedDelta } from "./domain-research-format";
import { DomainResearchTextareaDialog } from "./domain-research-textarea-dialog";
import { domainRanksViewMessages as messages } from "./domain-ranks-view.messages";

const RANK_GRID =
  "grid grid-cols-[minmax(12rem,1.2fr)_repeat(2,minmax(4rem,0.4fr))_minmax(10rem,1fr)_minmax(4.5rem,0.45fr)] items-center gap-3 px-3 py-2.5";

export function DomainRanksView({ linkedDomainId }: { linkedDomainId: string }) {
  const intl = useIntl();
  const catalog = useDomainResearchCatalog(linkedDomainId);
  const [addOpen, setAddOpen] = useState(false);

  if (!catalog) {
    return null;
  }

  return (
    <div className="grid gap-4">
      <div className="flex justify-end">
        <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
          <HugeiconsIcon icon={Add01Icon} strokeWidth={1.8} />
          <FormattedMessage {...messages.addCta} />
        </Button>
      </div>

      {catalog.ranks.length === 0 ? (
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
            {catalog.ranks.map((row) => {
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
        onOpenChange={setAddOpen}
        onSubmit={() => toast.success(intl.formatMessage(messages.addSuccess))}
      />
    </div>
  );
}
