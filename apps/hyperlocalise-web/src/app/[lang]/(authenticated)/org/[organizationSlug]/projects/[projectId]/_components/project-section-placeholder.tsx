"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
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
