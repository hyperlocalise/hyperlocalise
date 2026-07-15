import { requireAppAuthContext } from "@/lib/workos/app-auth";
import { isReleaseCatAllFilesEnabled } from "@/lib/flags/release-flags";
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
    sourcePaths?: string;
    targetLocale?: string;
    segment?: string;
    queueFilter?: string;
  }>;
}) {
  const { organizationSlug, projectId, jobId } = await params;
  const { sourcePath, storedFileId, sourcePaths, targetLocale, segment, queueFilter } =
    await searchParams;
  const auth = await requireAppAuthContext({ organizationSlug });
  const catAllFilesEnabled = await isReleaseCatAllFilesEnabled();

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
      sourcePaths={sourcePaths ?? null}
      targetLocale={targetLocale ?? null}
      initialSegmentKey={segment ?? null}
      initialQueueFilter={initialQueueFilter}
      catAllFilesEnabled={catAllFilesEnabled}
    />
  );
}
