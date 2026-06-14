"use client";

import { Layers01Icon } from "@hugeicons/core-free-icons";

import type { Icon } from "../../../_components/workspace-resource-shared";

import { ProjectPageShell, ProjectSectionHeader } from "./project-page-shell";

type ProjectSectionPlaceholderProps = {
  organizationSlug: string;
  projectId: string;
  title: string;
  description: string;
  icon?: Icon;
};

export function ProjectSectionPlaceholder({
  organizationSlug: _organizationSlug,
  projectId: _projectId,
  title,
  description,
  icon = Layers01Icon,
}: ProjectSectionPlaceholderProps) {
  return (
    <ProjectPageShell>
      <ProjectSectionHeader icon={icon} section={title} description={description} />
    </ProjectPageShell>
  );
}
