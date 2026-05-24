import { Suspense } from "react";

import { ProjectsPageContent } from "./_components/projects-page-content";

export default async function ProjectsPage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;

  return (
    <Suspense fallback={null}>
      <ProjectsPageContent organizationSlug={organizationSlug} />
    </Suspense>
  );
}
