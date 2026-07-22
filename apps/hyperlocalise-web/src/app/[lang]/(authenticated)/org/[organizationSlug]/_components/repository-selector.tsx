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
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FormattedMessage, useIntl } from "react-intl";
import { siGithub } from "simple-icons";

import { PromptInputButton } from "@/components/ai-elements/prompt-input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";

import { SimpleBrandIcon } from "../integrations/_components/simple-brand-icon";
import type { GithubRepository } from "./github-repository";
import { repositorySelectorMessages as messages } from "./repository-selector.messages";

type RepositorySelectorTriggerStyle = "button" | "prompt-input";

type RepositorySelectorTriggerProps = Omit<
  ComponentPropsWithoutRef<"button">,
  "children" | "className" | "disabled" | "style"
> & {
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  triggerStyle: RepositorySelectorTriggerStyle;
};

function RepositorySelectorTrigger({
  children,
  className,
  disabled,
  triggerStyle,
  ...props
}: RepositorySelectorTriggerProps) {
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

export function RepositorySelector({
  onSelectRepository,
  repositories,
  repositoriesIsError,
  repositoriesIsLoading,
  selectedRepositoryFullName,
  triggerStyle,
}: {
  onSelectRepository: (fullName: string) => void;
  repositories: GithubRepository[];
  repositoriesIsError: boolean;
  repositoriesIsLoading: boolean;
  selectedRepositoryFullName: string;
  triggerStyle: RepositorySelectorTriggerStyle;
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
  const singleRepositoryTriggerClassName =
    triggerStyle === "prompt-input"
      ? "inline-flex h-8 max-w-56 items-center gap-1 rounded-full px-2.5 text-sm font-medium text-muted-foreground"
      : "max-w-56 rounded-full px-2.5 text-muted-foreground";

  if (repositoriesIsLoading) {
    return (
      <RepositorySelectorTrigger
        triggerStyle={triggerStyle}
        className={disabledTriggerClassName}
        disabled
      >
        <SimpleBrandIcon icon={siGithub} colored className="size-4" />
        <Skeleton className="h-3.5 w-24 rounded-full bg-muted" />
      </RepositorySelectorTrigger>
    );
  }

  if (repositoriesIsError) {
    return (
      <RepositorySelectorTrigger
        triggerStyle={triggerStyle}
        className={disabledTriggerClassName}
        disabled
      >
        <SimpleBrandIcon icon={siGithub} colored className="size-4" />
        <FormattedMessage {...messages.reposUnavailable} />
      </RepositorySelectorTrigger>
    );
  }

  if (repositories.length === 0) {
    return (
      <RepositorySelectorTrigger
        triggerStyle={triggerStyle}
        className={disabledTriggerClassName}
        disabled
      >
        <SimpleBrandIcon icon={siGithub} colored className="size-4" />
        <FormattedMessage {...messages.noGithubRepos} />
      </RepositorySelectorTrigger>
    );
  }

  if (repositories.length === 1) {
    return (
      <RepositorySelectorTrigger
        triggerStyle={triggerStyle}
        className={singleRepositoryTriggerClassName}
        disabled
      >
        <SimpleBrandIcon icon={siGithub} colored className="size-4 shrink-0" />
        <span className="truncate">{repositories[0]?.fullName}</span>
      </RepositorySelectorTrigger>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <RepositorySelectorTrigger
            triggerStyle={triggerStyle}
            className={interactiveTriggerClassName}
          >
            <SimpleBrandIcon icon={siGithub} colored className="size-4 shrink-0" />
            <span className="max-w-44 truncate">
              {selectedRepositoryFullName || intl.formatMessage(messages.githubRepoPlaceholder)}
            </span>
            <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={1.8} className="size-3.5 shrink-0" />
          </RepositorySelectorTrigger>
        }
      />
      <DropdownMenuContent className="min-w-64" align="end">
        <DropdownMenuGroup>
          {repositories.map((repository) => (
            <DropdownMenuItem
              key={repository.id}
              onClick={() => onSelectRepository(repository.fullName)}
            >
              <SimpleBrandIcon icon={siGithub} colored className="size-4" />
              <span className="min-w-0 flex-1 truncate">{repository.fullName}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
