"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/primitives/cn";
import { TmsProviderBrandMark } from "@/lib/providers/shared/tms-provider-brand-mark";

import type { ProjectListRow } from "./project-list";

export function ProjectAvatar({
  project,
  className,
  compact = false,
}: {
  project: Pick<ProjectListRow, "name" | "key" | "logoUrl" | "externalProviderKind" | "source">;
  className?: string;
  compact?: boolean;
}) {
  const sizeClass = compact ? "size-9 rounded-lg" : "size-10 rounded-lg";

  return (
    <span className={cn("relative shrink-0", className)}>
      <Avatar className={cn(sizeClass, "after:rounded-lg")}>
        {project.logoUrl ? (
          <AvatarImage src={project.logoUrl} alt="" className="rounded-lg object-cover" />
        ) : null}
        <AvatarFallback className="rounded-lg bg-background text-xs font-medium text-foreground">
          {project.key}
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
