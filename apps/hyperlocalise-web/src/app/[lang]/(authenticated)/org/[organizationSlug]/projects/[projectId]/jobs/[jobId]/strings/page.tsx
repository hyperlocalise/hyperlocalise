import { requireAppAuthContext } from "@/lib/workos/app-auth";
import { resolveJobCatInitialQueueFilter } from "@/lib/projects/resolve-job-cat-initial-queue-filter";

import { JobCatPageContent } from "./_components/job-cat-page-content";

export default async function ProjectJobStringsPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationSlug: string; projectId: string; jobId: string }>;
  searchParams: Promise<{
    sourcePath?: string;
    storedFileId?: string;
    targetLocale?: string;
    segment?: string;
    queueFilter?: string;
  }>;
}) {
  const { organizationSlug, projectId, jobId } = await params;
  const { sourcePath, storedFileId, targetLocale, segment, queueFilter } = await searchParams;
  const auth = await requireAppAuthContext({ organizationSlug });

  const initialQueueFilter = await resolveJobCatInitialQueueFilter({
    auth,
    jobId,
    queueFilterParam: queueFilter,
  });

  return (
    <JobCatPageContent
      organizationSlug={organizationSlug}
      projectId={projectId}
      jobId={jobId}
      sourcePath={sourcePath ?? null}
      storedFileId={storedFileId ?? null}
      targetLocale={targetLocale ?? null}
      initialSegmentKey={segment ?? null}
      initialQueueFilter={initialQueueFilter}
    />
  );
}
