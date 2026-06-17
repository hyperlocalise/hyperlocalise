import { hasCapability } from "@/api/auth/policy";
import { normalizeProjectId } from "@/lib/projects/identity/project-id";
import { requireAppAuthContext } from "@/lib/workos/app-auth";

import { JobDetailPageContent } from "./_components/job-detail-page-content";

export default async function ProjectJobDetailPage({
  params,
}: {
  params: Promise<{ organizationSlug: string; projectId: string; jobId: string }>;
}) {
  const { organizationSlug, projectId: rawProjectId, jobId } = await params;
  const projectId = normalizeProjectId(rawProjectId);
  const auth = await requireAppAuthContext({ organizationSlug });
  const canEditProviderJobDescription =
    auth.membership.role === "admin" ||
    (auth.membership.role === "localization_manager" &&
      hasCapability(auth.membership.role, "jobs:write"));

  return (
    <JobDetailPageContent
      jobId={jobId}
      organizationSlug={organizationSlug}
      projectId={projectId}
      canEditProviderJobDescription={canEditProviderJobDescription}
    />
  );
}
