"use client";

import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";

import { cn } from "@/lib/primitives/cn";
import { apiClient } from "@/lib/api-client-instance";

import {
  PageHeader,
  WorkspacePageShell,
  type Icon,
} from "../../../_components/workspace-resource-shared";

import { mapProjectToListRow } from "../../_components/project-list";

export function useProjectPageQuery(
  organizationSlug: string,
  projectId: string,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: ["translation-project", organizationSlug, projectId],
    enabled: options?.enabled ?? true,
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].projects[":projectId"].$get({
        param: { organizationSlug, projectId },
      });
      if (response.status !== 200) {
        throw new Error(`Failed to load project (${response.status})`);
      }
      const body = await response.json();
      return mapProjectToListRow(body.project);
    },
  });
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
  description: string;
  actions?: ReactNode;
  meta?: ReactNode;
};

export function ProjectSectionHeader({
  icon,
  section,
  description,
  actions,
  meta,
}: ProjectSectionHeaderProps) {
  return (
    <div className="space-y-3">
      <PageHeader icon={icon} title={section} description={description} actions={actions} />
      {meta}
    </div>
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
