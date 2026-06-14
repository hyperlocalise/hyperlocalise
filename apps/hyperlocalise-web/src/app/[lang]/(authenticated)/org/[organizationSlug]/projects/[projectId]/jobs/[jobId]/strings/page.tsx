import { requireAppAuthContext } from "@/lib/workos/app-auth";

import { JobCatPageContent } from "./_components/job-cat-page-content";

export default async function ProjectJobStringsPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationSlug: string; projectId: string; jobId: string }>;
  searchParams: Promise<{ sourcePath?: string; targetLocale?: string }>;
}) {
  const { organizationSlug, projectId, jobId } = await params;
  const { sourcePath, targetLocale } = await searchParams;
  await requireAppAuthContext({ organizationSlug });

  return (
    <JobCatPageContent
      organizationSlug={organizationSlug}
      projectId={projectId}
      jobId={jobId}
      sourcePath={sourcePath ?? null}
      targetLocale={targetLocale ?? null}
    />
  );
}
