import { Suspense } from "react";

import { ProjectOverviewPageContent } from "./_components/project-overview-page-content";
import { TypographyP } from "@/components/ui/typography";

export default async function ProjectOverviewPage({
  params,
}: {
  params: Promise<{ organizationSlug: string; projectId: string }>;
}) {
  const { organizationSlug, projectId } = await params;

  return (
    <Suspense
      fallback={<TypographyP className="text-sm text-foreground/52">Loading project…</TypographyP>}
    >
      <ProjectOverviewPageContent organizationSlug={organizationSlug} projectId={projectId} />
    </Suspense>
  );
}
