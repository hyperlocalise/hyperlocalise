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

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { TypographyH2, TypographyP } from "@/components/ui/typography";
import type { BrandEngine, BrandSentiment } from "@/lib/domains/research-prototype";
import { getResearchPrototypeCatalog } from "@/lib/domains/research-prototype";
import { cn } from "@/lib/primitives/cn";

import { DomainResearchEmpty } from "./domain-research-empty";
import { formatBrandEngine } from "./domain-research-format";
import { DomainResearchTextareaDialog } from "./domain-research-textarea-dialog";
import { domainBrandViewMessages as messages } from "./domain-brand-view.messages";

const ENGINES: BrandEngine[] = ["chatgpt", "claude", "gemini", "perplexity"];
const COMPETITOR_GRID =
  "grid grid-cols-[minmax(10rem,1.2fr)_minmax(5rem,0.4fr)_minmax(6rem,0.5fr)] items-center gap-3 px-3 py-2.5";

function sentimentMessage(sentiment: BrandSentiment) {
  switch (sentiment) {
    case "positive":
      return messages.sentimentPositive;
    case "mixed":
      return messages.sentimentMixed;
    case "negative":
      return messages.sentimentNegative;
  }
}

export function DomainBrandView({ linkedDomainId }: { linkedDomainId: string }) {
  const intl = useIntl();
  const catalog = getResearchPrototypeCatalog(linkedDomainId);
  const [addOpen, setAddOpen] = useState(false);

  if (!catalog) {
    return null;
  }

  return (
    <div className="grid gap-6">
      <div className="flex justify-end">
        <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
          <HugeiconsIcon icon={Add01Icon} strokeWidth={1.8} />
          <FormattedMessage {...messages.addCta} />
        </Button>
      </div>

      <section className="grid gap-3">
        <TypographyH2 className="pb-0" size="xlarge">
          <FormattedMessage {...messages.enginesHeading} />
        </TypographyH2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {ENGINES.map((engine) => (
            <Card
              key={engine}
              size="sm"
              className="rounded-lg border border-border bg-muted py-0 ring-0"
            >
              <CardContent className="px-4 py-4">
                <TypographyP size="small" tone="subtle">
                  {formatBrandEngine(intl, engine)}
                </TypographyP>
                <TypographyP className="mt-2 font-heading text-3xl" weight="medium">
                  {intl.formatNumber(catalog.engineMentions[engine] / 100, {
                    style: "percent",
                  })}
                </TypographyP>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {catalog.competitors.length === 0 ? (
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
              COMPETITOR_GRID,
              "border-b border-border bg-muted/40 text-xs font-medium text-muted-foreground",
            )}
          >
            <span>
              <FormattedMessage {...messages.columnCompetitor} />
            </span>
            <span className="text-end">
              <FormattedMessage {...messages.columnMentions} />
            </span>
            <span>
              <FormattedMessage {...messages.columnSentiment} />
            </span>
          </div>
          <div className="divide-y divide-border">
            {catalog.competitors.map((row) => (
              <div key={row.id} className={COMPETITOR_GRID}>
                <span className="font-medium">{row.name}</span>
                <span className="text-end tabular-nums text-sm text-muted-foreground">
                  {intl.formatNumber(row.mentions)}
                </span>
                <Badge
                  variant={
                    row.sentiment === "positive"
                      ? "success"
                      : row.sentiment === "negative"
                        ? "destructive"
                        : "outline"
                  }
                >
                  <FormattedMessage {...sentimentMessage(row.sentiment)} />
                </Badge>
              </div>
            ))}
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
        onSubmit={() => {
          toast.success(intl.formatMessage(messages.addSuccess));
        }}
      />
    </div>
  );
}
