import { Suspense } from "react";

import { TypographyP } from "@/components/ui/typography";
import { requireAppAuthContext } from "@/lib/workos/app-auth";

import { ProjectFilesPageContent } from "./_components/project-files-page-content";

export default async function ProjectFilesPage({
  params,
}: {
  params: Promise<{ organizationSlug: string; projectId: string }>;
}) {
  const { organizationSlug, projectId } = await params;
  await requireAppAuthContext({ organizationSlug });

  return (
    <Suspense
      fallback={
        <TypographyP className="text-sm text-muted-foreground">Loading files...</TypographyP>
      }
    >
      <ProjectFilesPageContent organizationSlug={organizationSlug} projectId={projectId} />
    </Suspense>
  );
}
