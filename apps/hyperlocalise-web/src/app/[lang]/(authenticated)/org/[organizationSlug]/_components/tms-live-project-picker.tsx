"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { useTmsLiveProjects } from "../_hooks/use-tms-live-projects";
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
  const tmsProjectsQuery = useTmsLiveProjects(organizationSlug);
  const projects = (tmsProjectsQuery.data ?? []).filter(
    (project) => project.isActive !== false && project.externalProjectId,
  );

  return (
    <WorkspaceFilterField label="TMS project" className="w-full sm:max-w-sm">
      <Select
        value={value || null}
        onValueChange={(nextValue) => onValueChange(nextValue ?? "")}
        disabled={disabled || tmsProjectsQuery.isLoading}
      >
        <SelectTrigger className={workspaceFilterTriggerClassName}>
          <SelectValue
            placeholder={tmsProjectsQuery.isLoading ? "Loading projects…" : "Select a project"}
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
