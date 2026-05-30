import { Suspense } from "react";

import { JobsPageContent } from "../../../jobs/_components/jobs-page-content";

export default async function ProjectJobsPage({
  params,
}: {
  params: Promise<{ organizationSlug: string; projectId: string }>;
}) {
  const { organizationSlug, projectId } = await params;

  return (
    <Suspense fallback={null}>
      <JobsPageContent organizationSlug={organizationSlug} projectId={projectId} />
    </Suspense>
  );
}
