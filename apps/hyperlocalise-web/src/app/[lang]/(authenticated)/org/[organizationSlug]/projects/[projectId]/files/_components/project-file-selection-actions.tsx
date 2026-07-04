"use client";

import Link from "next/link";
import { ListIcon } from "lucide-react";

import type { ProjectFileRecord } from "@/api/routes/project/project.schema";
import { Button } from "@/components/ui/button";
import { TypographyP } from "@/components/ui/typography";
import {
  buildProjectFileCatHref,
  canOpenProjectFileCat,
} from "@/lib/projects/project-file-cat-routing";

export function ProjectFileSelectionActions({
  organizationSlug,
  projectId,
  file,
  highlightLocale,
  layout = "default",
}: {
  organizationSlug: string;
  projectId: string;
  file: ProjectFileRecord;
  highlightLocale: string | null;
  layout?: "default" | "compact";
}) {
  const canOpenCat = canOpenProjectFileCat(file);
  const catHref = buildProjectFileCatHref(organizationSlug, projectId, file, highlightLocale);

  if (layout === "compact") {
    return (
      <Button
        type="button"
        size="sm"
        className="shrink-0"
        disabled={!canOpenCat || !catHref}
        render={canOpenCat && catHref ? <Link href={catHref} /> : undefined}
      >
        <ListIcon />
        View strings
      </Button>
    );
  }

  return (
    <div className="flex shrink-0 flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <TypographyP className="truncate font-mono text-sm text-foreground">
          {file.sourcePath}
        </TypographyP>
        <TypographyP className="text-xs text-muted-foreground">
          {canOpenCat
            ? "Open this file in the CAT workspace to review and edit translations."
            : "The CAT workspace is not available for this file yet."}
        </TypographyP>
      </div>
      <Button
        type="button"
        size="sm"
        className="w-full shrink-0 sm:w-fit"
        disabled={!canOpenCat || !catHref}
        render={canOpenCat && catHref ? <Link href={catHref} /> : undefined}
      >
        <ListIcon />
        View strings
      </Button>
    </div>
  );
}
