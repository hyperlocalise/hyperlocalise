import { Suspense } from "react";

import { JobsPageContent } from "./_components/jobs-page-content";

export default async function JobsPage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;

  return (
    <Suspense fallback={null}>
      <JobsPageContent organizationSlug={organizationSlug} />
    </Suspense>
  );
}
