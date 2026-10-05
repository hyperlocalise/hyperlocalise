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
import { FormattedMessage, useIntl } from "react-intl";
import { ArrowClockwiseIcon, Spinner } from "@phosphor-icons/react";
import { useDomainResearchCatalog } from "./domain-research-context";
import { TypographyP } from "@/components/ui/typography";
import { isLiveDomainResearchId } from "@/lib/domains/research-prototype";
import { getDomainMetricHistory } from "@/lib/domains/research-metric-history";
import { Button } from "@/components/ui/button";
import { useDomainOverview } from "./use-domain-overview";

import { DomainMetricCard } from "./domain-metric-card";
import { DomainOverviewTables } from "./domain-overview-tables";
import { domainMetricMessages as messages } from "./domain-metric.messages";
import { domainOverviewViewMessages as overviewMessages } from "./domain-overview-view.messages";

export function DomainOverviewView({
  linkedDomainId,
  organizationSlug,
  canRefresh = false,
}: {
  linkedDomainId: string;
  organizationSlug?: string;
  canRefresh?: boolean;
}) {
  const intl = useIntl();
  const catalog = useDomainResearchCatalog(linkedDomainId);
  const domain = catalog?.domain;
  const live = Boolean(organizationSlug && isLiveDomainResearchId(linkedDomainId));
  const history = getDomainMetricHistory(linkedDomainId);
  const marketId = catalog?.market.id ?? domain?.locales[0]?.id ?? "";
  const overviewQuery = useDomainOverview(organizationSlug ?? "", linkedDomainId, marketId);
  if (!domain) return null;
  const overview = live ? overviewQuery.data : null;
  const sampleOverview = {
    market: { id: "", label: "", location: "", language: "", locationCode: 0 },
    capturedAt: "",
    organicKeywordCount: domain.keywordCount,
    organicEtv: 0,
    top10Count: 0,
    trackedCount: domain.trackedCount,
    improvedCount: 0,
    declinedCount: 0,
    unchangedCount: 0,
    unrankedCount: 0,
    topKeywords: (catalog?.overviewKeywords ?? []).map((row) => ({
      keyword: row.keyword,
      position: row.position,
      volume: row.volume,
      etv: row.traffic,
    })),
    topPages: (catalog?.overviewPages ?? []).map((row) => ({
      page: row.path,
      keywordCount: row.keywords,
      etv: row.traffic,
    })),
  };
  const refresh = () => overviewQuery.refresh.mutate();
  const metrics = [
    {
      key: "traffic" as const,
      label: intl.formatMessage(messages.traffic),
      value: overview
        ? intl.formatNumber(overview.organicEtv, { notation: "compact", maximumFractionDigits: 1 })
        : domain.trafficLabel,
    },
    {
      key: "keywords" as const,
      label: intl.formatMessage(messages.keywords),
      value: overview ? intl.formatNumber(overview.organicKeywordCount) : domain.keywordCountLabel,
    },
    {
      key: "tracked" as const,
      label: overview
        ? intl.formatMessage(overviewMessages.top10)
        : intl.formatMessage(messages.tracked),
      value: overview
        ? intl.formatNumber(overview.top10Count)
        : intl.formatNumber(domain.trackedCount),
    },
    {
      key: "aiMentions" as const,
      label: overview
        ? intl.formatMessage(messages.tracked)
        : intl.formatMessage(messages.aiMentions),
      value: overview
        ? intl.formatNumber(overview.trackedCount)
        : intl.formatNumber(domain.aiMentions),
    },
  ];
  return (
    <div className="grid gap-6">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <DomainMetricCard
            key={metric.key}
            label={metric.label}
            value={metric.value}
            history={history?.[metric.key]}
          />
        ))}
      </section>
      {live ? (
        <section className="grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <TypographyP size="small" tone="subtle">
              {overview ? (
                <FormattedMessage
                  {...overviewMessages.capturedAt}
                  values={{ date: intl.formatDate(overview.capturedAt, { dateStyle: "medium" }) }}
                />
              ) : (
                <FormattedMessage {...overviewMessages.noSnapshot} />
              )}
            </TypographyP>
            {canRefresh ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={overviewQuery.refresh.isPending}
                onClick={refresh}
              >
                {overviewQuery.refresh.isPending ? (
                  <Spinner className="size-3.5" />
                ) : (
                  <ArrowClockwiseIcon />
                )}
                <FormattedMessage
                  {...(overviewQuery.refresh.isPending
                    ? overviewMessages.refreshing
                    : overviewMessages.refresh)}
                />
              </Button>
            ) : null}
          </div>
          {overviewQuery.isError || overviewQuery.refresh.isError ? (
            <TypographyP size="small" tone="subtle">
              <FormattedMessage {...overviewMessages.loadError} />
            </TypographyP>
          ) : null}
          {overview ? (
            <>
              <TypographyP size="small" tone="subtle">
                <FormattedMessage {...overviewMessages.providerDisclosure} />
              </TypographyP>
              <DomainOverviewTables overview={overview} />
            </>
          ) : null}
        </section>
      ) : (
        <>
          <TypographyP size="small" tone="subtle">
            <FormattedMessage {...messages.sampleData} />
          </TypographyP>
          <DomainOverviewTables overview={sampleOverview} />
        </>
      )}
    </div>
  );
}
