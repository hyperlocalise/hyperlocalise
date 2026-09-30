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
import { useQuery } from "@tanstack/react-query";
import { useIntl } from "react-intl";

import { useGoSvcClient } from "@/lib/go-svc/use-go-svc-client";
import { useOrgRouter } from "@/lib/navigation/use-org-router";

import { BreadcrumbCrumbSelector } from "./breadcrumb-crumb-selector";
import { breadcrumbCrumbSelectorMessages as messages } from "./breadcrumb-crumb-selector.messages";
import { buildTeamPath } from "./navigation-config";

const organizationTeamsQueryKey = (organizationSlug: string) =>
  ["workspace-teams", organizationSlug, "breadcrumb"] as const;

type TeamBreadcrumbSelectorProps = {
  organizationSlug: string;
  teamId: string;
  teamName: string;
  isLast?: boolean;
};

export function TeamBreadcrumbSelector({
  organizationSlug,
  teamId,
  teamName,
  isLast = false,
}: TeamBreadcrumbSelectorProps) {
  const intl = useIntl();
  const router = useOrgRouter();
  const { client: goSvcClient } = useGoSvcClient();
  const teamsQuery = useQuery({
    queryKey: organizationTeamsQueryKey(organizationSlug),
    queryFn: async () => {
      const response = await goSvcClient.team.list(organizationSlug);
      return response.teams.map((team) => ({
        value: team.id,
        label: team.name,
      }));
    },
  });

  function handleSelect(nextTeamId: string) {
    if (nextTeamId === teamId) {
      return;
    }

    router.push(buildTeamPath(organizationSlug, nextTeamId));
  }

  return (
    <BreadcrumbCrumbSelector
      value={teamId}
      label={teamName}
      options={teamsQuery.data ?? []}
      onSelect={handleSelect}
      isLoading={teamsQuery.isPending}
      isError={teamsQuery.isError}
      menuLabel={intl.formatMessage(messages.switchTeam)}
      isLast={isLast}
    />
  );
}
