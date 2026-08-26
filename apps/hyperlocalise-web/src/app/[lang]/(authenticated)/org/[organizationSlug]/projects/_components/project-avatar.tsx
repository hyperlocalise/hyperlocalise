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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/primitives/cn";
import { TmsProviderBrandMark } from "@/lib/providers/shared/tms-provider-brand-mark";

import type { ProjectListRow } from "./project-list";

/** Max chars shown in the avatar fallback so long names do not overflow. */
export const PROJECT_AVATAR_KEY_MAX_LENGTH = 3;

const PROJECT_AVATAR_FALLBACK = "PRJ";

/** Derive a short avatar label from the project display name. */
export function projectAvatarLabelFromName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    return PROJECT_AVATAR_FALLBACK;
  }

  const initials = trimmed
    .split(/[\s/_-]+/)
    .map((part) => part.replace(/[^A-Za-z0-9]/g, "")[0])
    .filter(Boolean)
    .join("")
    .toUpperCase();

  if (initials.length >= 2) {
    return initials.slice(0, PROJECT_AVATAR_KEY_MAX_LENGTH);
  }

  const letters = trimmed
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, PROJECT_AVATAR_KEY_MAX_LENGTH);

  return letters || PROJECT_AVATAR_FALLBACK;
}

export function ProjectAvatar({
  project,
  className,
  compact = false,
}: {
  project: Pick<ProjectListRow, "name" | "logoUrl" | "externalProviderKind" | "source">;
  className?: string;
  compact?: boolean;
}) {
  const sizeClass = compact ? "size-9 rounded-lg" : "size-10 rounded-lg";
  const avatarLabel = projectAvatarLabelFromName(project.name);

  return (
    <span className={cn("relative shrink-0", className)}>
      <Avatar className={cn(sizeClass, "after:rounded-lg")} title={project.name}>
        {project.logoUrl ? (
          <AvatarImage src={project.logoUrl} alt="" className="rounded-lg object-cover" />
        ) : null}
        <AvatarFallback className="overflow-hidden rounded-lg bg-background text-xs font-medium text-foreground">
          {avatarLabel}
        </AvatarFallback>
      </Avatar>
      {project.source === "external_tms" && project.externalProviderKind ? (
        <span className="absolute -right-1 -bottom-1 rounded-md border border-border bg-background p-0.5 shadow-sm">
          <TmsProviderBrandMark
            providerKind={project.externalProviderKind}
            compact
            colored
            className="size-4 rounded-md border-0 bg-transparent p-0"
          />
        </span>
      ) : null}
    </span>
  );
}
