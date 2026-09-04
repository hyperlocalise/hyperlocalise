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
import { useDeferredValue, useMemo, useState } from "react";

import type {
  IntegrationCategory,
  MarketingIntegration,
} from "@/components/marketing/integrations/integrations-page-content";
import {
  getCategoryLabelForIntegration,
  getIntegrationsIndexCopy,
} from "@/components/marketing/integrations/integrations-page-content";
import { IntegrationCard } from "@/components/marketing/integrations/integration-card";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { footerColumns } from "@/components/marketing/marketing-page-content";
import { Box } from "@/components/ui/layout/box";
import { Column } from "@/components/ui/layout/column";
import { Columns } from "@/components/ui/layout/columns";
import { Rows } from "@/components/ui/layout/rows";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { TypographyH1, TypographyMuted, TypographyP } from "@/components/ui/typography";
import { cn } from "@/lib/primitives/cn";

type IntegrationsIndexPageProps = {
  integrations: MarketingIntegration[];
  lang: string;
  categoryLabels: { id: IntegrationCategory; label: string }[];
};

function groupIntegrationsIntoTriples(
  integrations: MarketingIntegration[],
): MarketingIntegration[][] {
  const rows: MarketingIntegration[][] = [];

  for (let index = 0; index < integrations.length; index += 3) {
    rows.push(integrations.slice(index, index + 3));
  }

  return rows;
}

export function IntegrationsIndexPage({
  integrations,
  lang,
  categoryLabels,
}: IntegrationsIndexPageProps) {
  const copy = getIntegrationsIndexCopy(lang);
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<IntegrationCategory | "all">("all");
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());

  const filteredIntegrations = useMemo(() => {
    return integrations.filter((integration) => {
      const matchesCategory =
        activeCategory === "all" ? true : integration.category === activeCategory;
      const haystack = [integration.name, integration.tagline, integration.category]
        .join(" ")
        .toLowerCase();

      return matchesCategory && haystack.includes(deferredQuery);
    });
  }, [activeCategory, deferredQuery, integrations]);

  const rows = groupIntegrationsIntoTriples(filteredIntegrations);

  return (
    <Box background="canvas" width="full">
      <main className="mx-auto min-h-screen max-w-7xl text-foreground">
        <Rows spacing="0">
          <Box paddingX="3u" paddingTop="6u" paddingBottom="4u">
            <Rows spacing="2u">
              <Rows spacing="1u">
                <TypographyH1>{copy.headline}</TypographyH1>
                <TypographyP size="large" tone="subtle">
                  {copy.subcopy}
                </TypographyP>
              </Rows>

              <div className="max-w-md">
                <Input
                  aria-label={copy.searchPlaceholder}
                  onChange={(event) => setQuery(event.currentTarget.value)}
                  placeholder={copy.searchPlaceholder}
                  value={query}
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-sm transition-colors",
                    activeCategory === "all"
                      ? "border-foreground bg-foreground text-background"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                  onClick={() => setActiveCategory("all")}
                  type="button"
                >
                  {copy.filterAll}
                </button>
                {categoryLabels.map((category) => (
                  <button
                    key={category.id}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-sm transition-colors",
                      activeCategory === category.id
                        ? "border-foreground bg-foreground text-background"
                        : "border-border text-muted-foreground hover:text-foreground",
                    )}
                    onClick={() => setActiveCategory(category.id)}
                    type="button"
                  >
                    {category.label}
                  </button>
                ))}
              </div>
            </Rows>
          </Box>

          <Box paddingX="3u" paddingBottom="8u">
            {filteredIntegrations.length > 0 ? (
              <Rows spacing="4u">
                {rows.map((rowIntegrations, rowIndex) => (
                  <Columns key={rowIndex} collapseBelow="medium" spacing="3u">
                    {rowIntegrations.map((integration) => (
                      <Column key={integration.slug} width="1/3">
                        <IntegrationCard
                          categoryLabel={getCategoryLabelForIntegration(lang, integration.category)}
                          integration={integration}
                          lang={lang}
                        />
                      </Column>
                    ))}
                  </Columns>
                ))}
              </Rows>
            ) : (
              <TypographyMuted className="text-center" size="medium">
                {copy.emptyState}
              </TypographyMuted>
            )}
          </Box>

          <Separator />
          <Box paddingX="3u" paddingTop="6u">
            <MarketingFooter columns={footerColumns} />
          </Box>
        </Rows>
      </main>
    </Box>
  );
}
