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
import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useIntl } from "react-intl";
import { toast } from "sonner";

import { readApiResponseError } from "@/lib/api-error";
import { createApiClient } from "@/lib/api-client";
import { useAppShellStore } from "@/components/app-shell/store/app-shell-store-context";
import { WORKSPACE_FEATURE_UNAVAILABLE_REASON } from "@/lib/flags/workos-flag-entities";
import type { WorkspaceOverviewSnapshot } from "@/lib/workspace/overview-snapshot-model";

import { dashboardPageContentMessages } from "./dashboard-page-content.messages";
import { DashboardPageView } from "./dashboard-page-view";
import { SlackConnectInviteBanner } from "./slack-connect-invite-banner";

const api = createApiClient();

const EMPTY_OVERVIEW: WorkspaceOverviewSnapshot = {
  metrics: {
    jobs: { count: 0, series: [0, 0, 0, 0, 0, 0, 0] },
    translations: { count: 0, series: [0, 0, 0, 0, 0, 0, 0] },
    automations: { total: 0, paused: 0 },
    issues: { open: 0, p1: 0 },
  },
  activity: [],
  projects: [],
  board: [],
  automations: [],
};

async function fetchWorkspaceOverview(
  organizationSlug: string,
): Promise<WorkspaceOverviewSnapshot> {
  const response = await api.api.orgs[":organizationSlug"].overview.$get({
    param: { organizationSlug },
  });

  if (!response.ok) {
    throw await readApiResponseError(response, "Failed to load workspace overview");
  }

  const body = await response.json();
  return body.overview;
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

  const overviewQuery = useQuery({
    queryKey: ["workspace-overview", organizationSlug],
    queryFn: () => fetchWorkspaceOverview(organizationSlug),
  });

  return (
    <DashboardPageView
      organizationSlug={organizationSlug}
      overview={overviewQuery.data ?? EMPTY_OVERVIEW}
      automationsEnabled={automationsEnabled}
      isLoading={overviewQuery.isLoading}
      isError={overviewQuery.isError}
      onNewRequest={() => chatDock.openNewTab()}
      slackConnectCard={<SlackConnectInviteBanner organizationSlug={organizationSlug} />}
      renderLink={({ href, className, children, onClick }) => (
        <Link href={href} className={className} onClick={onClick}>
          {children}
        </Link>
      )}
    />
  );
}
