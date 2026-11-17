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
"use client";

import { InfoIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useState } from "react";
import { useIntl } from "react-intl";

import { buildProjectPath } from "@/components/app-shell/navigation-config";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { ActivityTab } from "./activity-tab";
import { AiUsageTab } from "./ai-usage-tab";
import { BudgetsTab } from "./budgets-tab";
import { ContributorsTab } from "./contributors-tab";
import { CostEstimateTab } from "./cost-estimate-tab";
import { CostsTab } from "./costs-tab";
import { ManageRatesSheet } from "./manage-rates-sheet";
import { ReportLoadFailed } from "./report-section";
import { chosenRateCard, ReportsFilterBar } from "./reports-filter-bar";
import { reportsPageMessages as messages } from "./reports-page.messages";
import { isRefusedRead, useReportSettings, type ReportSettings } from "./reports-queries";
import {
  MEMBER_TABS,
  REPORTS_TABS,
  reportsGroupOf,
  visibleReportsGroups,
  type ReportsGroup,
  type ReportsTab,
} from "./reports-url-state";
import { TimeTab } from "./time-tab";
import { useReportsUrlState } from "./use-reports-url-state";
import { WordCountsTab } from "./word-counts-tab";

const GROUP_LABELS = {
  overview: messages.groupOverview,
  output: messages.groupOutput,
  people: messages.groupPeople,
  money: messages.groupMoney,
} satisfies Record<ReportsGroup, unknown>;

const TAB_LABELS = {
  activity: messages.tabActivity,
  words: messages.tabWords,
  contributors: messages.tabContributors,
  time: messages.tabTime,
  ai: messages.tabAi,
  costs: messages.tabCosts,
  estimate: messages.tabEstimate,
  budgets: messages.tabBudgets,
} satisfies Record<ReportsTab, unknown>;

/**
 * The Reports page, for the whole workspace or, with `projectId`, one project. Its reports sit in
 * a few groups of tabs; the chosen report, dates and filters live in the URL. Reports about money
 * show only to roles that can see costs.
 */
export function ReportsPage({
  organizationSlug,
  projectId,
}: {
  organizationSlug: string;
  projectId?: string;
}) {
  const intl = useIntl();
  const { state, update } = useReportsUrlState();
  const settings = useReportSettings(organizationSlug);
  const [ratesOpen, setRatesOpen] = useState(false);

  if (settings.isPending)
    return (
      <div className="flex w-full flex-col gap-6">
        <h1 className="sr-only">{intl.formatMessage(messages.title)}</h1>
        <Skeleton className="h-9 w-full max-w-md rounded-lg" />
        <Skeleton className="h-9 w-full max-w-2xl rounded-lg" />
        <Skeleton className="h-[116px] w-full rounded-xl" />
        <Skeleton className="h-80 w-full rounded-xl" />
      </div>
    );
  // Settings that fail to reload keep the page and any open sheet, unless go-svc refused them.
  if (!settings.data || (settings.isError && isRefusedRead(settings.error)))
    return (
      <div className="flex w-full flex-col gap-4">
        <h1 className="sr-only">{intl.formatMessage(messages.title)}</h1>
        <ReportLoadFailed error={settings.error} retry={settings.refetch} />
      </div>
    );

  const data = settings.data;
  // Reports are for the roles that see what work costs; other members see only their own time.
  const tabs = data.financial ? REPORTS_TABS : MEMBER_TABS;
  const tab = tabs.includes(state.tab) ? state.tab : tabs[0];
  const groups = visibleReportsGroups(tabs);
  const effective = { ...state, tab, projectId: projectId ?? state.projectId };
  const input = {
    organizationSlug,
    state: effective,
    today: data.today,
    startedDay: data.startedDay,
  };
  const rateCardName = chosenRateCard(effective, data);

  const report = (value: ReportsTab) => {
    switch (value) {
      case "activity":
        return <ActivityTab input={input} onChange={update} />;
      case "words":
        return <WordCountsTab input={input} onChange={update} />;
      case "contributors":
        return <ContributorsTab input={input} onChange={update} />;
      case "time":
        return <TimeTab input={input} settings={data} onChange={update} />;
      case "ai":
        return <AiUsageTab input={input} onChange={update} />;
      case "costs":
        return <CostsTab input={input} />;
      case "estimate":
        return <CostEstimateTab input={input} rateCardName={rateCardName} onChange={update} />;
      case "budgets":
        return (
          <BudgetsTab
            organizationSlug={organizationSlug}
            settings={data}
            projectId={effective.projectId}
          />
        );
    }
  };

  return (
    <div className="flex w-full flex-col gap-6">
      <h1 className="sr-only">{intl.formatMessage(messages.title)}</h1>
      {settings.isError ? <ReportLoadFailed kept retry={settings.refetch} /> : null}
      <Tabs
        value={reportsGroupOf(tab)}
        onValueChange={(value) => {
          const next = groups.find((entry) => entry.group === value);
          if (next) update({ tab: next.tabs[0] });
        }}
        className="gap-6"
      >
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
            {/* One group needs no tabs of its own: its reports' tabs below are enough. */}
            {groups.length > 1 ? (
              <TabsList variant="line" aria-label={intl.formatMessage(messages.tabsLabel)}>
                {groups.map(({ group }) => (
                  <TabsTrigger key={group} value={group}>
                    {intl.formatMessage(GROUP_LABELS[group])}
                  </TabsTrigger>
                ))}
              </TabsList>
            ) : null}
            <ReportsStatus
              organizationSlug={organizationSlug}
              projectId={projectId}
              settings={data}
            />
          </div>
          {data.summary.pendingDays > 0 ? (
            <p className="text-xs text-muted-foreground">
              {intl.formatMessage(messages.summaryPending)}
            </p>
          ) : null}
          {!data.financial ? (
            <p className="text-xs text-muted-foreground">
              {intl.formatMessage(messages.ownTimeOnly)}
            </p>
          ) : null}
        </div>
        {groups.map(({ group, tabs: groupTabs }) => (
          <TabsContent key={group} value={group}>
            <Tabs
              value={tab}
              onValueChange={(value) => update({ tab: String(value) as ReportsTab })}
              className="gap-8"
            >
              <ReportsFilterBar
                organizationSlug={organizationSlug}
                tab={tab}
                state={effective}
                settings={data}
                fixedProjectId={projectId}
                onChange={update}
                onOpenRates={() => setRatesOpen(true)}
                leading={
                  groupTabs.length > 1 ? (
                    <TabsList aria-label={intl.formatMessage(messages.viewsLabel)}>
                      {groupTabs.map((value) => (
                        <TabsTrigger key={value} value={value} className="px-3">
                          {intl.formatMessage(TAB_LABELS[value])}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  ) : null
                }
              />
              {groupTabs.map((value) => (
                <TabsContent key={value} value={value}>
                  {report(value)}
                </TabsContent>
              ))}
            </Tabs>
          </TabsContent>
        ))}
      </Tabs>
      {ratesOpen ? (
        <ManageRatesSheet
          organizationSlug={organizationSlug}
          settings={data}
          cardName={rateCardName}
          onCardChange={(rateCard) => update({ rateCard })}
          onClose={() => setRatesOpen(false)}
        />
      ) : null}
    </div>
  );
}

/** When Reports began recording, with how the figures are counted behind an info button. */
function ReportsStatus({
  organizationSlug,
  projectId,
  settings,
}: {
  organizationSlug: string;
  projectId?: string;
  settings: ReportSettings;
}) {
  const intl = useIntl();
  return (
    <div className="flex items-center gap-1 text-xs text-muted-foreground">
      <span>
        {settings.startedAt
          ? intl.formatMessage(messages.recordingSince, {
              date: intl.formatDate(settings.startedAt, {
                day: "numeric",
                month: "short",
                year: "numeric",
                timeZone: "UTC",
              }),
            })
          : intl.formatMessage(messages.notRecording)}
      </span>
      <Popover>
        <PopoverTrigger
          render={
            <button
              type="button"
              aria-label={intl.formatMessage(messages.aboutFigures)}
              className="inline-flex size-6 items-center justify-center rounded-full text-subtle-foreground hover:bg-muted hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
            />
          }
        >
          <InfoIcon aria-hidden className="size-3.5" />
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 gap-2 text-[13px]">
          <p>{intl.formatMessage(messages.freshness)}</p>
          <p>{intl.formatMessage(messages.utcDays)}</p>
          {/* Where the project's state now is: not counted here. */}
          {projectId ? (
            <Link
              className="underline underline-offset-4"
              href={buildProjectPath(organizationSlug, projectId)}
            >
              {intl.formatMessage(messages.languagesLink)}
            </Link>
          ) : null}
        </PopoverContent>
      </Popover>
    </div>
  );
}
