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
import { useEffect, useId, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { observer } from "mobx-react-lite";
import { useSearchParams } from "next/navigation";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TypographyH2, TypographyP } from "@/components/ui/typography";
import {
  GSC_DATE_RANGES,
  GSC_DEFAULT_DATE_RANGE,
  isGscDateRange,
  type GscDateRange,
} from "@/lib/gsc/constants";
import type {
  GscInspection,
  GscPageRow,
  GscPerformanceSnapshot,
  GscQueryRow,
} from "@/lib/gsc/types";
import { cn } from "@/lib/primitives/cn";

import { useDomainResearchShellStore } from "../store/domains-store-context";
import { DomainMetricCard } from "./domain-metric-card";
import { DomainResearchEmpty } from "./domain-research-empty";
import { domainSearchConsoleViewMessages as messages } from "./domain-search-console-view.messages";
import { domainSearchConsoleQueryKey, useDomainSearchConsole } from "./use-domain-search-console";

const QUERY_GRID =
  "grid grid-cols-[minmax(12rem,1.6fr)_repeat(4,minmax(4.5rem,0.5fr))] items-center gap-3 px-3 py-2.5";

function dateRangeMessage(range: GscDateRange) {
  switch (range) {
    case "last_7_days":
      return messages.last7Days;
    case "last_28_days":
      return messages.last28Days;
    case "last_3_months":
      return messages.last3Months;
    case "last_6_months":
      return messages.last6Months;
    case "last_12_months":
      return messages.last12Months;
  }
}

function authorizeHref(organizationSlug: string, returnTo: string) {
  const params = new URLSearchParams({ returnTo });
  return `/api/orgs/${encodeURIComponent(organizationSlug)}/gsc-connections/authorize?${params}`;
}

function returnToPath(organizationSlug: string, linkedDomainId: string, localeId: string | null) {
  const params = new URLSearchParams();
  if (localeId) {
    params.set("locale", localeId);
  }
  const query = params.toString();
  return `/org/${organizationSlug}/domains/${encodeURIComponent(linkedDomainId)}/search-console${query ? `?${query}` : ""}`;
}

export const DomainSearchConsoleView = observer(function DomainSearchConsoleView({
  linkedDomainId,
  organizationSlug,
}: {
  linkedDomainId: string;
  organizationSlug: string;
}) {
  const intl = useIntl();
  const store = useDomainResearchShellStore();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const oauthError = searchParams.get("gscError");
  const dateRangeId = useId();
  const inspectId = useId();
  const [dateRange, setDateRange] = useState<GscDateRange>(GSC_DEFAULT_DATE_RANGE);
  const [tab, setTab] = useState<"queries" | "pages">("queries");
  const [inspectUrl, setInspectUrl] = useState("");
  const [inspecting, setInspecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [inspection, setInspection] = useState<GscInspection | null>(null);

  useEffect(() => {
    if (!oauthError) {
      return;
    }
    toast.error(intl.formatMessage(messages.connectError));
  }, [intl, oauthError]);

  const domain = store.domain;
  const localeId = store.localeId;
  const searchConsole = useDomainSearchConsole({
    organizationSlug,
    linkedDomainId,
    domainKey: domain?.domainKey ?? null,
    localeId,
    dateRange,
  });

  if (!domain) {
    return null;
  }

  const snapshot = searchConsole.data;
  const canMutate = searchConsole.live && snapshot?.status !== "sample";

  async function disconnect() {
    setDisconnecting(true);
    try {
      const response = await fetch(
        `/api/orgs/${encodeURIComponent(organizationSlug)}/gsc-connections`,
        { method: "DELETE" },
      );
      if (!response.ok && response.status !== 404) {
        toast.error(intl.formatMessage(messages.disconnectError));
        return;
      }
      await queryClient.invalidateQueries({
        queryKey: domainSearchConsoleQueryKey(
          organizationSlug,
          linkedDomainId,
          localeId,
          dateRange,
        ),
      });
      setInspection(null);
      toast.success(intl.formatMessage(messages.disconnectSuccess));
    } finally {
      setDisconnecting(false);
    }
  }

  async function inspect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canMutate || snapshot?.status !== "ready") {
      return;
    }
    setInspecting(true);
    try {
      const response = await fetch(
        `/api/orgs/${encodeURIComponent(organizationSlug)}/linked-domains/${encodeURIComponent(linkedDomainId)}/search-console/inspect`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: inspectUrl }),
        },
      );
      const body = (await response.json().catch(() => ({}))) as {
        inspection?: GscInspection;
        message?: string;
      };
      if (!response.ok || !body.inspection) {
        toast.error(body.message || intl.formatMessage(messages.inspectError));
        return;
      }
      setInspection(body.inspection);
    } finally {
      setInspecting(false);
    }
  }

  if (searchConsole.isPending) {
    return (
      <TypographyP size="small" tone="subtle">
        <FormattedMessage {...messages.loading} />
      </TypographyP>
    );
  }

  if (searchConsole.isError || !snapshot) {
    return (
      <TypographyP size="small" tone="subtle">
        <FormattedMessage {...messages.loadError} />
      </TypographyP>
    );
  }

  if (snapshot.status === "unconfigured") {
    return (
      <DomainResearchEmpty
        title={<FormattedMessage {...messages.unconfiguredTitle} />}
        description={<FormattedMessage {...messages.unconfiguredDescription} />}
      />
    );
  }

  if (snapshot.status === "disconnected") {
    return (
      <DomainResearchEmpty
        title={<FormattedMessage {...messages.connectTitle} />}
        description={<FormattedMessage {...messages.connectDescription} />}
        action={
          <Button
            size="sm"
            render={
              <a
                href={authorizeHref(
                  organizationSlug,
                  returnToPath(organizationSlug, linkedDomainId, localeId),
                )}
              />
            }
          >
            <FormattedMessage {...messages.connectCta} />
          </Button>
        }
      />
    );
  }

  if (snapshot.status === "no_property") {
    return (
      <div className="grid gap-4">
        <ConnectionBar
          email={snapshot.connection?.accountEmail}
          disconnecting={disconnecting}
          onDisconnect={() => {
            void disconnect();
          }}
        />
        <DomainResearchEmpty
          title={<FormattedMessage {...messages.noPropertyTitle} />}
          description={
            <FormattedMessage
              {...messages.noPropertyDescription}
              values={{
                email: snapshot.connection?.accountEmail ?? "Google",
                domain: domain.domainKey,
              }}
            />
          }
        />
      </div>
    );
  }

  const dateRangeItems = GSC_DATE_RANGES.map((range) => ({
    value: range,
    label: intl.formatMessage(dateRangeMessage(range)),
  }));

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Field className="w-full sm:w-72">
          <FieldLabel htmlFor={dateRangeId}>
            <FormattedMessage {...messages.dateRangeLabel} />
          </FieldLabel>
          <Select
            value={dateRange}
            items={dateRangeItems}
            onValueChange={(value) => {
              if (value && isGscDateRange(value)) {
                setDateRange(value);
              }
            }}
          >
            <SelectTrigger id={dateRangeId} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {dateRangeItems.map((item) => (
                  <SelectItem key={item.value} value={item.value} label={item.label}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <ConnectionBar
          email={snapshot.connection?.accountEmail}
          disconnecting={disconnecting}
          onDisconnect={
            canMutate
              ? () => {
                  void disconnect();
                }
              : undefined
          }
        />
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <DomainMetricCard
          label={intl.formatMessage(messages.clicks)}
          value={intl.formatNumber(snapshot.totals.clicks)}
          history={snapshot.series.map((point) => ({ date: point.date, value: point.clicks }))}
        />
        <DomainMetricCard
          label={intl.formatMessage(messages.impressions)}
          value={intl.formatNumber(snapshot.totals.impressions)}
          history={snapshot.series.map((point) => ({
            date: point.date,
            value: point.impressions,
          }))}
        />
        <DomainMetricCard
          label={intl.formatMessage(messages.ctr)}
          value={intl.formatNumber(snapshot.totals.ctr, {
            style: "percent",
            maximumFractionDigits: 2,
          })}
          history={snapshot.series.map((point) => ({ date: point.date, value: point.ctr }))}
        />
        <DomainMetricCard
          label={intl.formatMessage(messages.position)}
          value={intl.formatNumber(snapshot.totals.position, { maximumFractionDigits: 1 })}
          history={snapshot.series.map((point) => ({
            date: point.date,
            value: -point.position,
          }))}
        />
      </section>

      <TypographyP size="small" tone="subtle">
        {snapshot.status === "sample" ? (
          <FormattedMessage {...messages.sampleData} />
        ) : (
          <FormattedMessage
            {...messages.liveData}
            values={{ property: snapshot.siteUrl ?? domain.domainKey }}
          />
        )}
      </TypographyP>

      <SearchConsoleTables snapshot={snapshot} tab={tab} onTabChange={setTab} />

      {snapshot.status === "ready" ? (
        <section className="grid gap-3">
          <TypographyH2 className="pb-0" size="xlarge">
            <FormattedMessage {...messages.inspectHeading} />
          </TypographyH2>
          <TypographyP size="small" tone="subtle">
            <FormattedMessage {...messages.inspectDescription} />
          </TypographyP>
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(event) => void inspect(event)}
          >
            <Field className="min-w-[16rem] flex-1">
              <FieldLabel htmlFor={inspectId}>
                <FormattedMessage {...messages.inspectLabel} />
              </FieldLabel>
              <Input
                id={inspectId}
                type="url"
                required
                value={inspectUrl}
                placeholder={`https://${domain.domainKey}/`}
                onChange={(event) => setInspectUrl(event.currentTarget.value)}
              />
            </Field>
            <Button size="sm" type="submit" disabled={inspecting || inspectUrl.trim() === ""}>
              {inspecting ? <Spinner className="size-3.5" /> : null}
              <FormattedMessage {...messages.inspectCta} />
            </Button>
          </form>
          {inspection ? <InspectionResult inspection={inspection} /> : null}
        </section>
      ) : null}
    </div>
  );
});

function ConnectionBar({
  email,
  disconnecting,
  onDisconnect,
}: {
  email?: string;
  disconnecting: boolean;
  onDisconnect?: () => void;
}) {
  if (!email && !onDisconnect) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {email ? (
        <TypographyP size="small" tone="subtle">
          <FormattedMessage {...messages.connectedAs} values={{ email }} />
        </TypographyP>
      ) : null}
      {onDisconnect ? (
        <Button size="sm" variant="outline" disabled={disconnecting} onClick={onDisconnect}>
          {disconnecting ? <Spinner className="size-3.5" /> : null}
          <FormattedMessage {...messages.disconnectCta} />
        </Button>
      ) : null}
    </div>
  );
}

function SearchConsoleTables({
  snapshot,
  tab,
  onTabChange,
}: {
  snapshot: GscPerformanceSnapshot;
  tab: "queries" | "pages";
  onTabChange: (tab: "queries" | "pages") => void;
}) {
  const rows = tab === "queries" ? snapshot.queries : snapshot.pages;

  return (
    <div className="grid gap-4">
      <Tabs
        value={tab}
        onValueChange={(value) => {
          if (value === "queries" || value === "pages") {
            onTabChange(value);
          }
        }}
      >
        <TabsList>
          <TabsTrigger value="queries">
            <FormattedMessage {...messages.queriesTab} />
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
              <FormattedMessage {...messages.emptyQueries} />
            )
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <div
            className={cn(
              QUERY_GRID,
              "border-b border-border bg-muted/40 text-xs font-medium text-muted-foreground",
            )}
          >
            <span>
              {tab === "pages" ? (
                <FormattedMessage {...messages.columnPage} />
              ) : (
                <FormattedMessage {...messages.columnQuery} />
              )}
            </span>
            <span className="text-end">
              <FormattedMessage {...messages.clicks} />
            </span>
            <span className="text-end">
              <FormattedMessage {...messages.impressions} />
            </span>
            <span className="text-end">
              <FormattedMessage {...messages.ctr} />
            </span>
            <span className="text-end">
              <FormattedMessage {...messages.position} />
            </span>
          </div>
          <div className="divide-y divide-border">
            {tab === "queries"
              ? snapshot.queries.map((row) => <SearchConsoleQueryRow key={row.query} row={row} />)
              : snapshot.pages.map((row) => <SearchConsolePageRow key={row.page} row={row} />)}
          </div>
        </div>
      )}
    </div>
  );
}

function SearchConsoleQueryRow({ row }: { row: GscQueryRow }) {
  return (
    <div className={QUERY_GRID}>
      <span className="truncate font-medium">{row.query}</span>
      <SearchConsoleMetricCells
        clicks={row.clicks}
        impressions={row.impressions}
        ctr={row.ctr}
        position={row.position}
      />
    </div>
  );
}

function SearchConsolePageRow({ row }: { row: GscPageRow }) {
  return (
    <div className={QUERY_GRID}>
      <span className="truncate font-mono text-sm">{row.page}</span>
      <SearchConsoleMetricCells
        clicks={row.clicks}
        impressions={row.impressions}
        ctr={row.ctr}
        position={row.position}
      />
    </div>
  );
}

function SearchConsoleMetricCells({
  clicks,
  impressions,
  ctr,
  position,
}: {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}) {
  const intl = useIntl();
  return (
    <>
      <span className="text-end tabular-nums text-sm text-muted-foreground">
        {intl.formatNumber(clicks)}
      </span>
      <span className="text-end tabular-nums text-sm text-muted-foreground">
        {intl.formatNumber(impressions)}
      </span>
      <span className="text-end tabular-nums text-sm text-muted-foreground">
        {intl.formatNumber(ctr, { style: "percent", maximumFractionDigits: 2 })}
      </span>
      <span className="text-end tabular-nums text-sm text-muted-foreground">
        {intl.formatNumber(position, { maximumFractionDigits: 1 })}
      </span>
    </>
  );
}

function InspectionResult({ inspection }: { inspection: GscInspection }) {
  const intl = useIntl();
  const status = inspection.indexStatusResult;
  const items = [
    status?.verdict
      ? { label: intl.formatMessage(messages.inspectVerdict), value: status.verdict }
      : null,
    status?.coverageState
      ? { label: intl.formatMessage(messages.inspectCoverage), value: status.coverageState }
      : null,
    status?.indexingState
      ? { label: intl.formatMessage(messages.inspectIndexing), value: status.indexingState }
      : null,
    status?.lastCrawlTime
      ? {
          label: intl.formatMessage(messages.inspectCrawl),
          value: intl.formatDate(new Date(status.lastCrawlTime), {
            dateStyle: "medium",
            timeStyle: "short",
          }),
        }
      : null,
    status?.googleCanonical
      ? { label: intl.formatMessage(messages.inspectCanonical), value: status.googleCanonical }
      : null,
  ].filter((item): item is { label: string; value: string } => item !== null);

  return (
    <Card size="sm" className="rounded-lg border border-border bg-card py-0 ring-0">
      <CardContent className="grid gap-3 p-4">
        {items.map((item) => (
          <div key={item.label} className="grid gap-1 sm:grid-cols-[10rem_1fr] sm:items-baseline">
            <TypographyP size="small" tone="subtle">
              {item.label}
            </TypographyP>
            <p className="truncate text-sm">{item.value}</p>
          </div>
        ))}
        {inspection.inspectionResultLink ? (
          <a
            href={inspection.inspectionResultLink}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-foreground underline underline-offset-4"
          >
            <FormattedMessage {...messages.inspectOpen} />
          </a>
        ) : null}
      </CardContent>
    </Card>
  );
}
