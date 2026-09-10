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
import { getResearchPrototypeDomain } from "@/lib/domains/research-prototype";
import { getDomainMetricHistory } from "@/lib/domains/research-metric-history";
import { DomainMetricCard } from "./domain-metric-card";
import { DomainOverviewTables } from "./domain-overview-tables";
import { domainMetricMessages as messages } from "./domain-metric.messages";

export function DomainOverviewView({ linkedDomainId }: { linkedDomainId: string }) {
  const intl = useIntl();
  const domain = getResearchPrototypeDomain(linkedDomainId);
  if (!domain) return null;
  const history = getDomainMetricHistory(linkedDomainId);
  const metrics = [
    {
      key: "traffic" as const,
      label: intl.formatMessage(messages.traffic),
      value: domain.trafficLabel,
    },
    {
      key: "keywords" as const,
      label: intl.formatMessage(messages.keywords),
      value: domain.keywordCountLabel,
    },
    {
      key: "tracked" as const,
      label: intl.formatMessage(messages.tracked),
      value: intl.formatNumber(domain.trackedCount),
    },
    {
      key: "aiMentions" as const,
      label: intl.formatMessage(messages.aiMentions),
      value: intl.formatNumber(domain.aiMentions),
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
      <p className="text-sm text-muted-foreground">
        <FormattedMessage {...messages.sampleData} />
      </p>
      <DomainOverviewTables linkedDomainId={linkedDomainId} />
    </div>
  );
}
