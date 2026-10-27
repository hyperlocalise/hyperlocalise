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

import { WarningCircleIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useState } from "react";
import { useIntl } from "react-intl";

import { buildProjectPath } from "@/components/app-shell/navigation-config";

import { Alert, AlertAction, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { ActivityTab } from "./activity-tab";
import { BudgetsTab } from "./budgets-tab";
import { CostEstimateTab } from "./cost-estimate-tab";
import { CostsTab } from "./costs-tab";
import { ManageRatesSheet } from "./manage-rates-sheet";
import { chosenRateCard, ReportsFilterBar } from "./reports-filter-bar";
import { reportsPageMessages as messages } from "./reports-page.messages";
import { useReportSettings } from "./reports-queries";
import { MEMBER_TABS, REPORTS_TABS, type ReportsTab } from "./reports-url-state";
import { TimeTab } from "./time-tab";
import { useReportsUrlState } from "./use-reports-url-state";
import { WordCountsTab } from "./word-counts-tab";

const TAB_LABELS = {
  activity: messages.tabActivity,
  words: messages.tabWords,
  time: messages.tabTime,
  costs: messages.tabCosts,
  estimate: messages.tabEstimate,
  budgets: messages.tabBudgets,
} satisfies Record<ReportsTab, unknown>;

/**
 * The Reports page, for the whole workspace or, with `projectId`, one project. Its tab, dates
 * and filters live in the URL. Tabs about money show only to roles that can see costs.
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
      <div className="flex w-full flex-col gap-4">
        <h1 className="sr-only">{intl.formatMessage(messages.title)}</h1>
        <Skeleton className="h-10 w-full max-w-xl rounded-lg" />
        <Skeleton className="h-[132px] w-full rounded-xl" />
        <Skeleton className="h-80 w-full rounded-xl" />
      </div>
    );
  if (settings.isError || !settings.data)
    return (
      <div className="flex w-full flex-col gap-4">
        <h1 className="sr-only">{intl.formatMessage(messages.title)}</h1>
        <Alert variant="destructive">
          <WarningCircleIcon />
          <AlertDescription>{intl.formatMessage(messages.loadFailed)}</AlertDescription>
          <AlertAction>
            <Button size="sm" variant="outline" onClick={() => void settings.refetch()}>
              {intl.formatMessage(messages.retry)}
            </Button>
          </AlertAction>
        </Alert>
      </div>
    );

  const data = settings.data;
  // Reports are for the roles that see what work costs; other members see only their own time.
  const tabs = data.financial ? REPORTS_TABS : MEMBER_TABS;
  const tab = tabs.includes(state.tab) ? state.tab : tabs[0];
  const effective = { ...state, tab, projectId: projectId ?? state.projectId };
  const input = { organizationSlug, state: effective, today: data.today };
  const rateCardName = chosenRateCard(effective, data);

  return (
    <div className="flex w-full flex-col gap-4">
      <h1 className="sr-only">{intl.formatMessage(messages.title)}</h1>
      <p className="text-[13px] text-muted-foreground">
        {data.startedAt
          ? intl.formatMessage(messages.startedOn, {
              date: intl.formatDate(data.startedAt, {
                day: "numeric",
                month: "short",
                year: "numeric",
                timeZone: "UTC",
              }),
            })
          : intl.formatMessage(messages.notStarted)}
      </p>
      {/* How recent the figures are, and where the project's state now is: not counted here. */}
      <p className="text-[13px] text-muted-foreground">
        {intl.formatMessage(messages.freshness)}
        {projectId ? (
          <>
            {" · "}
            <Link
              className="underline underline-offset-4"
              href={buildProjectPath(organizationSlug, projectId)}
            >
              {intl.formatMessage(messages.languagesLink)}
            </Link>
          </>
        ) : null}
      </p>
      {data.summary.pendingDays > 0 ? (
        <p className="text-[13px] text-muted-foreground">
          {intl.formatMessage(messages.summaryPending)}
        </p>
      ) : null}
      {!data.financial ? (
        <p className="text-[13px] text-muted-foreground">
          {intl.formatMessage(messages.ownTimeOnly)}
        </p>
      ) : null}
      <Tabs
        value={tab}
        onValueChange={(value) => update({ tab: String(value) as ReportsTab })}
        className="gap-4"
      >
        <TabsList variant="line" aria-label={intl.formatMessage(messages.tabsLabel)}>
          {tabs.map((value) => (
            <TabsTrigger key={value} value={value}>
              {intl.formatMessage(TAB_LABELS[value])}
            </TabsTrigger>
          ))}
        </TabsList>
        <ReportsFilterBar
          organizationSlug={organizationSlug}
          tab={tab}
          state={effective}
          settings={data}
          fixedProjectId={projectId}
          onChange={update}
          onOpenRates={() => setRatesOpen(true)}
        />
        <TabsContent value="time">
          <TimeTab input={input} settings={data} onChange={update} />
        </TabsContent>
        {data.financial ? (
          <>
            <TabsContent value="activity">
              <ActivityTab input={input} onChange={update} />
            </TabsContent>
            <TabsContent value="words">
              <WordCountsTab input={input} onChange={update} />
            </TabsContent>
            <TabsContent value="costs">
              <CostsTab input={input} settings={data} />
            </TabsContent>
            <TabsContent value="estimate">
              <CostEstimateTab input={input} rateCardName={rateCardName} onChange={update} />
            </TabsContent>
            <TabsContent value="budgets">
              <BudgetsTab
                organizationSlug={organizationSlug}
                settings={data}
                projectId={effective.projectId}
              />
            </TabsContent>
          </>
        ) : null}
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
