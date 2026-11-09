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
import { FormattedMessage, useIntl, type MessageDescriptor } from "react-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TypographyH2, TypographyP } from "@/components/ui/typography";
import {
  buildLocalisationAuditCriteria,
  groupLocalisationAuditCriteria,
  type LocalisationAuditCriterion,
} from "@/lib/localisation-audit/criteria";
import { LOCALISATION_AUDIT_METHODOLOGY_VERSION } from "@/lib/localisation-audit/credits/catalog";
import type {
  LocalisationDeepAuditFindingQuery,
  LocalisationDeepAuditFindingRow,
  LocalisationDeepAuditRun,
  LocalisationDeepAuditSummary,
} from "@/lib/localisation-audit/deep/types";
import type { LocalisationAuditFindingSeverity } from "@/lib/localisation-audit/types";

import { domainAuditViewMessages as messages } from "./domain-audit-view.messages";
import { useDomainDeepAuditDetail } from "./use-domain-deep-audits";

const FINDINGS_PAGE_SIZE = 50;
const ALL = "all";

const SEVERITIES = ["critical", "high", "medium", "low", "info"] as const;
type FilterSeverity = (typeof SEVERITIES)[number];

const DIFF_TABS = ["all", "new", "unchanged", "fixed"] as const;
type DiffTab = (typeof DIFF_TABS)[number];

function isDiffTab(value: unknown): value is DiffTab {
  return typeof value === "string" && (DIFF_TABS as readonly string[]).includes(value);
}

function severityMessage(severity: LocalisationAuditFindingSeverity): MessageDescriptor {
  switch (severity) {
    case "critical":
      return messages.severityCritical;
    case "high":
    case "warning":
      return messages.severityHigh;
    case "medium":
      return messages.severityMedium;
    case "low":
      return messages.severityLow;
    default:
      return messages.severityInfo;
  }
}

function severityVariant(severity: LocalisationAuditFindingSeverity) {
  if (severity === "critical" || severity === "high" || severity === "warning") {
    return "destructive" as const;
  }
  return severity === "medium" ? ("warning" as const) : ("outline" as const);
}

function diffTabMessage(tab: DiffTab) {
  switch (tab) {
    case "new":
      return messages.diffNew;
    case "unchanged":
      return messages.diffUnchanged;
    case "fixed":
      return messages.diffFixed;
    default:
      return messages.diffAll;
  }
}

function CheckRow({
  criterion,
  stats,
  onViewFindings,
}: {
  criterion: LocalisationAuditCriterion;
  stats: LocalisationDeepAuditSummary["creditStats"][string] | undefined;
  onViewFindings: (creditId: string) => void;
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-2.5 last:border-b-0">
      <div className="min-w-0 flex-1">
        <TypographyP size="small" className="font-medium">
          {criterion.title}
        </TypographyP>
        {stats ? (
          <TypographyP size="small" tone="subtle">
            <FormattedMessage {...messages.affectedPages} values={{ count: stats.affectedPages }} />
            {" · "}
            <FormattedMessage
              {...messages.affectedTemplates}
              values={{ count: stats.affectedTemplates }}
            />
          </TypographyP>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        {criterion.score != null ? (
          <span className="text-sm tabular-nums text-muted-foreground">{criterion.score}</span>
        ) : null}
        {stats ? (
          <Button size="sm" variant="ghost" onClick={() => onViewFindings(criterion.id)}>
            <FormattedMessage {...messages.viewFindings} />
          </Button>
        ) : null}
      </div>
    </li>
  );
}

function CheckGroup({
  title,
  criteria,
  summary,
  onViewFindings,
}: {
  title: MessageDescriptor;
  criteria: LocalisationAuditCriterion[];
  summary: LocalisationDeepAuditSummary;
  onViewFindings: (creditId: string) => void;
}) {
  if (criteria.length === 0) return null;
  return (
    <section className="grid gap-1">
      <TypographyP size="small" tone="subtle" className="font-medium">
        <FormattedMessage {...title} /> ({criteria.length})
      </TypographyP>
      <ul>
        {criteria.map((criterion) => (
          <CheckRow
            key={criterion.id}
            criterion={criterion}
            stats={summary.creditStats[criterion.id]}
            onViewFindings={onViewFindings}
          />
        ))}
      </ul>
    </section>
  );
}

function FindingItem({ finding }: { finding: LocalisationDeepAuditFindingRow }) {
  return (
    <li className="grid gap-1.5 border-b border-border py-3 last:border-b-0">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={severityVariant(finding.severity)}>
          <FormattedMessage {...severityMessage(finding.severity)} />
        </Badge>
        {finding.diffState === "new" ? (
          <Badge variant="secondary">
            <FormattedMessage {...messages.diffNew} />
          </Badge>
        ) : null}
        {finding.diffState === "fixed" ? (
          <Badge variant="success">
            <FormattedMessage {...messages.diffFixed} />
          </Badge>
        ) : null}
        <TypographyP size="small" className="font-medium">
          {finding.title}
        </TypographyP>
      </div>
      <TypographyP size="small" tone="subtle">
        {finding.summary}
      </TypographyP>
      {finding.url ? (
        <a
          href={finding.url}
          target="_blank"
          rel="noreferrer"
          className="truncate text-sm text-primary underline-offset-4 hover:underline"
        >
          {finding.url}
        </a>
      ) : null}
      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        {finding.templateKey ? <span className="font-mono">{finding.templateKey}</span> : null}
        {finding.locale ? <span className="font-mono">{finding.locale}</span> : null}
        {finding.location ? <span>{finding.location}</span> : null}
      </div>
      {finding.evidence ? (
        <TypographyP size="small" tone="subtle">
          <FormattedMessage {...messages.evidenceLabel} />: {finding.evidence}
        </TypographyP>
      ) : null}
      {finding.advice ? (
        <TypographyP size="small">
          <FormattedMessage {...messages.adviceLabel} />: {finding.advice}
        </TypographyP>
      ) : null}
    </li>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: MessageDescriptor;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  const intl = useIntl();
  const items = [{ value: ALL, label: intl.formatMessage(messages.filterAll) }, ...options];
  return (
    <Field className="w-full sm:w-44">
      <FieldLabel>
        <FormattedMessage {...label} />
      </FieldLabel>
      <Select
        value={value}
        items={items}
        onValueChange={(next) => {
          if (typeof next === "string") onChange(next);
        }}
      >
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {items.map((item) => (
              <SelectItem key={item.value} value={item.value} label={item.label}>
                {item.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  );
}

/**
 * Checks and findings for one succeeded deep audit run. The run summary comes
 * from the list; findings are paged from go-svc with server-side filters.
 */
export function DomainAuditFindings({
  organizationSlug,
  linkedDomainId,
  run,
}: {
  organizationSlug: string;
  linkedDomainId: string;
  run: LocalisationDeepAuditRun;
}) {
  const intl = useIntl();
  const [creditId, setCreditId] = useState<string | null>(null);
  const [severity, setSeverity] = useState<FilterSeverity | typeof ALL>(ALL);
  const [templateKey, setTemplateKey] = useState<string>(ALL);
  const [locale, setLocale] = useState<string>(ALL);
  const [diff, setDiff] = useState<DiffTab>("all");
  const [offset, setOffset] = useState(0);

  const query: LocalisationDeepAuditFindingQuery = {
    creditId: creditId ?? undefined,
    severity: severity === ALL ? undefined : severity,
    templateKey: templateKey === ALL ? undefined : templateKey,
    locale: locale === ALL ? undefined : locale,
    diff: diff === "all" ? undefined : diff,
    limit: FINDINGS_PAGE_SIZE,
    offset,
  };
  const detail = useDomainDeepAuditDetail({
    organizationSlug,
    linkedDomainId,
    runId: run.id,
    query,
  });

  const summary = detail.data?.deepAudit.summary ?? null;
  if (detail.isPending) {
    return <Spinner />;
  }
  if (detail.isError || !summary) {
    return (
      <TypographyP size="small" tone="subtle">
        <FormattedMessage {...messages.loadError} />
      </TypographyP>
    );
  }

  const criteria = buildLocalisationAuditCriteria(summary.credits, [], {
    methodologyVersion: LOCALISATION_AUDIT_METHODOLOGY_VERSION,
  });
  const groups = groupLocalisationAuditCriteria(criteria);
  const selectedCheck = creditId ? criteria.find((criterion) => criterion.id === creditId) : null;
  const findings = detail.data.findings;
  const total = detail.data.findingsTotal;

  const resetPage =
    <T,>(setter: (value: T) => void) =>
    (value: T) => {
      setter(value);
      setOffset(0);
    };
  const viewFindings = (id: string) => {
    setCreditId(id);
    setDiff("all");
    setOffset(0);
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(18rem,2fr)_3fr]">
      <Card size="sm" className="rounded-lg border border-border bg-card py-0 ring-0">
        <CardContent className="grid gap-4 p-4">
          <TypographyH2 className="text-base">
            <FormattedMessage {...messages.checksTitle} />
          </TypographyH2>
          <CheckGroup
            title={messages.groupFailed}
            criteria={groups.failed}
            summary={summary}
            onViewFindings={viewFindings}
          />
          <CheckGroup
            title={messages.groupWatch}
            criteria={groups.watch}
            summary={summary}
            onViewFindings={viewFindings}
          />
          <CheckGroup
            title={messages.groupAiAssessed}
            criteria={groups.aiAssessed}
            summary={summary}
            onViewFindings={viewFindings}
          />
          <CheckGroup
            title={messages.groupPassed}
            criteria={groups.passed}
            summary={summary}
            onViewFindings={viewFindings}
          />
          <CheckGroup
            title={messages.groupNotApplicable}
            criteria={groups.notApplicable}
            summary={summary}
            onViewFindings={viewFindings}
          />
        </CardContent>
      </Card>

      <Card size="sm" className="rounded-lg border border-border bg-card py-0 ring-0">
        <CardContent className="grid gap-4 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <TypographyH2 className="text-base">
              <FormattedMessage {...messages.findingsTitle} />
            </TypographyH2>
            <TypographyP size="small" tone="subtle">
              <FormattedMessage {...messages.findingsCount} values={{ count: total }} />
            </TypographyP>
          </div>

          {run.previousRunId ? (
            <Tabs
              value={diff}
              onValueChange={(value) => {
                if (isDiffTab(value)) resetPage(setDiff)(value);
              }}
            >
              <TabsList>
                {DIFF_TABS.map((tab) => (
                  <TabsTrigger key={tab} value={tab}>
                    <FormattedMessage {...diffTabMessage(tab)} />
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <FilterSelect
              label={messages.filterSeverity}
              value={severity}
              options={SEVERITIES.map((value) => ({
                value,
                label: intl.formatMessage(severityMessage(value)),
              }))}
              onChange={resetPage((value: string) =>
                setSeverity(value as FilterSeverity | typeof ALL),
              )}
            />
            <FilterSelect
              label={messages.filterTemplate}
              value={templateKey}
              options={summary.templates.map((template) => ({
                value: template.key,
                label: template.key,
              }))}
              onChange={resetPage(setTemplateKey)}
            />
            <FilterSelect
              label={messages.filterLocale}
              value={locale}
              options={summary.detectedLocales.map((entry) => ({
                value: entry.locale,
                label: entry.locale,
              }))}
              onChange={resetPage(setLocale)}
            />
          </div>

          {selectedCheck ? (
            <div className="flex flex-wrap items-center gap-2">
              <TypographyP size="small">
                <FormattedMessage
                  {...messages.filterCheck}
                  values={{ title: selectedCheck.title }}
                />
              </TypographyP>
              <Button size="sm" variant="ghost" onClick={() => resetPage(setCreditId)(null)}>
                <FormattedMessage {...messages.clearCheck} />
              </Button>
            </div>
          ) : null}

          {findings.length === 0 ? (
            <TypographyP size="small" tone="subtle">
              <FormattedMessage {...messages.noFindings} />
            </TypographyP>
          ) : (
            <ul className={detail.isPlaceholderData ? "opacity-60" : undefined}>
              {findings.map((finding) => (
                <FindingItem key={finding.id} finding={finding} />
              ))}
            </ul>
          )}

          {total > FINDINGS_PAGE_SIZE ? (
            <div className="flex items-center justify-between gap-3">
              <TypographyP size="small" tone="subtle">
                <FormattedMessage
                  {...messages.pageRange}
                  values={{
                    from: offset + 1,
                    to: Math.min(offset + FINDINGS_PAGE_SIZE, total),
                    total,
                  }}
                />
              </TypographyP>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - FINDINGS_PAGE_SIZE))}
                >
                  <FormattedMessage {...messages.previousPage} />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={offset + FINDINGS_PAGE_SIZE >= total}
                  onClick={() => setOffset(offset + FINDINGS_PAGE_SIZE)}
                >
                  <FormattedMessage {...messages.nextPage} />
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
