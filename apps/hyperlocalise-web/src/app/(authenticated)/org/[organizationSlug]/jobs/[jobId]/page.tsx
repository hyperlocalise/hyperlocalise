import { JobDetailPageContent } from "./_components/job-detail-page-content";

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ organizationSlug: string; jobId: string }>;
}) {
  const { organizationSlug, jobId } = await params;

  return <JobDetailPageContent jobId={jobId} organizationSlug={organizationSlug} />;
}
