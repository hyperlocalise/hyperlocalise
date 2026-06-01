import { Suspense } from "react";

import { TypographyP } from "@/components/ui/typography";

import { ProjectFilesPageContent } from "./_components/project-files-page-content";

export default async function ProjectFilesPage({
  params,
}: {
  params: Promise<{ organizationSlug: string; projectId: string }>;
}) {
  const { organizationSlug, projectId } = await params;

  return (
    <Suspense
      fallback={<TypographyP className="text-sm text-foreground/52">Loading files...</TypographyP>}
    >
      <ProjectFilesPageContent organizationSlug={organizationSlug} projectId={projectId} />
    </Suspense>
  );
}
