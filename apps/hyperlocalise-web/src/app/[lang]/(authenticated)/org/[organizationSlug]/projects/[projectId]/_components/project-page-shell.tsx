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
import { useEffect, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";

import { goSvcErrorMessage } from "@/lib/go-svc/go-svc-error";
import { useGoSvcClient } from "@/lib/go-svc/use-go-svc-client";
import { cn } from "@/lib/primitives/cn";
import { apiClient } from "@/lib/api-client-instance";
import { parseProviderProjectId } from "@/lib/providers/jobs/tms-provider-resource-id";

import {
  PageHeader,
  WorkspacePageShell,
  type Icon,
} from "../../../_components/workspace-resource-shared";

import {
  mapProjectToListRow,
  type ApiProject,
  type ProjectListRow,
} from "../../_components/project-list";
import { recordRecentProjectVisit } from "../../_components/recent-projects";

export const translationProjectQueryKey = (organizationSlug: string, projectId: string) =>
  ["translation-project", organizationSlug, projectId] as const;

export async function fetchTranslationProjectRow(
  organizationSlug: string,
  projectId: string,
  goSvcClient: {
    project: {
      get: (organizationSlug: string, projectId: string) => Promise<{ project: ApiProject }>;
    };
  },
): Promise<ProjectListRow> {
  if (parseProviderProjectId(projectId)) {
    const response = await apiClient.api.orgs[":organizationSlug"].projects[":projectId"].$get({
      param: { organizationSlug, projectId },
    });
    if (response.status !== 200) {
      throw new Error(`Failed to load project (${response.status})`);
    }
    const body = await response.json();
    return mapProjectToListRow(body.project);
  }

  try {
    const body = await goSvcClient.project.get(organizationSlug, projectId);
    return mapProjectToListRow(body.project);
  } catch (error) {
    throw new Error(goSvcErrorMessage(error, "Failed to load project"), { cause: error });
  }
}

export function useProjectPageQuery(
  organizationSlug: string,
  projectId: string,
  options?: { enabled?: boolean },
) {
  const { client: goSvcClient } = useGoSvcClient();
  const query = useQuery({
    queryKey: translationProjectQueryKey(organizationSlug, projectId),
    enabled: options?.enabled ?? true,
    queryFn: () => fetchTranslationProjectRow(organizationSlug, projectId, goSvcClient),
  });

  useEffect(() => {
    if (query.isSuccess) {
      recordRecentProjectVisit(organizationSlug, projectId);
    }
  }, [organizationSlug, projectId, query.isSuccess]);

  return query;
}

export function ProjectPageShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <WorkspacePageShell className={className}>{children}</WorkspacePageShell>;
}

type ProjectSectionHeaderProps = {
  icon: Icon;
  section: string;
  actions?: ReactNode;
  meta?: ReactNode;
};

export function ProjectSectionHeader({ icon, section, actions, meta }: ProjectSectionHeaderProps) {
  return (
    <>
      <PageHeader icon={icon} title={section} actions={actions} />
      {meta}
    </>
  );
}

/** In-card section label — not TypographyH3 (avoids responsive display-heading scale). */
export function ProjectSectionTitle({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <h3 className={cn("text-sm font-medium text-foreground", className)}>{children}</h3>;
}
