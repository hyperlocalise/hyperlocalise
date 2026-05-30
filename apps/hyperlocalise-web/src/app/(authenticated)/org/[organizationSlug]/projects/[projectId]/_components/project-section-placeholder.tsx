import Link from "next/link";

import { Button } from "@/components/ui/button";
import { TypographyH1, TypographyP } from "@/components/ui/typography";
import { buildProjectPath } from "@/components/app-shell/navigation-config";

type ProjectSectionPlaceholderProps = {
  organizationSlug: string;
  projectId: string;
  title: string;
  description: string;
};

export function ProjectSectionPlaceholder({
  organizationSlug,
  projectId,
  title,
  description,
}: ProjectSectionPlaceholderProps) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="space-y-2">
        <TypographyH1 className="font-heading text-3xl font-semibold text-foreground md:text-4xl">
          {title}
        </TypographyH1>
        <TypographyP className="max-w-2xl text-sm leading-6 text-foreground/58">
          {description}
        </TypographyP>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          render={<Link href={buildProjectPath(organizationSlug, projectId, "files")} />}
        >
          Open files
        </Button>
        <Button
          variant="ghost"
          render={<Link href={buildProjectPath(organizationSlug, projectId, "jobs")} />}
        >
          View jobs
        </Button>
      </div>
    </div>
  );
}
