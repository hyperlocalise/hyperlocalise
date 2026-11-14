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
import { PlusIcon, XIcon } from "@phosphor-icons/react";

import { OrgNavLink } from "@/components/app-shell/org-nav-link";
import { Spinner } from "@/components/ui/spinner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type ProjectChip = {
  id: string;
  name: string;
  href?: string | null;
  external?: boolean;
};

/**
 * "Used in" row for a glossary or dictionary header: the projects it is
 * assigned to as removable chips, plus an "Assign project" menu.
 */
export function ProjectChips({
  projects,
  assignable,
  loaded,
  canManage,
  assigning,
  removing,
  onAssign,
  onRemove,
  labels,
}: {
  projects: ProjectChip[];
  assignable: ProjectChip[];
  loaded: boolean;
  canManage: boolean;
  assigning?: boolean;
  removing?: boolean;
  onAssign: (projectId: string) => void;
  onRemove: (projectId: string) => void;
  labels: {
    usedIn: string;
    empty: string;
    assign: string;
    noAssignable: string;
    remove: (name: string) => string;
  };
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="me-1 text-xs text-muted-foreground">{labels.usedIn}</span>
      {projects.map((project) => (
        <span
          key={project.id}
          className="inline-flex h-7 items-center gap-1 rounded-full border border-border bg-muted/30 ps-2.5 pe-1 text-xs font-medium text-foreground"
        >
          {project.href ? (
            project.external ? (
              <a href={project.href} target="_blank" rel="noreferrer" className="hover:underline">
                {project.name}
              </a>
            ) : (
              <OrgNavLink href={project.href} className="hover:underline">
                {project.name}
              </OrgNavLink>
            )
          ) : (
            project.name
          )}
          {canManage ? (
            <button
              type="button"
              aria-label={labels.remove(project.name)}
              disabled={removing}
              onClick={() => onRemove(project.id)}
              className="inline-flex size-5 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <XIcon className="size-3" weight="bold" />
            </button>
          ) : (
            <span className="pe-1.5" />
          )}
        </span>
      ))}
      {loaded && projects.length === 0 ? (
        <span className="text-xs text-muted-foreground">{labels.empty}</span>
      ) : null}
      {canManage ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            disabled={assigning}
            className="inline-flex h-7 items-center gap-1 rounded-full border border-dashed border-border px-2.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50"
          >
            {assigning ? (
              <Spinner className="size-3" />
            ) : (
              <PlusIcon className="size-3" weight="bold" />
            )}
            {labels.assign}
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {assignable.length > 0 ? (
              assignable.map((project) => (
                <DropdownMenuItem key={project.id} onClick={() => onAssign(project.id)}>
                  {project.name}
                </DropdownMenuItem>
              ))
            ) : (
              <DropdownMenuItem disabled>{labels.noAssignable}</DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}
