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
import { useIntl } from "react-intl";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { useTmsLiveProjects } from "../_hooks/use-tms-live-projects";
import { tmsLiveProjectPickerMessages as messages } from "./tms-live-project-picker.messages";
import { WorkspaceFilterField, workspaceFilterTriggerClassName } from "./workspace-resource-shared";

export function TmsLiveProjectPicker({
  organizationSlug,
  value,
  onValueChange,
  disabled = false,
}: {
  organizationSlug: string;
  value: string;
  onValueChange: (externalProjectId: string) => void;
  disabled?: boolean;
}) {
  const intl = useIntl();
  const tmsProjectsQuery = useTmsLiveProjects(organizationSlug);
  const projects = (tmsProjectsQuery.data ?? []).filter(
    (project) => project.isActive !== false && project.externalProjectId,
  );
  const projectItems = projects.map((project) => ({
    value: project.externalProjectId!,
    label: project.name,
  }));

  return (
    <WorkspaceFilterField
      label={intl.formatMessage(messages.fieldLabel)}
      className="w-full sm:max-w-sm"
    >
      <Select
        value={value || null}
        items={projectItems}
        onValueChange={(nextValue) => onValueChange(nextValue ?? "")}
        disabled={disabled || tmsProjectsQuery.isLoading}
      >
        <SelectTrigger className={workspaceFilterTriggerClassName}>
          <SelectValue
            placeholder={
              tmsProjectsQuery.isLoading
                ? intl.formatMessage(messages.loadingProjects)
                : intl.formatMessage(messages.selectProject)
            }
          />
        </SelectTrigger>
        <SelectContent>
          {projects.map((project) => (
            <SelectItem
              key={project.externalProjectId!}
              value={project.externalProjectId!}
              label={project.name}
            >
              {project.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </WorkspaceFilterField>
  );
}
