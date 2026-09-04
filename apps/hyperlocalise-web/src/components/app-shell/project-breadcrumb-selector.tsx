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
import { buildProjectPath } from "./navigation-config";

const organizationProjectsQueryKey = (organizationSlug: string) =>
  ["translation-projects", organizationSlug, "breadcrumb"] as const;

type ProjectBreadcrumbSelectorProps = {
  organizationSlug: string;
  projectId: string;
  projectName: string;
  section: string | null;
  isLast?: boolean;
};

export function ProjectBreadcrumbSelector({
  organizationSlug,
  projectId,
  projectName,
  section,
  isLast = false,
}: ProjectBreadcrumbSelectorProps) {
  const intl = useIntl();
  const router = useRouter();
  const projectsQuery = useQuery({
    queryKey: organizationProjectsQueryKey(organizationSlug),
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].projects.$get({
        param: { organizationSlug },
      });

      if (response.status !== 200) {
        throw await readApiResponseError(response, intl.formatMessage(messages.projectsLoadError));
      }

      const body = await response.json();
      return body.projects.map((project) => ({
        value: project.id,
        label: project.name,
      }));
    },
  });

  function handleSelect(nextProjectId: string) {
    if (nextProjectId === projectId) {
      return;
    }

    const nextPath = section
      ? buildProjectPath(organizationSlug, nextProjectId, section)
      : buildProjectPath(organizationSlug, nextProjectId);
    router.push(nextPath);
  }

  return (
    <BreadcrumbCrumbSelector
      value={projectId}
      label={projectName}
      options={projectsQuery.data ?? []}
      onSelect={handleSelect}
      isLoading={projectsQuery.isPending}
      isError={projectsQuery.isError}
      menuLabel={intl.formatMessage(messages.switchProject)}
      isLast={isLast}
    />
  );
}
