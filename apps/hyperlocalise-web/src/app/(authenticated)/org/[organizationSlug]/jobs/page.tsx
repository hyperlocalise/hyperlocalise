import { JobsPageContent } from "@/components/app/jobs-page-content";

export default async function JobsPage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;

  return <JobsPageContent organizationSlug={organizationSlug} />;
}
