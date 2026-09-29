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

import { goSvcErrorMessage } from "@/lib/go-svc/go-svc-error";
import { useGoSvcClient } from "@/lib/go-svc/use-go-svc-client";
import { useOrgRouter } from "@/lib/navigation/use-org-router";

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
  const router = useOrgRouter();
  const { client: goSvcClient } = useGoSvcClient();
  const projectsQuery = useQuery({
    queryKey: organizationProjectsQueryKey(organizationSlug),
    queryFn: async () => {
      try {
        const body = await goSvcClient.project.list(organizationSlug);
        return body.projects.map((project) => ({
          value: project.id,
          label: project.name,
        }));
      } catch (error) {
        throw new Error(goSvcErrorMessage(error, intl.formatMessage(messages.projectsLoadError)), {
          cause: error,
        });
      }
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
