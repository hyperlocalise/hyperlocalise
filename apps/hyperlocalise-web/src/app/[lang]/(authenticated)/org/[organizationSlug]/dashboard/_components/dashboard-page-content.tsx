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
import Link from "next/link";
import { useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useIntl } from "react-intl";
import { toast } from "sonner";

import { useAppShellStore } from "@/components/app-shell/store/app-shell-store-context";
import { QaAttentionCard } from "@/components/qa/qa-attention-card";
import { WORKSPACE_FEATURE_UNAVAILABLE_REASON } from "@/lib/flags/workos-flag-entities";
import { goSvcErrorMessage } from "@/lib/go-svc/go-svc-error";
import { useGoSvcClient } from "@/lib/go-svc/use-go-svc-client";
import {
  OVERVIEW_PROJECT_LIMIT,
  mergeOverviewProjectsWithLive,
  type OverviewLiveProjectSource,
  type WorkspaceOverviewSnapshot,
} from "@/lib/workspace/overview-snapshot-model";

import { useTmsLiveProjects } from "../../_hooks/use-tms-live-projects";
import { dashboardPageContentMessages } from "./dashboard-page-content.messages";
import { DashboardPageView } from "./dashboard-page-view";
import { SlackConnectInviteBanner } from "./slack-connect-invite-banner";

const EMPTY_OVERVIEW: WorkspaceOverviewSnapshot = {
  metrics: {
    jobs: { count: 0, series: [0, 0, 0, 0, 0, 0, 0] },
    translations: { count: 0, series: [0, 0, 0, 0, 0, 0, 0] },
    automations: null,
    issues: { open: 0, p1: 0 },
  },
  activity: [],
  projects: [],
  board: [],
  automations: [],
};

const EMPTY_LIVE_PROJECTS: OverviewLiveProjectSource[] = [];

const overviewSectionQueryKey = (organizationSlug: string, section: string) =>
  ["workspace-overview", organizationSlug, section] as const;

function overviewQueryError(error: unknown): Error {
  return new Error(goSvcErrorMessage(error, "Failed to load workspace overview"), { cause: error });
}

export function DashboardPageContent({
  organizationSlug,
  automationsEnabled = false,
}: {
  organizationSlug: string;
  automationsEnabled?: boolean;
}) {
  const intl = useIntl();
  const searchParams = useSearchParams();
  const { chatDock } = useAppShellStore();
  const { client: goSvcClient } = useGoSvcClient();
  const handledFeatureUnavailableRef = useRef(false);

  useEffect(() => {
    if (
      searchParams.get("reason") !== WORKSPACE_FEATURE_UNAVAILABLE_REASON ||
      handledFeatureUnavailableRef.current
    ) {
      return;
    }

    handledFeatureUnavailableRef.current = true;

    const url = new URL(window.location.href);
    url.searchParams.delete("reason");
    window.history.replaceState(null, "", url.toString());

    toast.error(intl.formatMessage(dashboardPageContentMessages.featureUnavailable));
  }, [intl, searchParams]);

  const metricsQuery = useQuery({
    queryKey: overviewSectionQueryKey(organizationSlug, "metrics"),
    queryFn: async () => {
      try {
        const body = await goSvcClient.overview.metrics(organizationSlug);
        return body.metrics;
      } catch (error) {
        throw overviewQueryError(error);
      }
    },
  });

  const activityQuery = useQuery({
    queryKey: overviewSectionQueryKey(organizationSlug, "activity"),
    queryFn: async () => {
      try {
        const body = await goSvcClient.overview.activity(organizationSlug);
        return body.activity;
      } catch (error) {
        throw overviewQueryError(error);
      }
    },
  });

  const liveProjectsQuery = useTmsLiveProjects(organizationSlug);
  const liveProjects = liveProjectsQuery.data ?? EMPTY_LIVE_PROJECTS;
  const livePreviewIds = liveProjects.slice(0, OVERVIEW_PROJECT_LIMIT).map((project) => project.id);

  const storedProjectsQuery = useQuery({
    queryKey: [...overviewSectionQueryKey(organizationSlug, "projects"), livePreviewIds],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      try {
        const body = await goSvcClient.overview.projects(
          organizationSlug,
          livePreviewIds.length > 0 ? { query: { id: livePreviewIds } } : {},
        );
        return body.projects;
      } catch (error) {
        throw overviewQueryError(error);
      }
    },
  });

  const boardQuery = useQuery({
    queryKey: overviewSectionQueryKey(organizationSlug, "board"),
    queryFn: async () => {
      try {
        const body = await goSvcClient.overview.board(organizationSlug);
        return body.board;
      } catch (error) {
        throw overviewQueryError(error);
      }
    },
  });

  const automationsQuery = useQuery({
    queryKey: overviewSectionQueryKey(organizationSlug, "automations"),
    enabled: automationsEnabled,
    queryFn: async () => {
      try {
        const body = await goSvcClient.overview.automations(organizationSlug);
        return body.automations;
      } catch (error) {
        throw overviewQueryError(error);
      }
    },
  });

  const storedProjects = storedProjectsQuery.data ?? EMPTY_OVERVIEW.projects;
  const projects = useMemo(
    () =>
      mergeOverviewProjectsWithLive({
        organizationSlug,
        stored: storedProjects,
        live: liveProjects,
      }),
    [liveProjects, organizationSlug, storedProjects],
  );

  const overview = useMemo(
    () => ({
      metrics: metricsQuery.data ?? EMPTY_OVERVIEW.metrics,
      activity: activityQuery.data ?? EMPTY_OVERVIEW.activity,
      projects,
      board: boardQuery.data ?? EMPTY_OVERVIEW.board,
      automations: automationsQuery.data ?? EMPTY_OVERVIEW.automations,
    }),
    [activityQuery.data, automationsQuery.data, boardQuery.data, metricsQuery.data, projects],
  );

  return (
    <DashboardPageView
      organizationSlug={organizationSlug}
      overview={overview}
      automationsEnabled={automationsEnabled}
      sectionStatus={{
        metrics: {
          isLoading: metricsQuery.isLoading,
          isError: metricsQuery.isError && metricsQuery.data === undefined,
        },
        activity: { isLoading: activityQuery.isLoading, isError: activityQuery.isError },
        projects: {
          isLoading:
            (storedProjectsQuery.isLoading ||
              (storedProjectsQuery.isError && liveProjectsQuery.isFetching)) &&
            liveProjects.length === 0 &&
            storedProjects.length === 0,
          isError:
            storedProjectsQuery.isError &&
            liveProjects.length === 0 &&
            !liveProjectsQuery.isFetching,
        },
        board: { isLoading: boardQuery.isLoading, isError: boardQuery.isError },
        automations: {
          isLoading: automationsEnabled && automationsQuery.isLoading,
          isError: automationsEnabled && automationsQuery.isError,
        },
      }}
      onNewRequest={() => chatDock.openNewTab()}
      qaAttentionCard={<QaAttentionCard organizationSlug={organizationSlug} />}
      slackConnectCard={<SlackConnectInviteBanner organizationSlug={organizationSlug} />}
      renderLink={({ href, className, children, onClick }) => (
        <Link href={href} className={className} onClick={onClick}>
          {children}
        </Link>
      )}
    />
  );
}
