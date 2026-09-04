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
import { useMemo, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";

import { type V1ActivityEventType } from "@/lib/activity-log/activity-log-contract";
import { apiClient } from "@/lib/api-client-instance";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Rows } from "@/components/ui/layout/rows";
import { TypographyP } from "@/components/ui/typography";

import { ActivityLogEventTypeFilter } from "./activity-log-event-type-filter";
import { ActivityLogList, type ActivityLogItem } from "./activity-log-list";
import { activityLogsPageContentMessages as messages } from "./activity-logs-page-content.messages";
import { SettingsPageBody, SettingsPageHeader } from "./settings-page-chrome";

type ActivityLogResponse = {
  activityLogs: ActivityLogItem[];
  nextCursor: string | null;
};

const activityLogsQueryKey = (
  organizationSlug: string,
  eventTypes: V1ActivityEventType[],
  actor: string,
  range: string,
) => ["activity-logs", organizationSlug, eventTypes, actor, range] as const;

export function ActivityLogsPageContent({ organizationSlug }: { organizationSlug: string }) {
  const intl = useIntl();
  const [eventTypes, setEventTypes] = useState<V1ActivityEventType[]>([]);
  const [actor, setActor] = useState("");
  const [range, setRange] = useState<"24h" | "7d" | "30d" | "all">("all");
  const [now] = useState(() => Date.now());

  const activityQuery = useInfiniteQuery({
    queryKey: activityLogsQueryKey(organizationSlug, eventTypes, actor, range),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const response = await apiClient.api.orgs[":organizationSlug"]["activity-logs"].$get({
        param: { organizationSlug },
        query: {
          actor: actor || undefined,
          cursor: pageParam,
          eventTypes: eventTypes.length ? eventTypes : [],
          limit: "50",
          range,
        },
      });
      if (!response.ok) {
        throw new Error(intl.formatMessage(messages.loadErrorFallback));
      }
      return (await response.json()) as ActivityLogResponse;
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });

  const activityLogs = useMemo(
    () => activityQuery.data?.pages.flatMap((page) => page.activityLogs) ?? [],
    [activityQuery.data?.pages],
  );

  const actorOptions = useMemo(() => {
    const options = new Map<string, string>();
    for (const item of activityLogs) {
      if (item.actor.userId) options.set(`user:${item.actor.userId}`, item.actor.displayName);
    }
    return [...options.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [activityLogs]);

  const clearFilters = () => {
    setEventTypes([]);
    setActor("");
    setRange("all");
  };

  return (
    <SettingsPageBody width="wide">
      <Rows spacing="4u">
        <SettingsPageHeader
          eyebrow={intl.formatMessage(messages.pageLabel)}
          title={intl.formatMessage(messages.pageTitle)}
          description={intl.formatMessage(messages.pageDescription)}
        />

        <Card size="sm">
          <CardContent>
            <FieldGroup className="grid gap-4 md:grid-cols-[minmax(14rem,1.2fr)_minmax(10rem,0.8fr)_minmax(10rem,0.8fr)]">
              <Field>
                <FieldLabel>
                  <FormattedMessage {...messages.eventTypeLabel} />
                </FieldLabel>
                <ActivityLogEventTypeFilter value={eventTypes} onChange={setEventTypes} />
                <FieldDescription>
                  <FormattedMessage {...messages.eventTypeHint} />
                </FieldDescription>
              </Field>

              <Field>
                <FieldLabel htmlFor="activity-actor">
                  <FormattedMessage {...messages.actorLabel} />
                </FieldLabel>
                <select
                  id="activity-actor"
                  value={actor}
                  onChange={(event) => setActor(event.target.value)}
                  className="h-9 w-full rounded-lg border border-input bg-input/30 px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <option value="">{intl.formatMessage(messages.allActors)}</option>
                  <option value="system">{intl.formatMessage(messages.systemActor)}</option>
                  <option value="agent">{intl.formatMessage(messages.agentActor)}</option>
                  <option value="api_key">{intl.formatMessage(messages.apiKeyActor)}</option>
                  {actorOptions.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>

              <Field>
                <FieldLabel htmlFor="activity-range">
                  <FormattedMessage {...messages.rangeLabel} />
                </FieldLabel>
                <select
                  id="activity-range"
                  value={range}
                  onChange={(event) => setRange(event.target.value as typeof range)}
                  className="h-9 w-full rounded-lg border border-input bg-input/30 px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <option value="24h">{intl.formatMessage(messages.range24h)}</option>
                  <option value="7d">{intl.formatMessage(messages.range7d)}</option>
                  <option value="30d">{intl.formatMessage(messages.range30d)}</option>
                  <option value="all">{intl.formatMessage(messages.rangeAll)}</option>
                </select>
              </Field>
            </FieldGroup>
            {eventTypes.length || actor || range !== "all" ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-4"
                onClick={clearFilters}
              >
                <FormattedMessage {...messages.clearFilters} />
              </Button>
            ) : null}
          </CardContent>
        </Card>

        <section aria-label={intl.formatMessage(messages.activityListLabel)}>
          {activityQuery.isLoading ? (
            <TypographyP size="small" tone="subtle">
              <FormattedMessage {...messages.loading} />
            </TypographyP>
          ) : activityQuery.isError ? (
            <Rows spacing="1u">
              <TypographyP size="small" weight="medium" tone="critical">
                <FormattedMessage {...messages.loadErrorTitle} />
              </TypographyP>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => activityQuery.refetch()}
              >
                <FormattedMessage {...messages.retry} />
              </Button>
            </Rows>
          ) : activityLogs.length === 0 ? (
            <Rows spacing="1u">
              <TypographyP size="small" weight="medium" tone="content">
                <FormattedMessage {...messages.emptyTitle} />
              </TypographyP>
              <TypographyP size="small" tone="subtle">
                <FormattedMessage {...messages.emptyDescription} />
              </TypographyP>
            </Rows>
          ) : (
            <ActivityLogList activityLogs={activityLogs} now={now} />
          )}
        </section>

        {activityQuery.hasNextPage ? (
          <div className="flex justify-center">
            <Button
              type="button"
              variant="outline"
              onClick={() => activityQuery.fetchNextPage()}
              disabled={activityQuery.isFetchingNextPage}
            >
              <FormattedMessage {...messages.loadMore} />
            </Button>
          </div>
        ) : null}
      </Rows>
    </SettingsPageBody>
  );
}
