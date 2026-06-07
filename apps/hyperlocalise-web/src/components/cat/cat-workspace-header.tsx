"use client";

import { LinkSquare02Icon, RefreshIcon, SparklesIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";

export function CatWorkspaceHeader({
  breadcrumbs,
  externalLinkLabel = "Open in Crowdin",
  onRefresh,
  onOpenExternal,
  onRunWithAgent,
}: {
  breadcrumbs?: string[];
  externalLinkLabel?: string;
  onRefresh?: () => void;
  onOpenExternal?: () => void;
  onRunWithAgent?: () => void;
}) {
  const trail = breadcrumbs ?? ["Project", "HL-Test", "Jobs", "Translate to Vietnamese"];

  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-foreground/8 bg-background px-4 py-3">
      <Breadcrumb>
        <BreadcrumbList>
          {trail.map((crumb, index) => {
            const isLast = index === trail.length - 1;

            return (
              <BreadcrumbItem key={`${crumb}-${index}`}>
                {index > 0 ? <BreadcrumbSeparator /> : null}
                {isLast ? (
                  <BreadcrumbPage>{crumb}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink href="#">{crumb}</BreadcrumbLink>
                )}
              </BreadcrumbItem>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-wrap items-center gap-2">
        {onOpenExternal ? (
          <Button variant="outline" size="sm" onClick={onOpenExternal}>
            {externalLinkLabel}
            <HugeiconsIcon icon={LinkSquare02Icon} className="size-4" />
          </Button>
        ) : null}
        {onRefresh ? (
          <Button variant="outline" size="sm" onClick={onRefresh}>
            Refresh
            <HugeiconsIcon icon={RefreshIcon} className="size-4" />
          </Button>
        ) : null}
        {onRunWithAgent ? (
          <Button
            size="sm"
            className="bg-spruce-500 text-white hover:bg-spruce-400"
            onClick={onRunWithAgent}
          >
            Run with agent
            <HugeiconsIcon icon={SparklesIcon} className="size-4" />
          </Button>
        ) : null}
      </div>
    </header>
  );
}
