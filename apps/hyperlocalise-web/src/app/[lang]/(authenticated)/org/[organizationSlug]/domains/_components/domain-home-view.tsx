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
import {
  ArrowUp01Icon,
  Chat01Icon,
  DashboardSquare01Icon,
  Search01Icon,
  SparklesIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FormattedMessage, useIntl } from "react-intl";

import { OrgNavLink } from "@/components/app-shell/org-nav-link";
import { buildDomainPath } from "@/components/app-shell/navigation-config";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TypographyP } from "@/components/ui/typography";
import type { DomainResearchSurface } from "@/lib/domains/research-prototype";
import { getResearchPrototypeDomain } from "@/lib/domains/research-prototype";

import { domainHomeViewMessages as messages } from "./domain-home-view.messages";

const SURFACES: {
  id: DomainResearchSurface;
  icon: typeof Search01Icon;
  title: typeof messages.keywordsCardTitle;
  body: typeof messages.keywordsCardBody;
}[] = [
  {
    id: "keywords",
    icon: Search01Icon,
    title: messages.keywordsCardTitle,
    body: messages.keywordsCardBody,
  },
  {
    id: "overview",
    icon: DashboardSquare01Icon,
    title: messages.overviewCardTitle,
    body: messages.overviewCardBody,
  },
  {
    id: "ranks",
    icon: ArrowUp01Icon,
    title: messages.ranksCardTitle,
    body: messages.ranksCardBody,
  },
  {
    id: "brand",
    icon: SparklesIcon,
    title: messages.brandCardTitle,
    body: messages.brandCardBody,
  },
  {
    id: "prompts",
    icon: Chat01Icon,
    title: messages.promptsCardTitle,
    body: messages.promptsCardBody,
  },
];

export function DomainHomeView({
  organizationSlug,
  linkedDomainId,
}: {
  organizationSlug: string;
  linkedDomainId: string;
}) {
  const intl = useIntl();
  const domain = getResearchPrototypeDomain(linkedDomainId);
  if (!domain) {
    return null;
  }

  const metrics = [
    {
      label: intl.formatMessage(messages.traffic),
      value: domain.trafficLabel,
    },
    {
      label: intl.formatMessage(messages.keywords),
      value: domain.keywordCountLabel,
    },
    {
      label: intl.formatMessage(messages.tracked),
      value: intl.formatNumber(domain.trackedCount),
    },
    {
      label: intl.formatMessage(messages.aiMentions),
      value: intl.formatNumber(domain.aiMentions),
    },
  ];

  return (
    <div className="grid gap-6">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <Card
            key={metric.label}
            size="sm"
            className="rounded-lg border border-border bg-card py-0 ring-0"
          >
            <CardContent className="px-4 py-4">
              <TypographyP size="small" tone="subtle">
                {metric.label}
              </TypographyP>
              <TypographyP
                className="mt-2 font-heading text-3xl tabular-nums text-blue-1000"
                weight="medium"
              >
                {metric.value}
              </TypographyP>
              <TypographyP className="mt-1" size="small" tone="subtle">
                {domain.market.label}
              </TypographyP>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {SURFACES.map((surface) => (
          <Card
            key={surface.id}
            className="group rounded-lg border border-border bg-card py-0 ring-0 hover:border-blue-400 hover:bg-blue-100/40 focus-within:border-blue-400"
          >
            <CardHeader className="px-5 py-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle className="text-lg">
                    <FormattedMessage {...surface.title} />
                  </CardTitle>
                  <CardDescription className="mt-1">
                    <FormattedMessage {...surface.body} />
                  </CardDescription>
                </div>
                <HugeiconsIcon
                  icon={surface.icon}
                  strokeWidth={1.8}
                  className="size-5 shrink-0 text-blue-900"
                />
              </div>
            </CardHeader>
            <CardContent className="px-5 pb-5">
              <Button
                size="sm"
                variant="outline"
                render={
                  <OrgNavLink
                    href={buildDomainPath(organizationSlug, linkedDomainId, surface.id)}
                  />
                }
              >
                <FormattedMessage {...messages.openSurface} />
              </Button>
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  );
}
