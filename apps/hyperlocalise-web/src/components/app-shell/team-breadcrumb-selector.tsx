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
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useIntl } from "react-intl";

import { apiClient } from "@/lib/api-client-instance";
import { readApiResponseError } from "@/lib/api-error";

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
  const router = useRouter();
  const teamsQuery = useQuery({
    queryKey: organizationTeamsQueryKey(organizationSlug),
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].teams.$get({
        param: { organizationSlug },
      });

      if (!response.ok) {
        throw await readApiResponseError(response, intl.formatMessage(messages.teamsLoadError));
      }

      const body = await response.json();
      return body.teams.map((team) => ({
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
