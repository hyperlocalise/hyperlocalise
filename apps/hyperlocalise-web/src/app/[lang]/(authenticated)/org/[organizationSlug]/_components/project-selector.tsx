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
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { ArrowDown01Icon, FolderLibraryIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FormattedMessage, useIntl } from "react-intl";

import { PromptInputButton } from "@/components/ai-elements/prompt-input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";

import { resolveChatProjectLabel, type ChatProjectOption } from "./project-selector-model";
import { projectSelectorMessages as messages } from "./project-selector.messages";

type ProjectSelectorTriggerStyle = "button" | "prompt-input";

type ProjectSelectorTriggerProps = Omit<
  ComponentPropsWithoutRef<"button">,
  "children" | "className" | "disabled" | "style"
> & {
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  triggerStyle: ProjectSelectorTriggerStyle;
};

function ProjectSelectorTrigger({
  children,
  className,
  disabled,
  triggerStyle,
  ...props
}: ProjectSelectorTriggerProps) {
  if (triggerStyle === "prompt-input") {
    return (
      <PromptInputButton className={className} size="sm" disabled={disabled} {...props}>
        {children}
      </PromptInputButton>
    );
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={className}
      disabled={disabled}
      {...props}
    >
      {children}
    </Button>
  );
}

export function ProjectSelector({
  locked = false,
  lockedProjectName = null,
  onSelectProject,
  projects,
  projectsIsError,
  projectsIsLoading,
  selectedProjectId,
  triggerStyle,
}: {
  locked?: boolean;
  lockedProjectName?: string | null;
  onSelectProject: (projectId: string) => void;
  projects: ChatProjectOption[];
  projectsIsError: boolean;
  projectsIsLoading: boolean;
  selectedProjectId: string;
  triggerStyle: ProjectSelectorTriggerStyle;
}) {
  const intl = useIntl();
  const disabledTriggerClassName =
    triggerStyle === "prompt-input"
      ? "inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-sm font-medium text-muted-foreground"
      : "rounded-full px-2.5 text-muted-foreground";
  const interactiveTriggerClassName =
    triggerStyle === "prompt-input"
      ? "inline-flex h-8 max-w-56 items-center gap-1 rounded-full px-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/20 hover:text-foreground"
      : "rounded-full px-2.5 text-muted-foreground hover:bg-accent/20 hover:text-foreground";
  const singleProjectTriggerClassName =
    triggerStyle === "prompt-input"
      ? "inline-flex h-8 max-w-56 items-center gap-1 rounded-full px-2.5 text-sm font-medium text-muted-foreground"
      : "max-w-56 rounded-full px-2.5 text-muted-foreground";

  const selectedLabel = resolveChatProjectLabel({
    projects,
    projectId: selectedProjectId,
    fallbackName: lockedProjectName,
    placeholder: intl.formatMessage(messages.projectPlaceholder),
  });

  if (projectsIsLoading) {
    return (
      <ProjectSelectorTrigger
        triggerStyle={triggerStyle}
        className={disabledTriggerClassName}
        disabled
      >
        <HugeiconsIcon icon={FolderLibraryIcon} strokeWidth={1.8} className="size-4" />
        <Skeleton className="h-3.5 w-24 rounded-full bg-muted" />
      </ProjectSelectorTrigger>
    );
  }

  if (projectsIsError) {
    return (
      <ProjectSelectorTrigger
        triggerStyle={triggerStyle}
        className={disabledTriggerClassName}
        disabled
      >
        <HugeiconsIcon icon={FolderLibraryIcon} strokeWidth={1.8} className="size-4" />
        <FormattedMessage {...messages.projectsUnavailable} />
      </ProjectSelectorTrigger>
    );
  }

  if (projects.length === 0 && !selectedProjectId) {
    return (
      <ProjectSelectorTrigger
        triggerStyle={triggerStyle}
        className={disabledTriggerClassName}
        disabled
      >
        <HugeiconsIcon icon={FolderLibraryIcon} strokeWidth={1.8} className="size-4" />
        <FormattedMessage {...messages.noProjects} />
      </ProjectSelectorTrigger>
    );
  }

  if (locked || projects.length === 1) {
    return (
      <ProjectSelectorTrigger
        triggerStyle={triggerStyle}
        className={singleProjectTriggerClassName}
        disabled
      >
        <HugeiconsIcon icon={FolderLibraryIcon} strokeWidth={1.8} className="size-4 shrink-0" />
        <span className="truncate">{selectedLabel}</span>
      </ProjectSelectorTrigger>
    );
  }

  const tmsProjects = projects.filter((project) => project.source === "external_tms");
  const nativeProjects = projects.filter((project) => project.source === "native");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <ProjectSelectorTrigger
            triggerStyle={triggerStyle}
            className={interactiveTriggerClassName}
          >
            <HugeiconsIcon icon={FolderLibraryIcon} strokeWidth={1.8} className="size-4 shrink-0" />
            <span className="max-w-44 truncate">{selectedLabel}</span>
            <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={1.8} className="size-3.5 shrink-0" />
          </ProjectSelectorTrigger>
        }
      />
      <DropdownMenuContent className="min-w-64" align="end">
        {tmsProjects.length > 0 ? (
          <DropdownMenuGroup>
            <DropdownMenuLabel>
              <FormattedMessage {...messages.tmsGroup} />
            </DropdownMenuLabel>
            {tmsProjects.map((project) => (
              <DropdownMenuItem key={project.id} onClick={() => onSelectProject(project.id)}>
                <HugeiconsIcon icon={FolderLibraryIcon} strokeWidth={1.8} className="size-4" />
                <span className="min-w-0 flex-1 truncate">{project.name}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        ) : null}
        {nativeProjects.length > 0 ? (
          <DropdownMenuGroup>
            <DropdownMenuLabel>
              <FormattedMessage {...messages.nativeGroup} />
            </DropdownMenuLabel>
            {nativeProjects.map((project) => (
              <DropdownMenuItem key={project.id} onClick={() => onSelectProject(project.id)}>
                <HugeiconsIcon icon={FolderLibraryIcon} strokeWidth={1.8} className="size-4" />
                <span className="min-w-0 flex-1 truncate">{project.name}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
